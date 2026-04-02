-- ============================================================
-- SECURE ADMIN VIEWS: Drop, recreate with security_invoker,
-- restrict to service_role only
-- ============================================================
-- Run this ENTIRE block in the Supabase SQL Editor.
-- All column names verified against schema.sql + migration files.
-- ============================================================

-- Step 1: Drop all existing admin views
DROP VIEW IF EXISTS admin_users CASCADE;
DROP VIEW IF EXISTS admin_builder_dna CASCADE;
DROP VIEW IF EXISTS admin_user_interactions CASCADE;
DROP VIEW IF EXISTS admin_idea_validations CASCADE;
DROP VIEW IF EXISTS admin_user_alerts CASCADE;
DROP VIEW IF EXISTS admin_pro_waitlist CASCADE;
DROP VIEW IF EXISTS admin_usage_tracking CASCADE;
DROP VIEW IF EXISTS admin_page_events CASCADE;
DROP VIEW IF EXISTS admin_feature_waitlist CASCADE;
DROP VIEW IF EXISTS admin_user_saved_ideas CASCADE;
DROP VIEW IF EXISTS admin_build_blueprints CASCADE;
DROP VIEW IF EXISTS admin_collections CASCADE;
DROP VIEW IF EXISTS admin_collection_items CASCADE;
DROP VIEW IF EXISTS admin_waitlist CASCADE;

-- Step 2: Recreate all views with security_invoker = true

-- 1. admin_users — users table (schema.sql) + builder_dna join
CREATE VIEW admin_users
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name,
  u.onboarding_completed,
  u.created_at,
  u.updated_at,
  bd.tech_level,
  bd.budget_range,
  bd.time_commitment,
  bd.industries,
  bd.risk_tolerance
FROM users u
LEFT JOIN builder_dna bd ON bd.user_id = u.id;

-- 2. admin_builder_dna — builder_dna table (schema.sql)
-- Columns: id, user_id, tech_level, budget_range, time_commitment, industries, risk_tolerance, created_at, updated_at
CREATE VIEW admin_builder_dna
WITH (security_invoker = true) AS
SELECT
  bd.id,
  bd.user_id,
  bd.tech_level,
  bd.budget_range,
  bd.time_commitment,
  bd.industries,
  bd.risk_tolerance,
  bd.created_at,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM builder_dna bd
LEFT JOIN users u ON u.id = bd.user_id;

-- 3. admin_user_interactions — user_interactions table (schema.sql)
-- Columns: id, user_id, idea_id, action, created_at
CREATE VIEW admin_user_interactions
WITH (security_invoker = true) AS
SELECT
  ui.id,
  ui.user_id,
  ui.idea_id,
  ui.action,
  ui.created_at,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name,
  i.title AS idea_title
FROM user_interactions ui
LEFT JOIN users u ON u.id = ui.user_id
LEFT JOIN ideas i ON i.id = ui.idea_id;

-- 4. admin_idea_validations — idea_validations table (schema.sql)
-- Columns: id, idea_text, user_id, proof_stack_score, verdict, validation_markdown, validation_json, competitors_found, created_at
CREATE VIEW admin_idea_validations
WITH (security_invoker = true) AS
SELECT
  iv.id,
  iv.user_id,
  iv.idea_text,
  iv.created_at,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM idea_validations iv
LEFT JOIN users u ON u.id = iv.user_id;

-- 5. admin_user_alerts — user_alerts table (schema.sql)
-- Columns: id, user_id, category_filter, min_score, keywords, enabled, created_at, updated_at
CREATE VIEW admin_user_alerts
WITH (security_invoker = true) AS
SELECT
  ua.id,
  ua.user_id,
  ua.created_at,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM user_alerts ua
LEFT JOIN users u ON u.id = ua.user_id;

-- 6. admin_pro_waitlist — pro_waitlist table (schema.sql + migration_usage_tracking.sql)
-- Columns: id, email, user_id, source, created_at
CREATE VIEW admin_pro_waitlist
WITH (security_invoker = true) AS
SELECT
  pw.id,
  pw.user_id,
  pw.email,
  pw.source,
  pw.created_at,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM pro_waitlist pw
LEFT JOIN users u ON u.id = pw.user_id;

-- 7. admin_usage_tracking — usage_tracking table (migration_usage_tracking.sql)
-- Columns: id, user_id, feature, used_at (DATE), count
CREATE VIEW admin_usage_tracking
WITH (security_invoker = true) AS
SELECT
  ut.id,
  ut.user_id,
  ut.feature,
  ut.used_at,
  ut.count,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM usage_tracking ut
LEFT JOIN users u ON u.id = ut.user_id;

-- 8. admin_page_events — page_events table (migration_page_events.sql)
-- Columns: id, event_name, event_data, page_url, session_id, user_id, created_at
CREATE VIEW admin_page_events
WITH (security_invoker = true) AS
SELECT
  pe.id,
  pe.user_id,
  pe.event_name,
  pe.event_data,
  pe.page_url,
  pe.session_id,
  pe.created_at,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM page_events pe
LEFT JOIN users u ON u.id = pe.user_id;

-- 9. admin_feature_waitlist — feature_waitlist table (migration_feature_waitlist.sql)
-- Columns: id, email, feature, source, user_id, created_at
CREATE VIEW admin_feature_waitlist
WITH (security_invoker = true) AS
SELECT
  fw.id,
  fw.user_id,
  fw.email,
  fw.feature,
  fw.source,
  fw.created_at,
  COALESCE(u.display_name, split_part(COALESCE(u.email, fw.email), '@', 1)) AS user_name
FROM feature_waitlist fw
LEFT JOIN users u ON u.id = fw.user_id;

-- 10. admin_user_saved_ideas — user_saved_ideas table (inferred: id, user_id, idea_id, created_at)
CREATE VIEW admin_user_saved_ideas
WITH (security_invoker = true) AS
SELECT
  usi.id,
  usi.user_id,
  usi.idea_id,
  usi.created_at,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name,
  i.title AS idea_title
FROM user_saved_ideas usi
LEFT JOIN users u ON u.id = usi.user_id
LEFT JOIN ideas i ON i.id = usi.idea_id;

-- 11. admin_build_blueprints — build_blueprints table (NO user_id column confirmed)
-- Columns: id, idea_id, created_at
CREATE VIEW admin_build_blueprints
WITH (security_invoker = true) AS
SELECT
  bb.id,
  bb.idea_id,
  bb.created_at,
  i.title AS idea_title
FROM build_blueprints bb
LEFT JOIN ideas i ON i.id = bb.idea_id;

-- 12. admin_collections — collections table (inferred: id, user_id, name, created_at)
CREATE VIEW admin_collections
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.user_id,
  c.name,
  c.created_at,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM collections c
LEFT JOIN users u ON u.id = c.user_id;

-- 13. admin_collection_items — collection_items table (NO created_at, NO user_id)
-- Columns: id, collection_id, idea_id
CREATE VIEW admin_collection_items
WITH (security_invoker = true) AS
SELECT
  ci.id,
  ci.collection_id,
  ci.idea_id,
  c.name AS collection_name,
  c.created_at AS collection_created_at,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name,
  i.title AS idea_title
FROM collection_items ci
LEFT JOIN collections c ON c.id = ci.collection_id
LEFT JOIN users u ON u.id = c.user_id
LEFT JOIN ideas i ON i.id = ci.idea_id;

-- 14. admin_waitlist — waitlist table (inferred: id, email, created_at)
CREATE VIEW admin_waitlist
WITH (security_invoker = true) AS
SELECT
  w.id,
  w.email,
  w.created_at,
  u.display_name AS user_name
FROM waitlist w
LEFT JOIN users u ON LOWER(u.email) = LOWER(w.email);

-- Step 3: Grant service_role ONLY (no authenticated, no anon)
DO $$
DECLARE
  v TEXT;
BEGIN
  FOR v IN
    SELECT unnest(ARRAY[
      'admin_users',
      'admin_builder_dna',
      'admin_user_interactions',
      'admin_idea_validations',
      'admin_user_alerts',
      'admin_pro_waitlist',
      'admin_usage_tracking',
      'admin_page_events',
      'admin_feature_waitlist',
      'admin_user_saved_ideas',
      'admin_build_blueprints',
      'admin_collections',
      'admin_collection_items',
      'admin_waitlist'
    ])
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON %I FROM authenticated', v);
      EXECUTE format('REVOKE ALL ON %I FROM anon', v);
      EXECUTE format('GRANT SELECT ON %I TO service_role', v);
      RAISE NOTICE 'Secured: %', v;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'View % missing, skipping', v;
    END;
  END LOOP;
END $$;

-- Step 4: Verify
SELECT
  viewname,
  CASE
    WHEN has_table_privilege('authenticated', 'public.' || viewname, 'SELECT')
    THEN 'EXPOSED'
    ELSE 'SECURED'
  END AS status
FROM pg_views
WHERE schemaname = 'public'
  AND viewname LIKE 'admin_%'
ORDER BY viewname;
