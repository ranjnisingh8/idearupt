-- ════════════════════════════════════════════════════════════════
-- UPDATE: Use cases cron job — better params + twice daily
--
-- The edge function has been updated with:
-- - Better dedup (no longer blocks ideas after first run)
-- - Pagination (processes new ideas even after top ones are converted)
-- - Robust JSON parsing (salvages use cases from truncated responses)
-- - Lower min score and higher limit
--
-- RUN THIS IN: Supabase SQL Editor (Dashboard > SQL Editor)
-- ════════════════════════════════════════════════════════════════

-- Remove old cron job
SELECT cron.unschedule('generate-use-cases-daily');

-- Schedule: Run TWICE daily to build library faster
-- Morning run: 6:30 UTC = 12:00 PM IST
SELECT cron.schedule(
  'generate-use-cases-morning',
  '30 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/generate-use-cases',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{"limit": 6, "min_score": 5.0}'::jsonb
  );
  $$
);

-- Evening run: 13:30 UTC = 7:00 PM IST (1 hour after scraper)
SELECT cron.schedule(
  'generate-use-cases-evening',
  '30 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/generate-use-cases',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{"limit": 6, "min_score": 5.0}'::jsonb
  );
  $$
);

-- Verify jobs created
SELECT jobid, jobname, schedule, active
FROM cron.job
ORDER BY jobname;
