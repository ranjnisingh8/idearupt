-- ============================================
-- PAGE EVENTS TABLE
-- Queryable analytics — see who does what, when, and for how long
-- ============================================

CREATE TABLE IF NOT EXISTS page_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  page_url TEXT,
  session_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_page_events_created ON page_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_events_event ON page_events(event_name);
CREATE INDEX IF NOT EXISTS idx_page_events_user ON page_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_events_session ON page_events(session_id);

-- Enable RLS
ALTER TABLE page_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert events (anonymous visitors + logged-in users)
CREATE POLICY "Anyone can insert page events" ON page_events FOR INSERT WITH CHECK (true);
-- Only service role can read (you query from Supabase dashboard)
CREATE POLICY "Service role can read all events" ON page_events FOR SELECT USING (auth.role() = 'service_role');

-- Auto-set user_id from auth context if user is logged in
CREATE OR REPLACE FUNCTION set_event_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER page_events_set_user
  BEFORE INSERT ON page_events
  FOR EACH ROW EXECUTE FUNCTION set_event_user_id();

-- ============================================
-- USEFUL QUERIES (run these in SQL Editor to check traction)
-- ============================================

-- 🔥 Top pages by visits (last 7 days)
-- SELECT page_url, COUNT(*) as visits
-- FROM page_events
-- WHERE event_name = 'page_view'
--   AND created_at > NOW() - INTERVAL '7 days'
-- GROUP BY page_url
-- ORDER BY visits DESC;

-- 👤 Most active users (last 7 days)
-- SELECT u.email, COUNT(*) as events, COUNT(DISTINCT pe.session_id) as sessions
-- FROM page_events pe
-- JOIN users u ON u.id = pe.user_id
-- WHERE pe.created_at > NOW() - INTERVAL '7 days'
-- GROUP BY u.email
-- ORDER BY events DESC
-- LIMIT 20;

-- ⏱️ Average time on page (last 7 days)
-- SELECT event_data->>'page' as page,
--        ROUND(AVG((event_data->>'duration_seconds')::int)) as avg_seconds,
--        COUNT(*) as visits
-- FROM page_events
-- WHERE event_name = 'time_on_page'
--   AND created_at > NOW() - INTERVAL '7 days'
-- GROUP BY event_data->>'page'
-- ORDER BY avg_seconds DESC;

-- 🎯 CTA click funnel (last 7 days)
-- SELECT event_name, COUNT(*) as clicks
-- FROM page_events
-- WHERE event_name LIKE 'cta_%'
--   AND created_at > NOW() - INTERVAL '7 days'
-- GROUP BY event_name
-- ORDER BY clicks DESC;

-- 📈 Daily active users (last 30 days)
-- SELECT DATE(created_at) as day,
--        COUNT(DISTINCT COALESCE(user_id::text, session_id)) as unique_visitors,
--        COUNT(DISTINCT user_id) as logged_in_users,
--        COUNT(*) as total_events
-- FROM page_events
-- WHERE created_at > NOW() - INTERVAL '30 days'
-- GROUP BY DATE(created_at)
-- ORDER BY day DESC;

-- 🔄 Signup funnel (landing → auth → signup complete)
-- SELECT event_name, COUNT(DISTINCT session_id) as unique_sessions
-- FROM page_events
-- WHERE event_name IN ('page_view', 'cta_hero_click', 'cta_get_started', 'signup_completed')
--   AND created_at > NOW() - INTERVAL '7 days'
-- GROUP BY event_name;

-- 💰 Pro interest tracking
-- SELECT COUNT(*) as total_pro_clicks,
--        COUNT(DISTINCT session_id) as unique_sessions
-- FROM page_events
-- WHERE event_name = 'cta_claim_pro'
--   AND created_at > NOW() - INTERVAL '7 days';
