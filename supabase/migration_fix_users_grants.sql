-- ============================================
-- FIX: Grant table-level permissions on users table
--
-- The "permission denied for table users" error occurs because
-- RLS policies exist but the authenticated role lacks the
-- underlying table-level GRANT privileges.
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor).
-- ============================================

-- Grant SELECT, INSERT, UPDATE on users to authenticated users
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;

-- Also grant to anon role for the auth callback flow
GRANT SELECT, INSERT ON TABLE public.users TO anon;

-- Ensure builder_dna also has proper grants
GRANT SELECT, INSERT, UPDATE ON TABLE public.builder_dna TO authenticated;
