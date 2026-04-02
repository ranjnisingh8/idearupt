-- ═══════════════════════════════════════════════════════════════
-- CRON JOB: Auto-generate use cases from top-scored ideas
-- Runs daily at 13:30 UTC (7PM IST) — 1 hour after scraper runs
-- ═══════════════════════════════════════════════════════════════

-- Schedule the cron job (runs 1 hour after scrape-ideas at 12:30 UTC)
SELECT cron.schedule(
  'generate-use-cases-daily',
  '30 13 * * *',  -- 1:30 PM UTC = 7:00 PM IST (1 hour after scraper)
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/generate-use-cases',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"limit": 10, "min_score": 5.5}'::jsonb
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════
-- VERIFY: Check scheduled jobs
-- ═══════════════════════════════════════════════════════════════
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname IN ('generate-use-cases-daily', 'scrape-ideas-daily')
ORDER BY jobname;
