-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Security Audit v4 — Trial status auth + waitlist fix
-- Run in Supabase SQL Editor
-- Safe to run multiple times (all idempotent)
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. FIX get_user_trial_status() — add auth.uid() enforcement
--    Previously: Any authenticated user could query ANY user's
--    trial status by passing an arbitrary p_user_id.
--    Now: Only returns data if p_user_id matches the caller.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_user_trial_status(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Security: only allow users to query their own trial status
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN json_build_object(
      'subscription_status', 'free',
      'trial_ends_at', NULL,
      'is_trial_active', false,
      'trial_days_left', 0,
      'is_pro', false
    );
  END IF;

  SELECT json_build_object(
    'subscription_status', u.subscription_status,
    'trial_ends_at', u.trial_ends_at,
    'is_trial_active', (
      u.subscription_status = 'trial'
      AND u.trial_ends_at IS NOT NULL
      AND u.trial_ends_at > NOW()
    ),
    'trial_days_left', GREATEST(0, EXTRACT(EPOCH FROM (u.trial_ends_at - NOW())) / 86400)::INT,
    'is_pro', u.subscription_status = 'pro'
  ) INTO result
  FROM public.users u
  WHERE u.id = p_user_id;

  RETURN COALESCE(result, json_build_object(
    'subscription_status', 'free',
    'trial_ends_at', NULL,
    'is_trial_active', false,
    'trial_days_left', 0,
    'is_pro', false
  ));
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 2. FIX feature_waitlist INSERT — require authenticated user
--    Previously: "Anyone can join feature waitlist" WITH CHECK (true)
--    This allowed unauthenticated inserts with any email/user_id.
--    Now: Only authenticated users can insert with their own user_id.
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  -- Drop old overly permissive policy
  DROP POLICY IF EXISTS "Anyone can join feature waitlist" ON feature_waitlist;

  -- New: Only authenticated users can insert with their own user_id
  DROP POLICY IF EXISTS "Auth users insert own feature waitlist" ON feature_waitlist;
  CREATE POLICY "Auth users insert own feature waitlist" ON feature_waitlist
    FOR INSERT WITH CHECK (auth.uid() = user_id);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 3. TIGHTEN usage_tracking UPDATE — remove client-side UPDATE
--    All usage updates should go through increment_usage() which
--    is SECURITY DEFINER. Remove client-side UPDATE to prevent
--    users from manually decrementing their usage counts.
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  -- Drop both old and new versioned UPDATE policies
  DROP POLICY IF EXISTS "Users can update own usage" ON usage_tracking;
  DROP POLICY IF EXISTS "Users can update own usage v2" ON usage_tracking;

EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Revoke direct UPDATE grant — only SECURITY DEFINER functions need it
REVOKE UPDATE ON TABLE public.usage_tracking FROM authenticated;
-- Keep SELECT and INSERT for the client-side (SELECT for viewing, INSERT handled by RLS)
GRANT SELECT, INSERT ON TABLE public.usage_tracking TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- DONE!
-- This migration:
-- 1. Fixes get_user_trial_status() to only return data for the caller
-- 2. Fixes feature_waitlist INSERT to require auth.uid() = user_id
-- 3. Removes usage_tracking UPDATE policy (use SECURITY DEFINER RPCs)
-- ═══════════════════════════════════════════════════════════════
