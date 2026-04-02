-- FIX 1: Ensure usage_tracking has proper RLS policies
-- Run this in Supabase Dashboard → SQL Editor

-- Ensure RLS is enabled
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- Recreate policies (drop first to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Users can view own usage v2" ON public.usage_tracking;
DROP POLICY IF EXISTS "Users can insert own usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Users can insert own usage v2" ON public.usage_tracking;
DROP POLICY IF EXISTS "Users can update own usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Users can update own usage v2" ON public.usage_tracking;

-- SELECT: users can read their own usage
CREATE POLICY "Users can view own usage" ON public.usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT: users can insert their own usage rows
CREATE POLICY "Users can insert own usage" ON public.usage_tracking
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Grant needed permissions (no UPDATE — that goes through SECURITY DEFINER RPCs)
GRANT SELECT, INSERT ON TABLE public.usage_tracking TO authenticated;

-- Verify
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'usage_tracking';
