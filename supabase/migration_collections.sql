-- ============================================================
-- Migration: Idea Collections (Pinterest-style boards)
-- ============================================================

-- 1. Collections table
CREATE TABLE IF NOT EXISTS public.collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📁',
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- 2. Collection items table
CREATE TABLE IF NOT EXISTS public.collection_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  idea_id UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, idea_id)
);

-- 3. RLS policies
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

-- Collections: users can only see/modify their own
CREATE POLICY "Users can view own collections" ON public.collections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own collections" ON public.collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own collections" ON public.collections
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own collections" ON public.collections
  FOR DELETE USING (auth.uid() = user_id);

-- Collection items: users can manage items in their own collections
CREATE POLICY "Users can view own collection items" ON public.collection_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Users can insert into own collections" ON public.collection_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own collection items" ON public.collection_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
  );

-- 4. Auto-create default "Saved" collection for new users
CREATE OR REPLACE FUNCTION public.create_default_collection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.collections (user_id, name, emoji, is_default, sort_order)
  VALUES (NEW.id, 'Saved', '💾', TRUE, 0)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Attach trigger to users table
DROP TRIGGER IF EXISTS create_default_collection_trigger ON public.users;
CREATE TRIGGER create_default_collection_trigger
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_collection();

-- 5. Auto-sync saves to default collection
CREATE OR REPLACE FUNCTION public.sync_save_to_collection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection_id UUID;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.action = 'saved' THEN
    -- Get or create default collection
    SELECT id INTO v_collection_id
    FROM public.collections
    WHERE user_id = NEW.user_id AND is_default = TRUE
    LIMIT 1;

    IF v_collection_id IS NULL THEN
      INSERT INTO public.collections (user_id, name, emoji, is_default, sort_order)
      VALUES (NEW.user_id, 'Saved', '💾', TRUE, 0)
      RETURNING id INTO v_collection_id;
    END IF;

    -- Add to default collection
    INSERT INTO public.collection_items (collection_id, idea_id)
    VALUES (v_collection_id, NEW.idea_id)
    ON CONFLICT DO NOTHING;

  ELSIF TG_OP = 'DELETE' AND OLD.action = 'saved' THEN
    -- Remove from default collection
    DELETE FROM public.collection_items ci
    USING public.collections c
    WHERE ci.collection_id = c.id
      AND c.user_id = OLD.user_id
      AND c.is_default = TRUE
      AND ci.idea_id = OLD.idea_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_save_to_collection_trigger ON public.user_interactions;
CREATE TRIGGER sync_save_to_collection_trigger
  AFTER INSERT OR DELETE ON public.user_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_save_to_collection();

-- 6. Backfill: create default collections for existing users + migrate saves
DO $$
DECLARE
  r RECORD;
  v_coll_id UUID;
BEGIN
  FOR r IN SELECT DISTINCT id FROM public.users LOOP
    INSERT INTO public.collections (user_id, name, emoji, is_default, sort_order)
    VALUES (r.id, 'Saved', '💾', TRUE, 0)
    ON CONFLICT (user_id, name) DO NOTHING
    RETURNING id INTO v_coll_id;

    IF v_coll_id IS NULL THEN
      SELECT id INTO v_coll_id FROM public.collections WHERE user_id = r.id AND is_default = TRUE LIMIT 1;
    END IF;

    IF v_coll_id IS NOT NULL THEN
      INSERT INTO public.collection_items (collection_id, idea_id)
      SELECT v_coll_id, ui.idea_id
      FROM public.user_interactions ui
      WHERE ui.user_id = r.id AND ui.action = 'saved'
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- 7. Grants
GRANT ALL ON public.collections TO authenticated;
GRANT ALL ON public.collection_items TO authenticated;
