-- Migration: Schedule cron job for process-idea-alerts edge function
-- Runs daily at 10 AM UTC (after morning scrape at 8 AM UTC)

-- Safe unschedule first (ignore if job doesn't exist)
DO $$ BEGIN
  PERFORM cron.unschedule('process-idea-alerts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule with vault auth
SELECT cron.schedule(
  'process-idea-alerts',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/process-idea-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
