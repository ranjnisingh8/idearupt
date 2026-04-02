-- ════════════════════════════════════════════════════════════════
-- FIX: Use cases cron job — not running due to wrong service key setting
--
-- ROOT CAUSE: The generate-use-cases cron job used
-- current_setting('app.settings.service_role_key', true) which returns NULL
-- on most Supabase projects. The correct setting path is either:
-- 'supabase.service_role_key' or the key needs to be hardcoded.
--
-- RUN THIS IN: Supabase SQL Editor (Dashboard > SQL Editor)
-- ════════════════════════════════════════════════════════════════

-- Step 1: Remove the broken cron job
SELECT cron.unschedule('generate-use-cases-daily');

-- Step 2: Check which service role key setting works on this project
-- Run this first and see which returns a non-null value:
-- SELECT current_setting('supabase.service_role_key', true);
-- SELECT current_setting('app.settings.service_role_key', true);
-- If BOTH return null, you must hardcode the service role key (see Step 3b)

-- Step 3a: Recreate cron job with CORRECT setting path
-- (This uses 'supabase.service_role_key' which works on most Supabase projects)
SELECT cron.schedule(
  'generate-use-cases-daily',
  '30 13 * * *',  -- 1:30 PM UTC = 7:00 PM IST (1 hour after scraper)
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/generate-use-cases',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{"limit": 15, "min_score": 5.0}'::jsonb
  );
  $$
);

-- Step 3b: ALTERNATIVE — if current_setting returns null, use hardcoded key:
-- UNCOMMENT the block below and REPLACE <YOUR_SERVICE_ROLE_KEY> with your actual key
-- (find it in Supabase Dashboard > Settings > API > service_role key)
/*
SELECT cron.unschedule('generate-use-cases-daily');
SELECT cron.schedule(
  'generate-use-cases-daily',
  '30 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/generate-use-cases',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
    ),
    body := '{"limit": 15, "min_score": 5.0}'::jsonb
  );
  $$
);
*/

-- Step 4: Also fix scraper cron jobs to use consistent auth
-- (Only needed if scrapers are also broken)
-- Check if scraper jobs exist and are running:
SELECT jobid, jobname, schedule, active
FROM cron.job
ORDER BY jobname;

-- Step 5: Check recent cron execution logs (last 20 runs)
SELECT jobid, runid, job_name, status, return_message, start_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;

-- ════════════════════════════════════════════════════════════════
-- MANUAL TEST: Trigger use case generation immediately
-- Run this to test if the function works:
-- ════════════════════════════════════════════════════════════════
/*
SELECT net.http_post(
  url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/generate-use-cases',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
  ),
  body := '{"limit": 25, "min_score": 5.0}'::jsonb
);
*/
