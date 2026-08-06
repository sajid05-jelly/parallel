-- PARALLEL: Transfer Sessions Table
-- Run this migration in the Supabase SQL Editor to create the required table.

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Create transfer_sessions table
create table if not exists public.transfer_sessions (
  id uuid default uuid_generate_v4() primary key,
  token_hash text not null unique,
  status text not null default 'CREATING'
    check (status in ('CREATING','UPLOADING','WAITING','CONNECTED','TRANSFERRING','COMPLETED','EXPIRED','CANCELLED','FAILED')),
  created_at timestamptz default now() not null,
  expires_at timestamptz not null,
  one_receiver_mode boolean default true,
  total_files integer not null default 0,
  total_bytes bigint not null default 0,
  uploaded_bytes bigint not null default 0,
  downloaded_bytes bigint not null default 0,
  receiver_connected boolean default false,
  receiver_connected_at timestamptz,
  receiver_credential_hash text
);

-- Index for token lookups
create index if not exists idx_transfer_sessions_token_hash on public.transfer_sessions (token_hash);

-- Index for cleanup queries (find expired sessions)
create index if not exists idx_transfer_sessions_cleanup on public.transfer_sessions (expires_at, status, receiver_connected)
  where status in ('CREATING','UPLOADING','WAITING') and receiver_connected = false;

-- Row Level Security
alter table public.transfer_sessions enable row level security;

-- Policy: Allow anonymous inserts (session creation)
create policy "Allow anonymous insert" on public.transfer_sessions
  for insert with check (true);

-- Policy: Allow anonymous select (session lookup)
create policy "Allow anonymous select" on public.transfer_sessions
  for select using (true);

-- Policy: Allow anonymous update (status changes)
create policy "Allow anonymous update" on public.transfer_sessions
  for update using (true);

-- Note: Deletes should be handled by a server-side service role or scheduled function
-- For MVP, we allow delete from the client if needed for cleanup
create policy "Allow anonymous delete" on public.transfer_sessions
  for delete using (true);

-- ============================================================
-- Supabase Storage: Create private bucket for transfers
-- ============================================================
-- Run this in the SQL editor OR create via the Supabase dashboard:
--
-- 1. Go to Storage → Create Bucket
-- 2. Name: "transfers"
-- 3. Public: OFF (private)
-- 4. File size limit: 6MB (chunk size + overhead)
-- 5. Allowed MIME types: application/octet-stream
--
-- Then add these storage policies:

-- Allow anonymous uploads to the transfers bucket
-- (needed because we don't require authentication)
insert into storage.buckets (id, name, public, file_size_limit)
  values ('transfers', 'transfers', false, 6291456)  -- 6MB limit per chunk
  on conflict (id) do nothing;

-- Storage policies for anonymous access
create policy "Allow anonymous upload" on storage.objects
  for insert with check (bucket_id = 'transfers');

create policy "Allow anonymous download" on storage.objects
  for select using (bucket_id = 'transfers');

create policy "Allow anonymous delete" on storage.objects
  for delete using (bucket_id = 'transfers');
