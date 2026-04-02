-- ============================================
-- ADD USER DISPLAY NAMES + IDEA TITLES TO ALL KEY TABLES
-- Makes Table Editor human-readable (no more UUIDs)
-- Run in Supabase SQL Editor in 3 parts
-- ============================================

-- ── PART 1: Add columns ──────────────────────────────────

-- Ensure users table has display_name
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Backfill display_name from auth.users metadata
UPDATE users u
SET display_name = COALESCE(
  (SELECT raw_user_meta_data->>'display_name' FROM auth.users WHERE id = u.id),
  (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = u.id),
  u.email,
  'Unknown'
)
WHERE u.display_name IS NULL;

-- Add user_display_name to all user-facing tables
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS user_display_name TEXT;
ALTER TABLE idea_validations ADD COLUMN IF NOT EXISTS user_display_name TEXT;
ALTER TABLE pro_waitlist ADD COLUMN IF NOT EXISTS user_display_name TEXT;
ALTER TABLE user_saved_ideas ADD COLUMN IF NOT EXISTS user_display_name TEXT;
ALTER TABLE user_alerts ADD COLUMN IF NOT EXISTS user_display_name TEXT;
ALTER TABLE usage_tracking ADD COLUMN IF NOT EXISTS user_display_name TEXT;

-- Add idea_title to tables that reference ideas
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS idea_title TEXT;
ALTER TABLE idea_validations ADD COLUMN IF NOT EXISTS idea_title TEXT;
ALTER TABLE user_saved_ideas ADD COLUMN IF NOT EXISTS idea_title TEXT;


-- ── PART 2: Backfill existing records ────────────────────

-- Backfill user_display_name
UPDATE user_interactions ui SET user_display_name = COALESCE(u.display_name, u.email, 'Unknown') FROM users u WHERE ui.user_id = u.id AND ui.user_display_name IS NULL;
UPDATE idea_validations iv SET user_display_name = COALESCE(u.display_name, u.email, 'Unknown') FROM users u WHERE iv.user_id = u.id AND iv.user_display_name IS NULL;
UPDATE pro_waitlist pw SET user_display_name = COALESCE(u.display_name, u.email, 'Unknown') FROM users u WHERE pw.user_id = u.id AND pw.user_display_name IS NULL;
UPDATE user_saved_ideas usi SET user_display_name = COALESCE(u.display_name, u.email, 'Unknown') FROM users u WHERE usi.user_id = u.id AND usi.user_display_name IS NULL;
UPDATE user_alerts ua SET user_display_name = COALESCE(u.display_name, u.email, 'Unknown') FROM users u WHERE ua.user_id = u.id AND ua.user_display_name IS NULL;
UPDATE usage_tracking ut SET user_display_name = COALESCE(u.display_name, u.email, 'Unknown') FROM users u WHERE ut.user_id = u.id AND ut.user_display_name IS NULL;

-- Backfill idea_title
UPDATE user_interactions ui SET idea_title = i.title FROM ideas i WHERE ui.idea_id = i.id AND ui.idea_title IS NULL;
UPDATE user_saved_ideas usi SET idea_title = i.title FROM ideas i WHERE usi.idea_id = i.id AND usi.idea_title IS NULL;
UPDATE idea_validations SET idea_title = LEFT(idea_text, 100) WHERE idea_title IS NULL AND idea_text IS NOT NULL;


-- ── PART 3: Auto-fill triggers ───────────────────────────

-- Auto-fill user_display_name on INSERT
CREATE OR REPLACE FUNCTION auto_fill_user_display_name()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE uname TEXT;
BEGIN
  IF NEW.user_display_name IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT COALESCE(display_name, email, 'Unknown') INTO uname FROM users WHERE id = NEW.user_id;
    NEW.user_display_name := uname;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_username_user_interactions ON user_interactions;
CREATE TRIGGER trg_auto_username_user_interactions BEFORE INSERT ON user_interactions FOR EACH ROW EXECUTE FUNCTION auto_fill_user_display_name();
DROP TRIGGER IF EXISTS trg_auto_username_idea_validations ON idea_validations;
CREATE TRIGGER trg_auto_username_idea_validations BEFORE INSERT ON idea_validations FOR EACH ROW EXECUTE FUNCTION auto_fill_user_display_name();
DROP TRIGGER IF EXISTS trg_auto_username_pro_waitlist ON pro_waitlist;
CREATE TRIGGER trg_auto_username_pro_waitlist BEFORE INSERT ON pro_waitlist FOR EACH ROW EXECUTE FUNCTION auto_fill_user_display_name();
DROP TRIGGER IF EXISTS trg_auto_username_user_saved_ideas ON user_saved_ideas;
CREATE TRIGGER trg_auto_username_user_saved_ideas BEFORE INSERT ON user_saved_ideas FOR EACH ROW EXECUTE FUNCTION auto_fill_user_display_name();
DROP TRIGGER IF EXISTS trg_auto_username_user_alerts ON user_alerts;
CREATE TRIGGER trg_auto_username_user_alerts BEFORE INSERT ON user_alerts FOR EACH ROW EXECUTE FUNCTION auto_fill_user_display_name();
DROP TRIGGER IF EXISTS trg_auto_username_usage_tracking ON usage_tracking;
CREATE TRIGGER trg_auto_username_usage_tracking BEFORE INSERT ON usage_tracking FOR EACH ROW EXECUTE FUNCTION auto_fill_user_display_name();

-- Auto-fill idea_title on INSERT
CREATE OR REPLACE FUNCTION auto_fill_idea_title()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE ititle TEXT;
BEGIN
  IF NEW.idea_title IS NULL AND NEW.idea_id IS NOT NULL THEN
    SELECT title INTO ititle FROM ideas WHERE id = NEW.idea_id;
    NEW.idea_title := ititle;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_idea_title_user_interactions ON user_interactions;
CREATE TRIGGER trg_auto_idea_title_user_interactions BEFORE INSERT ON user_interactions FOR EACH ROW EXECUTE FUNCTION auto_fill_idea_title();
DROP TRIGGER IF EXISTS trg_auto_idea_title_user_saved_ideas ON user_saved_ideas;
CREATE TRIGGER trg_auto_idea_title_user_saved_ideas BEFORE INSERT ON user_saved_ideas FOR EACH ROW EXECUTE FUNCTION auto_fill_idea_title();

-- Sync display_name changes across all tables
CREATE OR REPLACE FUNCTION sync_user_display_name()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.display_name IS DISTINCT FROM NEW.display_name THEN
    UPDATE user_interactions SET user_display_name = COALESCE(NEW.display_name, NEW.email, 'Unknown') WHERE user_id = NEW.id;
    UPDATE idea_validations SET user_display_name = COALESCE(NEW.display_name, NEW.email, 'Unknown') WHERE user_id = NEW.id;
    UPDATE pro_waitlist SET user_display_name = COALESCE(NEW.display_name, NEW.email, 'Unknown') WHERE user_id = NEW.id;
    UPDATE user_saved_ideas SET user_display_name = COALESCE(NEW.display_name, NEW.email, 'Unknown') WHERE user_id = NEW.id;
    UPDATE user_alerts SET user_display_name = COALESCE(NEW.display_name, NEW.email, 'Unknown') WHERE user_id = NEW.id;
    UPDATE usage_tracking SET user_display_name = COALESCE(NEW.display_name, NEW.email, 'Unknown') WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_display_name ON users;
CREATE TRIGGER trg_sync_display_name AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION sync_user_display_name();
