-- ============================================
-- FEATURE WAITLIST TABLE
-- Tracks opt-ins for upcoming features
-- (e.g. "Find Your First Users" distribution engine)
-- ============================================

CREATE TABLE IF NOT EXISTS feature_waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  feature TEXT NOT NULL DEFAULT 'distribution_engine',
  source TEXT DEFAULT 'landing_page',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT feature_waitlist_email_feature_unique UNIQUE (email, feature)
);

CREATE INDEX IF NOT EXISTS idx_feature_waitlist_feature ON feature_waitlist(feature);
CREATE INDEX IF NOT EXISTS idx_feature_waitlist_created ON feature_waitlist(created_at DESC);

-- Enable RLS
ALTER TABLE feature_waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone can join (for anonymous visitors)
CREATE POLICY "Anyone can join feature waitlist" ON feature_waitlist FOR INSERT WITH CHECK (true);
-- Users can see their own entries
CREATE POLICY "Users can view own feature waitlist" ON feature_waitlist FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- Enable realtime for live count updates
ALTER PUBLICATION supabase_realtime ADD TABLE feature_waitlist;

-- Also ensure pro_waitlist has a source column (should already exist from schema.sql)
-- This is idempotent — it will only add if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pro_waitlist' AND column_name = 'source'
  ) THEN
    ALTER TABLE pro_waitlist ADD COLUMN source TEXT DEFAULT 'unknown';
  END IF;
END
$$;
