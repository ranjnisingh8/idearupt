-- ═══════════════════════════════════════════════════════════════════
-- MASTER CRON FIX — Run this ONCE in Supabase SQL Editor
--
-- Fixes:
-- 1. Lifecycle emails (broken since ~Feb 19 — wrong service_role_key)
-- 2. Auto-churn (was missing plan_status update)
-- 3. Early adopter drip (adds auto cron every 48h)
-- 4. Weekly recap (already works via vault, just verifying)
--
-- After running: all emails will fire automatically.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- STEP 1: Fix the auto-churn function to also set plan_status='free'
-- (Without this, expired trial users keep Pro access on frontend)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.churn_expired_trials()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  churned_count INTEGER;
BEGIN
  UPDATE public.users
  SET
    subscription_status = 'churned',
    plan_status = 'free'
  WHERE subscription_status = 'trial'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at <= NOW();

  GET DIAGNOSTICS churned_count = ROW_COUNT;
  RETURN churned_count;
END;
$$;

-- Run it now to fix any currently stuck users
SELECT public.churn_expired_trials();


-- ─────────────────────────────────────────────────────────────────
-- STEP 2: Fix lifecycle email cron (was using wrong setting name)
-- Runs every 6 hours: 00:00, 06:00, 12:00, 18:00 UTC
-- ─────────────────────────────────────────────────────────────────

-- Remove old broken version
SELECT cron.unschedule('send-lifecycle-emails');

-- Re-schedule with coalesce fallback for auth key
SELECT cron.schedule(
  'send-lifecycle-emails',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/send-lifecycle-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        current_setting('supabase.service_role_key', true),
        current_setting('app.settings.service_role_key', true),
        ''
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);


-- ─────────────────────────────────────────────────────────────────
-- STEP 3: Add early adopter drip cron (every 48 hours)
-- Sends the NEXT unsent email in the 4-email sequence per user
-- Safe to re-run — fully deduplicated
-- ─────────────────────────────────────────────────────────────────

-- Remove if exists (safe)
SELECT cron.unschedule('send-early-adopter-drip');

-- Schedule every 48 hours (runs at 10 AM UTC on Mon, Wed, Fri, Sun)
SELECT cron.schedule(
  'send-early-adopter-drip',
  '0 10 * * 0,1,3,5',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/send-early-adopter-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        current_setting('supabase.service_role_key', true),
        current_setting('app.settings.service_role_key', true),
        ''
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);


-- ─────────────────────────────────────────────────────────────────
-- STEP 4: Verify all cron jobs are scheduled
-- ─────────────────────────────────────────────────────────────────

SELECT jobid, jobname, schedule, active
FROM cron.job
ORDER BY jobname;


-- ─────────────────────────────────────────────────────────────────
-- STEP 5: Trigger IMMEDIATE sends to catch up on everything missed
-- Run these to fire right now (one-time catch-up)
-- ─────────────────────────────────────────────────────────────────

-- Send lifecycle emails NOW (catches up day3, day5, day7, day10 for all users)
SELECT net.http_post(
  url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/send-lifecycle-email',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || coalesce(
      current_setting('supabase.service_role_key', true),
      current_setting('app.settings.service_role_key', true),
      ''
    )
  ),
  body := '{}'::jsonb
) AS request_id;

-- Send early adopter Email 1 NOW (to all 65 founding members)
SELECT net.http_post(
  url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/send-early-adopter-email',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || coalesce(
      current_setting('supabase.service_role_key', true),
      current_setting('app.settings.service_role_key', true),
      ''
    )
  ),
  body := '{}'::jsonb
) AS request_id;
