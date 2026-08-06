import { storage } from './storageAdapter';
import { findExpiredSessions, expireSession } from './sessionManager';

/**
 * Cleans up a single session by removing its storage objects and marking it as expired if necessary.
 * @param {string} sessionId 
 */
export async function cleanupSession(sessionId) {
  try {
    const { success, error } = await storage.deleteSession(sessionId);
    if (!success) throw error;
    
    return { success: true, error: null };
  } catch (error) {
    console.error(`Failed to cleanup session ${sessionId}:`, error);
    return { success: false, error };
  }
}

/**
 * Finds all expired sessions and cleans up their resources.
 */
export async function cleanupExpiredSessions() {
  try {
    const { sessions, error } = await findExpiredSessions();
    if (error) throw error;
    
    let cleanedCount = 0;
    
    for (const session of sessions) {
      await expireSession(session.id);
      const { success } = await cleanupSession(session.id);
      if (success) cleanedCount++;
    }
    
    return cleanedCount;
  } catch (error) {
    console.error('Failed to run bulk cleanup:', error);
    return 0;
  }
}

/**
 * Lazy cleanup called when an expired or invalid session is accessed.
 * @param {Object} session 
 */
export async function lazyCleanup(session) {
  const now = new Date();
  const expiresAt = new Date(session.expires_at);
  
  if (expiresAt < now || session.status === 'EXPIRED' || session.status === 'FAILED') {
    if (session.status !== 'EXPIRED') {
      await expireSession(session.id);
    }
    await cleanupSession(session.id);
  }
}
