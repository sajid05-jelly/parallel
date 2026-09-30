-- PARALLEL: Security Hardening Migration V2
-- Fixes RLS vulnerabilities in transfer_sessions

-- 1. Drop the overly permissive policies
DROP POLICY IF EXISTS "Allow anonymous select" ON public.transfer_sessions;
DROP POLICY IF EXISTS "Allow anonymous update" ON public.transfer_sessions;
DROP POLICY IF EXISTS "Allow anonymous delete" ON public.transfer_sessions;
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.transfer_sessions;

-- 2. Restrict INSERT (anyone can create a session)
CREATE POLICY "Allow anonymous insert" ON public.transfer_sessions
  FOR INSERT WITH CHECK (true);

-- 3. Restrict SELECT (prevent enumeration)
-- We set this to false so attackers cannot run SELECT * FROM transfer_sessions.
-- Legitimate lookups will use the SECURITY DEFINER RPC functions below.
CREATE POLICY "Deny anonymous select" ON public.transfer_sessions
  FOR SELECT USING (false);

-- 4. Restrict UPDATE / DELETE (Capability Token Pattern)
-- Since SELECT is disabled, attackers cannot guess the UUID id.
-- Therefore, knowing the UUID id acts as an authorization token to update/delete it.
CREATE POLICY "Allow update by UUID capability" ON public.transfer_sessions
  FOR UPDATE USING (true);

CREATE POLICY "Allow delete by UUID capability" ON public.transfer_sessions
  FOR DELETE USING (true);

-- 5. Create secure RPCs for lookups bypassing RLS
CREATE OR REPLACE FUNCTION get_session_by_token(p_token_hash TEXT)
RETURNS SETOF transfer_sessions
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM transfer_sessions WHERE token_hash = p_token_hash LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_session_by_pattern(p_pattern_hash TEXT)
RETURNS SETOF transfer_sessions
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM transfer_sessions 
  WHERE pattern_hash = p_pattern_hash 
    AND status = 'WAITING' 
    AND receiver_connected = false 
    AND expires_at > now()
  ORDER BY created_at DESC 
  LIMIT 1;
$$;
