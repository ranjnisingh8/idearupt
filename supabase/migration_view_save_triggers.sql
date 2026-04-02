-- ============================================================
-- Database triggers to auto-update view_count and save_count
-- on the ideas table when user_interactions change.
--
-- This replaces the old approach of directly updating ideas
-- from the frontend (which broke when we dropped UPDATE policy).
-- Now only service_role can write to ideas, and these triggers
-- run as SECURITY DEFINER (superuser context).
-- ============================================================

-- 1) Trigger function: increment view_count or save_count
CREATE OR REPLACE FUNCTION update_idea_counts_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.action = 'viewed' THEN
    UPDATE ideas SET view_count = COALESCE(view_count, 0) + 1 WHERE id = NEW.idea_id;
  ELSIF NEW.action = 'saved' THEN
    UPDATE ideas SET save_count = COALESCE(save_count, 0) + 1 WHERE id = NEW.idea_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) Trigger function: decrement save_count on unsave
CREATE OR REPLACE FUNCTION update_idea_counts_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.action = 'saved' THEN
    UPDATE ideas SET save_count = GREATEST(COALESCE(save_count, 0) - 1, 0) WHERE id = OLD.idea_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Create triggers
DROP TRIGGER IF EXISTS trg_interaction_insert ON user_interactions;
CREATE TRIGGER trg_interaction_insert
  AFTER INSERT ON user_interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_idea_counts_on_insert();

DROP TRIGGER IF EXISTS trg_interaction_delete ON user_interactions;
CREATE TRIGGER trg_interaction_delete
  AFTER DELETE ON user_interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_idea_counts_on_delete();

-- 4) Verify triggers are created
SELECT tgname, tgrelid::regclass, tgtype
FROM pg_trigger
WHERE tgrelid = 'user_interactions'::regclass
AND tgname LIKE 'trg_%';
