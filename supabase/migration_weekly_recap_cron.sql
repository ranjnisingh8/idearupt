-- ============================================================
-- Weekly Recap Email CRON Job
-- Runs every Monday at 10 AM UTC
-- ============================================================

SELECT cron.schedule(
  'weekly-recap-email',
  '0 10 * * 1',  -- Every Monday at 10:00 UTC
  $$
  SELECT
    net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/weekly-recap-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
