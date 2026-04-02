-- ============================================
-- IDEARUPT DATABASE MIGRATION V2
-- Adds missing columns and tables
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ADD MISSING COLUMNS TO ideas TABLE
-- ============================================

-- Add scores JSONB column (frontend reads this)
DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS scores JSONB DEFAULT '{}'::jsonb;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add source tracking columns
DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS source_type TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS source_subreddit TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS source_title TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS upvotes INTEGER DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS source_created_at TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add AI content columns
DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS competitors JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS feedback_quotes JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS keywords TEXT[];
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add blueprint JSONB
DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS blueprint JSONB;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Populate scores JSONB from individual columns for all existing rows
UPDATE ideas
SET scores = jsonb_build_object(
  'pain_score', COALESCE(pain_score, 0),
  'trend_score', COALESCE(trend_score, 0),
  'competition_score', COALESCE(competition_score, 0),
  'revenue_potential', COALESCE(
    CASE WHEN revenue_potential ~ '^\d+\.?\d*$' THEN revenue_potential::numeric ELSE 0 END,
    0
  ),
  'build_difficulty', COALESCE(build_difficulty, 0)
)
WHERE scores IS NULL OR scores = '{}'::jsonb;

-- ============================================
-- 2. CREATE idea_validations TABLE (missing)
-- ============================================
CREATE TABLE IF NOT EXISTS idea_validations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idea_text TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  proof_stack_score INTEGER CHECK (proof_stack_score IS NULL OR (proof_stack_score >= 0 AND proof_stack_score <= 10)),
  verdict TEXT CHECK (verdict IS NULL OR verdict IN ('BUILD_IT', 'VALIDATE_MORE', 'DONT_BUILD')),
  validation_markdown TEXT,
  validation_json JSONB,
  competitors_found JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validations_user ON idea_validations(user_id);

-- RLS for idea_validations
ALTER TABLE idea_validations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own validations" ON idea_validations FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can insert validations" ON idea_validations FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 3. ADD MISSING INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_ideas_category ON ideas(category);
CREATE INDEX IF NOT EXISTS idx_ideas_tier ON ideas(tier);
CREATE INDEX IF NOT EXISTS idx_ideas_overall_score ON ideas(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_source_type ON ideas(source_type);
CREATE INDEX IF NOT EXISTS idx_ideas_is_trending ON ideas(is_trending) WHERE is_trending = TRUE;

-- ============================================
-- 4. CREATE/UPDATE TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DO $$ BEGIN
  CREATE TRIGGER ideas_updated_at
    BEFORE UPDATE ON ideas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-calculate tier based on overall_score
CREATE OR REPLACE FUNCTION calculate_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.overall_score >= 8 THEN
    NEW.tier = 'S';
    NEW.tier_label = 'Exceptional Opportunity';
  ELSIF NEW.overall_score >= 7 THEN
    NEW.tier = 'A';
    NEW.tier_label = 'Strong Opportunity';
  ELSIF NEW.overall_score >= 6 THEN
    NEW.tier = 'B';
    NEW.tier_label = 'Good Opportunity';
  ELSE
    NEW.tier = 'C';
    NEW.tier_label = 'Worth Exploring';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate tier trigger to use updated function
DROP TRIGGER IF EXISTS ideas_calculate_tier ON ideas;
CREATE TRIGGER ideas_calculate_tier
  BEFORE INSERT OR UPDATE OF overall_score ON ideas
  FOR EACH ROW EXECUTE FUNCTION calculate_tier();

-- Sync scores JSONB whenever individual score columns change
CREATE OR REPLACE FUNCTION sync_scores_jsonb()
RETURNS TRIGGER AS $$
BEGIN
  -- Build scores JSONB from individual columns
  NEW.scores = jsonb_build_object(
    'pain_score', COALESCE(NEW.pain_score, 0),
    'trend_score', COALESCE(NEW.trend_score, 0),
    'competition_score', COALESCE(NEW.competition_score, 0),
    'revenue_potential', COALESCE(
      CASE
        WHEN NEW.revenue_potential IS NOT NULL AND NEW.revenue_potential ~ '^\d+\.?\d*$'
        THEN NEW.revenue_potential::numeric
        ELSE 0
      END, 0
    ),
    'build_difficulty', COALESCE(NEW.build_difficulty, 0)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ideas_sync_scores ON ideas;
CREATE TRIGGER ideas_sync_scores
  BEFORE INSERT OR UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION sync_scores_jsonb();

-- ============================================
-- 5. ENSURE REALTIME IS ENABLED
-- ============================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE ideas;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pain_signals;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 6. VERIFY
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('users', 'ideas', 'user_interactions', 'builder_dna', 'pain_signals', 'idea_validations', 'user_alerts', 'pro_waitlist')
ORDER BY table_name;
