import { base64urlEncode, base64urlDecode } from './crypto';
import { isSupabaseConfigured, isSupabaseKeyValid } from '../config/supabase';

// In-memory mock DB store when Supabase credentials are missing (local single-tab demo)
// Note: In cross-device production, Supabase PostgreSQL is used.
const memoryDB = new Map();

/**
 * Hashes a string using SHA-256 and returns a base64url encoded string.
 */
export async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateToken() {
  const randomBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const hashArray = Array.from(randomBytes);
  const token = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const tokenHash = await hashString(token);
  return { token, tokenHash };
}


export async function createSession({ totalFiles, totalBytes, oneReceiverMode = true, patternHash = null }) {
  try {
    const { token, tokenHash } = await generateToken();
    const expiresAt = new Date(Date.now() + 120 * 1000).toISOString(); 
    
    if (!isSupabaseConfigured || !isSupabaseKeyValid) {
      const missingConfigErr = new Error(
        'Invalid or missing Supabase API Key (VITE_SUPABASE_ANON_KEY). ' +
        'Please check your .env.local file and ensure standard Supabase credentials are provided.'
      );
      console.error('[SessionManager]', missingConfigErr);
      return { session: null, token: null, error: missingConfigErr };
    }

    const insertPayload = {
      token_hash: tokenHash,
      pattern_hash: patternHash,
      status: 'WAITING',
      expires_at: expiresAt,
      one_receiver_mode: oneReceiverMode,
      total_files: totalFiles,
      total_bytes: totalBytes,
      uploaded_bytes: 0,
      downloaded_bytes: 0,
      receiver_connected: false
    };

    const { supabase } = await import('../config/supabase');
    const { data: session, error } = await supabase
      .from('transfer_sessions')
      .insert(insertPayload)
      .select()
      .single();
      
    if (error) {
      console.error('[SessionManager] Supabase INSERT error object:', error);
      console.error('[SessionManager] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        payloadKeys: Object.keys(insertPayload)
      });
      const errorMsg = error.message || error.details || 'Network/RLS error';
      const errorCode = error.code ? ` (Code: ${error.code})` : '';
      throw new Error(`Database INSERT failed: ${errorMsg}${errorCode}`);
    }
    
    console.log('[SessionManager] Session created successfully in database:', session.id);
    return { session, token, error: null };
  } catch (error) {
    console.error('[SessionManager] Full exception during createSession:', error);
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      console.error('[SessionManager] Network connection to Supabase failed. Check if VITE_SUPABASE_URL is correct, reachable, and DNS resolves.');
    }
    return { session: null, token: null, error };
  }
}


export async function getSessionByToken(token) {
  try {
    if (!token) return { session: null, error: new Error('No token provided') };

    // Clean token string (remove hash fragment if accidentally passed)
    const cleanToken = token.split('#')[0].trim();
    const tokenHash = await hashString(cleanToken);
    
    if (!isSupabaseConfigured) {
      return { session: null, error: new Error('Supabase environment variables missing in Vercel.') };
    }



    const { supabase } = await import('../config/supabase');
    const { data: session, error } = await supabase
      .from('transfer_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .single();
      
    if (error) {
      console.error('[SessionManager] Supabase session SELECT error:', error);
      if (error.code === 'PGRST116') { // PostgreSQL code for 0 rows returned
        return { session: null, error: new Error('NOT_FOUND') };
      }
      if (error.code === '42501') { // RLS permission denied
        return { session: null, error: new Error('PERMISSION_ERROR: RLS blocked query') };
      }
      return { session: null, error: new Error(`DATABASE_ERROR: ${error.message}`) };
    }

    // Check expiration only if receiver has not yet connected
    const isExpired = new Date(session.expires_at).getTime() < Date.now();
    if (isExpired && !session.receiver_connected && session.status !== 'CONNECTED' && session.status !== 'TRANSFERRING' && session.status !== 'COMPLETED') {
      console.warn('[SessionManager] Session expired:', session.id);
      return { session, isExpired: true, error: new Error('EXPIRED') };
    }

    return { session, isExpired: false, error: null };
  } catch (error) {
    console.error('[SessionManager] getSessionByToken exception:', error);
    return { session: null, error };
  }
}

export async function getSessionByPattern(patternHash) {
  try {
    if (!patternHash) return { session: null, error: new Error('No pattern provided') };

    if (!isSupabaseConfigured) {
      return { session: null, error: new Error('Supabase environment variables missing.') };
    }

    const { supabase } = await import('../config/supabase');
    const now = new Date().toISOString();
    
    const { data: sessions, error } = await supabase
      .from('transfer_sessions')
      .select('*')
      .eq('pattern_hash', patternHash)
      .eq('status', 'WAITING')
      .eq('receiver_connected', false)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[SessionManager] Supabase session SELECT by pattern error:', error);
      return { session: null, error: new Error(`DATABASE_ERROR: ${error.message}`) };
    }

    if (!sessions || sessions.length === 0) {
      return { session: null, error: new Error('NOT_FOUND') };
    }

    return { session: sessions[0], error: null };
  } catch (error) {
    console.error('[SessionManager] getSessionByPattern exception:', error);
    return { session: null, error };
  }
}


export async function updateSession(sessionId, updates) {
  try {
    if (!isSupabaseConfigured) {
      for (const [key, session] of memoryDB.entries()) {
        if (session.id === sessionId) {
          const updated = { ...session, ...updates };
          memoryDB.set(key, updated);
          return { session: updated, error: null };
        }
      }
      return { session: null, error: new Error('Session not found') };
    }

    const { supabase } = await import('../config/supabase');
    const { data: session, error } = await supabase
      .from('transfer_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single();
      
    if (error) {
      console.error('[SessionManager] Supabase session update error:', error);
      throw error;
    }
    return { session, error: null };
  } catch (error) {
    console.error('[SessionManager] updateSession exception:', error);
    return { session: null, error };
  }
}

export async function connectReceiver(token) {
  try {
    const { session, isExpired, error: getError } = await getSessionByToken(token);
    if (getError || !session) {
      console.error('[SessionManager] connectReceiver session lookup failed:', getError);
      throw getError || new Error('NOT_FOUND');
    }

    if (isExpired) {
      throw new Error('EXPIRED');
    }
    
    if (session.status === 'CANCELLED' || session.status === 'EXPIRED') {
      throw new Error(session.status);
    }
    
    const credentialBytes = window.crypto.getRandomValues(new Uint8Array(32));
    const receiverCredential = base64urlEncode(credentialBytes);
    const credentialHash = await hashString(receiverCredential);
    
    const updates = {
      receiver_connected: true,
      receiver_connected_at: new Date().toISOString(),
      status: 'CONNECTED',
      receiver_credential_hash: credentialHash
    };
    
    const { session: updatedSession, error: updateError } = await updateSession(session.id, updates);
    if (updateError) throw updateError;
    
    console.log('[SessionManager] Receiver claimed session successfully:', session.id);
    return { session: updatedSession, receiverCredential, error: null };
  } catch (error) {
    console.error('[SessionManager] connectReceiver failed:', error.message);
    return { session: null, receiverCredential: null, error };
  }
}

export async function validateReceiverCredential(token, credential) {
  try {
    const { session, error: getError } = await getSessionByToken(token);
    if (getError || !session) throw new Error('Session not found');
    
    const credentialHash = await hashString(credential);
    const valid = session.receiver_credential_hash === credentialHash;
    
    return { valid, session: valid ? session : null, error: null };
  } catch (error) {
    return { valid: false, session: null, error };
  }
}

export async function expireSession(sessionId) {
  return updateSession(sessionId, { status: 'EXPIRED' });
}

export async function cancelSession(sessionId) {
  return updateSession(sessionId, { status: 'CANCELLED' });
}

export async function completeSession(sessionId) {
  return updateSession(sessionId, { status: 'COMPLETED' });
}

export async function findExpiredSessions() {
  try {
    const now = new Date().toISOString();
    if (!isSupabaseConfigured) {
      const sessions = Array.from(memoryDB.values()).filter(s => s.expires_at < now);
      return { sessions, error: null };
    }

    const { supabase } = await import('../config/supabase');
    const { data: sessions, error } = await supabase
      .from('transfer_sessions')
      .select('*')
      .lt('expires_at', now)
      .in('status', '("CREATING","WAITING")')
      .eq('receiver_connected', false);
      
    if (error) throw error;
    return { sessions, error: null };
  } catch (error) {
    return { sessions: [], error };
  }
}
