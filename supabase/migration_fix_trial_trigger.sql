-- ============================================================
-- FIX: auto_start_trial() trigger
--
-- PROBLEM: The old trigger sets trial_ends_at for ALL new users
-- on signup, even though we switched to card-required trials.
-- This causes hasUsedTrial to be TRUE for everyone, sending
-- all users to the no-trial $19 checkout instead of the
-- 7-day free trial checkout.
--
-- FIX: Remove trial_ends_at and subscription_status from the
-- trigger. Now trial_ends_at is ONLY set by the Lemon Squeezy
-- webhook when a user actually starts their card-required trial.
--
-- Run this ONCE in Supabase SQL Editor.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. Fix the auto_start_trial() trigger
--    STOP setting trial_ends_at and subscription_status on signup.
--    Only set plan_status='none' (card required to start trial).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auto_start_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- For NEW users: only set plan_status='none' (card required to start trial).
  -- Do NOT set trial_ends_at — that is now handled exclusively by
  -- the Lemon Squeezy webhook when the user actually starts a trial.
  UPDATE public.users
  SET plan_status = 'none'
  WHERE id = NEW.id
    AND plan_status IS NULL;
  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 2. Clean up trial_ends_at for users who never actually started
--    a card-required trial (no Lemon Squeezy customer record).
--    These users got trial_ends_at set by the old trigger.
--
--    IMPORTANT: Only clear for users with plan_status='none'
--    (never went through LS checkout). Users with other plan
--    statuses ('trial', 'active', 'cancelled', etc.) genuinely
--    started a trial via LS.
-- ═══════════════════════════════════════════════════════════════
UPDATE public.users
SET trial_ends_at = NULL,
    subscription_status = 'free'
WHERE ls_customer_id IS NULL
  AND ls_subscription_id IS NULL
  AND plan_status = 'none'
  AND trial_ends_at IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════
SELECT 'Trial trigger fix complete.' AS status;

-- Count of users cleaned up:
SELECT COUNT(*) AS users_cleaned
FROM public.users
WHERE ls_customer_id IS NULL
  AND ls_subscription_id IS NULL
  AND plan_status = 'none'
  AND trial_ends_at IS NULL;
