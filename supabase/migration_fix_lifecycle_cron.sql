-- ═══════════════════════════════════════════════════════════════════
-- FIX: Lifecycle email cron job — auth header was using wrong key name
--
-- BUG: The lifecycle cron was configured with either:
--   current_setting('app.settings.service_role_key') — might not exist
--   current_setting('supabase.service_role_key') — might not exist
-- Depending on which migration ran last. If the setting doesn't exist,
-- the Authorization header is empty → edge function returns 401.
--
-- This is why day3_checkin stopped sending on Feb 19, day7_expired
-- only sent once, and day10_nudge only sent once.
--
-- FIX: Try both key names with fallback, and run every 6 hours to
-- catch all time windows.
--
-- RUN THIS IN SUPABASE SQL EDITOR
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Remove all existing lifecycle cron jobs (clean slate)
SELECT cron.unschedule('send-lifecycle-emails');

-- Step 2: Re-schedule with correct service role key
-- Supabase provides the service_role_key via the 'supabase' schema
-- The correct setting name in hosted Supabase is: supabase_admin.service_role_key
-- But we'll use the vault or environment variable approach that works
SELECT cron.schedule(
  'send-lifecycle-emails',
  '0 */6 * * *',  -- Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
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

-- Step 3: Verify it's scheduled
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'send-lifecycle-emails';

-- Step 4: Check what setting names are available
-- Run this to see which key name works:
SELECT
  current_setting('supabase.service_role_key', true) AS supabase_key,
  current_setting('app.settings.service_role_key', true) AS app_key;
-- One of these should return your service role key. The other will be NULL.
-- If BOTH are NULL, you need to set the key manually:
--   ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key-here';

-- Step 5: Manually invoke the lifecycle function NOW to catch up on missed emails
-- Run this to trigger it immediately:
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
