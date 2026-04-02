-- ============================================================
-- IDEARUPT — Email CRON Jobs
-- Run each block separately in Supabase SQL Editor
-- ============================================================

-- ─── CRON 1: Daily Morning Email — 8 AM UTC ────────────────
-- Sends top 3 highest-scored ideas to all users every morning
SELECT cron.schedule(
  'daily-morning-email',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/daily-morning-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ─── CRON 2: Saved Idea Alerts — 6 PM UTC ──────────────────
-- Alerts users when their saved ideas get updated (new data, score changes)
SELECT cron.schedule(
  'saved-idea-alerts',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/saved-idea-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ─── CRON 3: Lifecycle Emails — Every 6 hours ──────────────
-- Sends trial lifecycle emails (Day 3, 5, 7, 10) based on trial_ends_at
SELECT cron.schedule(
  'send-lifecycle-emails',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/send-lifecycle-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
