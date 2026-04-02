-- ============================================================
-- ADMIN VIEWS: Show user name + email alongside all tables
-- Run this in the Supabase SQL Editor
-- ============================================================
-- These views JOIN each table with the users table so you can
-- see who each row belongs to. They appear in the Table Editor
-- sidebar (look for the view icon). Each has user_email and
-- user_name columns so you can recognise users at a glance.
--
-- NOTE: Run each CREATE VIEW block separately if any fail —
-- some tables (build_blueprints, collections, etc.) may have
-- different column names if created via the dashboard.
-- ============================================================

---------------------------------------------------
-- 1. admin_users — enriched users with builder DNA
---------------------------------------------------
CREATE OR REPLACE VIEW admin_users AS
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

---------------------------------------------------
-- 2. admin_builder_dna — onboarding preferences
---------------------------------------------------
CREATE OR REPLACE VIEW admin_builder_dna AS
SELECT
  bd.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM builder_dna bd
LEFT JOIN users u ON u.id = bd.user_id;

---------------------------------------------------
-- 3. admin_user_interactions — views/saves/shares
---------------------------------------------------
CREATE OR REPLACE VIEW admin_user_interactions AS
SELECT
  ui.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name,
  i.title AS idea_title
FROM user_interactions ui
LEFT JOIN users u ON u.id = ui.user_id
LEFT JOIN ideas i ON i.id = ui.idea_id;

---------------------------------------------------
-- 4. admin_idea_validations — who validated ideas
---------------------------------------------------
CREATE OR REPLACE VIEW admin_idea_validations AS
SELECT
  iv.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM idea_validations iv
LEFT JOIN users u ON u.id = iv.user_id;

---------------------------------------------------
-- 5. admin_user_alerts — custom alert settings
---------------------------------------------------
CREATE OR REPLACE VIEW admin_user_alerts AS
SELECT
  ua.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM user_alerts ua
LEFT JOIN users u ON u.id = ua.user_id;

---------------------------------------------------
-- 6. admin_pro_waitlist — Pro tier waitlist
---------------------------------------------------
CREATE OR REPLACE VIEW admin_pro_waitlist AS
SELECT
  pw.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM pro_waitlist pw
LEFT JOIN users u ON u.id = pw.user_id;

---------------------------------------------------
-- 7. admin_usage_tracking — feature usage limits
---------------------------------------------------
CREATE OR REPLACE VIEW admin_usage_tracking AS
SELECT
  ut.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM usage_tracking ut
LEFT JOIN users u ON u.id = ut.user_id;

---------------------------------------------------
-- 8. admin_page_events — analytics events
---------------------------------------------------
CREATE OR REPLACE VIEW admin_page_events AS
SELECT
  pe.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM page_events pe
LEFT JOIN users u ON u.id = pe.user_id;

---------------------------------------------------
-- 9. admin_feature_waitlist — upcoming feature opt-ins
---------------------------------------------------
CREATE OR REPLACE VIEW admin_feature_waitlist AS
SELECT
  fw.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM feature_waitlist fw
LEFT JOIN users u ON u.id = fw.user_id;

---------------------------------------------------
-- 10. admin_user_saved_ideas — saved ideas per user
---------------------------------------------------
CREATE OR REPLACE VIEW admin_user_saved_ideas AS
SELECT
  usi.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name,
  i.title AS idea_title
FROM user_saved_ideas usi
LEFT JOIN users u ON u.id = usi.user_id
LEFT JOIN ideas i ON i.id = usi.idea_id;

---------------------------------------------------
-- 11. admin_build_blueprints — generated blueprints
-- NOTE: If this fails, the table may not have user_id.
-- Run: SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'build_blueprints';
-- to check columns, then adjust the JOIN.
---------------------------------------------------
CREATE OR REPLACE VIEW admin_build_blueprints AS
SELECT
  bb.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM build_blueprints bb
LEFT JOIN users u ON u.id = bb.user_id;

---------------------------------------------------
-- 12. admin_collections — user collections
---------------------------------------------------
CREATE OR REPLACE VIEW admin_collections AS
SELECT
  c.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM collections c
LEFT JOIN users u ON u.id = c.user_id;

---------------------------------------------------
-- 13. admin_collection_items — items in collections
---------------------------------------------------
CREATE OR REPLACE VIEW admin_collection_items AS
SELECT
  ci.*,
  u.email AS user_email,
  COALESCE(u.display_name, split_part(u.email, '@', 1)) AS user_name
FROM collection_items ci
LEFT JOIN collections c ON c.id = ci.collection_id
LEFT JOIN users u ON u.id = c.user_id;

---------------------------------------------------
-- 14. admin_waitlist — general waitlist signups
-- (waitlist table likely has email column directly)
---------------------------------------------------
CREATE OR REPLACE VIEW admin_waitlist AS
SELECT
  w.*,
  u.display_name AS user_name
FROM waitlist w
LEFT JOIN users u ON LOWER(u.email) = LOWER(w.email);

---------------------------------------------------
-- GRANT SELECT on all views
---------------------------------------------------
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
      EXECUTE format('GRANT SELECT ON %I TO authenticated', v);
      EXECUTE format('GRANT SELECT ON %I TO service_role', v);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'View % does not exist, skipping GRANT', v;
    END;
  END LOOP;
END $$;

-- ============================================================
-- DONE!
-- Go to Table Editor → you'll see admin_* views in the sidebar.
-- Each view has user_email + user_name columns so you can
-- immediately recognise which user each row belongs to.
--
-- Tables WITHOUT user references (ideas, pain_signals, use_cases,
-- daily_drops, builder_profiles) don't need views — they're
-- system-generated content not tied to specific users.
-- ============================================================
