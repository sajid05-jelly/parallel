-- ==============================================================================
-- MIGRATION: Add Parallel Pattern Support
-- Run this in your Supabase SQL Editor to apply the schema changes.
-- ==============================================================================

-- 1. Add the pattern_hash column to store the hashed pattern securely.
--    This is NULLable to maintain backward compatibility with older portals.
ALTER TABLE public.transfer_sessions 
ADD COLUMN IF NOT EXISTS pattern_hash TEXT;

-- 2. Add the pattern_key_blob column to store the encrypted connection keys.
--    This allows a receiver to discover the encryption key using only the pattern.
ALTER TABLE public.transfer_sessions 
ADD COLUMN IF NOT EXISTS pattern_key_blob TEXT;

-- 3. (Optional but recommended) Index the pattern_hash for fast lookups by receiver
CREATE INDEX IF NOT EXISTS idx_transfer_sessions_pattern_hash 
ON public.transfer_sessions (pattern_hash)
WHERE pattern_hash IS NOT NULL;

-- 4. Reload the PostgREST schema cache so the API immediately recognizes the new columns.
--    This prevents the PGRST204 error.
NOTIFY pgrst, 'reload schema';
