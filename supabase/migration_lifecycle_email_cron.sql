-- ============================================
-- Schedule daily lifecycle email cron job
-- Runs at 9:00 UTC (2:30 PM IST) every day
-- Run this ONCE in Supabase SQL Editor
-- ============================================

-- Remove old job if it exists (safe to run multiple times)
SELECT cron.unschedule('send-lifecycle-emails');

-- Schedule: every day at 9:00 UTC
SELECT cron.schedule(
  'send-lifecycle-emails',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/send-lifecycle-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Verify it's scheduled
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'send-lifecycle-emails';
