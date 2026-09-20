import { createClient } from '@supabase/supabase-js';

const getValidUrl = (url) => {
  if (!url || typeof url !== 'string') return 'https://placeholder.supabase.co';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = getValidUrl(rawUrl);
const supabaseAnonKey = (rawKey && typeof rawKey === 'string' && rawKey.trim()) || 'placeholder-key';

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  !rawUrl.includes('placeholder') &&
  !rawKey.includes('placeholder')
);

export const isSupabaseKeyValid = Boolean(
  isSupabaseConfigured &&
  rawKey.trim().length > 0
);

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase Config Warning] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY.\n' +
    'Supabase database queries will fail until credentials are provided in .env.local.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});


