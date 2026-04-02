-- ============================================
-- IDEARUPT DATABASE SCHEMA V2 (PRODUCTION)
-- Matches frontend expectations exactly
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USERS TABLE (auth metadata)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  notification_preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. IDEAS TABLE (core content)
-- ============================================
DROP TABLE IF EXISTS user_interactions CASCADE;
DROP TABLE IF EXISTS pain_signals CASCADE;
DROP TABLE IF EXISTS idea_validations CASCADE;
DROP TABLE IF EXISTS ideas CASCADE;

CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Core fields
  title TEXT NOT NULL,
  one_liner TEXT,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  "categoryColor" TEXT DEFAULT 'bg-primary',

  -- Target & Problem
  target_audience TEXT,
  "targetAudience" TEXT,  -- camelCase alias used by frontend
  problem_statement TEXT,

  -- Scoring - individual columns (used by scraper & validate-idea)
  overall_score NUMERIC(4,1) DEFAULT 0,
  pain_score NUMERIC(4,1) DEFAULT 0,
  trend_score NUMERIC(4,1) DEFAULT 0,
  competition_score NUMERIC(4,1) DEFAULT 0,
  revenue_potential NUMERIC(4,1) DEFAULT 0,
  build_difficulty NUMERIC(4,1) DEFAULT 0,

  -- Scores JSONB (frontend reads this too)
  scores JSONB DEFAULT '{}'::jsonb,

  -- MRR & Tier
  estimated_mrr_range TEXT,
  "estimatedMRR" TEXT,  -- camelCase alias
  tier TEXT CHECK (tier IN ('S', 'A', 'B', 'C')),

  -- Tags & categorization
  tags TEXT[] DEFAULT '{}',
  "techLevel" TEXT,
  keywords TEXT[],

  -- Engagement counts
  save_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  build_count INTEGER DEFAULT 0,
  is_trending BOOLEAN DEFAULT FALSE,

  -- Source tracking
  source TEXT,
  source_url TEXT,
  source_type TEXT CHECK (source_type IS NULL OR source_type IN ('reddit', 'hackernews', 'manual', 'ai_generated')),
  source_subreddit TEXT,
  source_title TEXT,
  upvotes INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,

  -- AI-generated structured data
  validation_data JSONB DEFAULT '{}'::jsonb,
  competitors JSONB DEFAULT '[]'::jsonb,
  feedback_quotes JSONB DEFAULT '[]'::jsonb,

  -- Blueprint data (static per idea)
  blueprint JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  source_created_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT ideas_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT ideas_description_not_empty CHECK (length(trim(description)) > 5)
);

-- Indexes for performance
CREATE INDEX idx_ideas_category ON ideas(category);
CREATE INDEX idx_ideas_tier ON ideas(tier);
CREATE INDEX idx_ideas_overall_score ON ideas(overall_score DESC);
CREATE INDEX idx_ideas_created_at ON ideas(created_at DESC);
CREATE INDEX idx_ideas_source_type ON ideas(source_type);
CREATE INDEX idx_ideas_is_trending ON ideas(is_trending) WHERE is_trending = TRUE;

-- ============================================
-- 3. USER INTERACTIONS TABLE (saves, views, shares)
-- ============================================
CREATE TABLE user_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('viewed', 'saved', 'shared')),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT user_interactions_unique UNIQUE (user_id, idea_id, action)
);

CREATE INDEX idx_user_interactions_user ON user_interactions(user_id);
CREATE INDEX idx_user_interactions_idea ON user_interactions(idea_id);
CREATE INDEX idx_user_interactions_action ON user_interactions(user_id, action);

-- ============================================
-- 4. BUILDER DNA TABLE (onboarding profile)
-- ============================================
CREATE TABLE builder_dna (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  tech_level TEXT CHECK (tech_level IN ('no_code', 'low_code', 'full_stack')),
  budget_range TEXT CHECK (budget_range IN ('zero', 'low', 'medium', 'high')),
  time_commitment TEXT CHECK (time_commitment IN ('side_hustle', 'part_time', 'full_time')),
  industries TEXT[] DEFAULT '{}',
  risk_tolerance TEXT CHECK (risk_tolerance IN ('safe', 'moderate', 'moonshot')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. PAIN SIGNALS TABLE (scraped complaints)
-- ============================================
CREATE TABLE pain_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  body TEXT,
  source_platform TEXT NOT NULL CHECK (source_platform IN ('reddit', 'hackernews')),
  source_url TEXT,
  subreddit TEXT,
  author TEXT,
  upvotes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  engagement_score NUMERIC(6,1) DEFAULT 0,
  sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('frustrated', 'angry', 'desperate', 'hopeful', 'neutral')),
  pain_keywords TEXT[] DEFAULT '{}',
  category TEXT,
  linked_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT pain_signals_title_not_empty CHECK (length(trim(title)) > 0)
);

CREATE INDEX idx_pain_signals_discovered ON pain_signals(discovered_at DESC);
CREATE INDEX idx_pain_signals_platform ON pain_signals(source_platform);
CREATE INDEX idx_pain_signals_linked_idea ON pain_signals(linked_idea_id) WHERE linked_idea_id IS NOT NULL;
CREATE INDEX idx_pain_signals_sentiment ON pain_signals(sentiment);

-- ============================================
-- 6. IDEA VALIDATIONS TABLE (AI validation history)
-- ============================================
CREATE TABLE idea_validations (
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

CREATE INDEX idx_validations_user ON idea_validations(user_id);

-- ============================================
-- 7. USER ALERTS TABLE
-- ============================================
CREATE TABLE user_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_filter TEXT[] DEFAULT '{}',
  min_score NUMERIC(3,1) DEFAULT 7.0,
  keywords TEXT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_alerts_user ON user_alerts(user_id);

-- ============================================
-- 8. PRO WAITLIST TABLE
-- ============================================
CREATE TABLE pro_waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  source TEXT DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pro_waitlist_email_unique UNIQUE (email)
);

-- ============================================
-- 9. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE pain_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_waitlist ENABLE ROW LEVEL SECURITY;

-- USERS: Users can read/update their own row; service role can do all
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- IDEAS: Everyone can read; inserts/updates allowed for anyone (scraper uses anon key)
CREATE POLICY "Ideas are viewable by everyone" ON ideas FOR SELECT USING (true);
CREATE POLICY "Ideas insertable by anyone" ON ideas FOR INSERT WITH CHECK (true);
CREATE POLICY "Ideas updatable by anyone" ON ideas FOR UPDATE USING (true);

-- USER INTERACTIONS: Users manage their own
CREATE POLICY "Users can view own interactions" ON user_interactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own interactions" ON user_interactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own interactions" ON user_interactions FOR DELETE USING (auth.uid() = user_id);

-- BUILDER DNA: Users manage their own
CREATE POLICY "Users can view own dna" ON builder_dna FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own dna" ON builder_dna FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own dna" ON builder_dna FOR UPDATE USING (auth.uid() = user_id);

-- PAIN SIGNALS: Everyone can read; inserts allowed for scraper
CREATE POLICY "Pain signals viewable by everyone" ON pain_signals FOR SELECT USING (true);
CREATE POLICY "Pain signals insertable" ON pain_signals FOR INSERT WITH CHECK (true);

-- IDEA VALIDATIONS: Users see their own + anonymous
CREATE POLICY "Users can view own validations" ON idea_validations FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Anyone can insert validations" ON idea_validations FOR INSERT WITH CHECK (true);

-- USER ALERTS: Users manage their own
CREATE POLICY "Users can view own alerts" ON user_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON user_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON user_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON user_alerts FOR DELETE USING (auth.uid() = user_id);

-- PRO WAITLIST: Anyone can insert; users can see own
CREATE POLICY "Anyone can join waitlist" ON pro_waitlist FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own waitlist" ON pro_waitlist FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- ============================================
-- 10. FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ideas_updated_at
  BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER builder_dna_updated_at
  BEFORE UPDATE ON builder_dna
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate tier based on overall_score
CREATE OR REPLACE FUNCTION calculate_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.overall_score >= 8.0 THEN
    NEW.tier = 'S';
  ELSIF NEW.overall_score >= 7.0 THEN
    NEW.tier = 'A';
  ELSIF NEW.overall_score >= 6.0 THEN
    NEW.tier = 'B';
  ELSE
    NEW.tier = 'C';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ideas_calculate_tier
  BEFORE INSERT OR UPDATE OF overall_score ON ideas
  FOR EACH ROW EXECUTE FUNCTION calculate_tier();

-- Auto-sync scores JSONB from individual columns on insert/update
CREATE OR REPLACE FUNCTION sync_scores_jsonb()
RETURNS TRIGGER AS $$
BEGIN
  -- If individual score columns are set but scores JSONB is empty, populate it
  IF (NEW.scores IS NULL OR NEW.scores = '{}'::jsonb) AND
     (NEW.pain_score IS NOT NULL OR NEW.trend_score IS NOT NULL) THEN
    NEW.scores = jsonb_build_object(
      'pain_score', COALESCE(NEW.pain_score, 0),
      'trend_score', COALESCE(NEW.trend_score, 0),
      'competition_score', COALESCE(NEW.competition_score, 0),
      'revenue_potential', COALESCE(NEW.revenue_potential, 0),
      'build_difficulty', COALESCE(NEW.build_difficulty, 0)
    );
  END IF;

  -- Sync targetAudience camelCase alias
  IF NEW."targetAudience" IS NULL AND NEW.target_audience IS NOT NULL THEN
    NEW."targetAudience" = NEW.target_audience;
  ELSIF NEW.target_audience IS NULL AND NEW."targetAudience" IS NOT NULL THEN
    NEW.target_audience = NEW."targetAudience";
  END IF;

  -- Sync estimatedMRR alias
  IF NEW."estimatedMRR" IS NULL AND NEW.estimated_mrr_range IS NOT NULL THEN
    NEW."estimatedMRR" = NEW.estimated_mrr_range;
  ELSIF NEW.estimated_mrr_range IS NULL AND NEW."estimatedMRR" IS NOT NULL THEN
    NEW.estimated_mrr_range = NEW."estimatedMRR";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ideas_sync_scores
  BEFORE INSERT OR UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION sync_scores_jsonb();

-- ============================================
-- 11. ENABLE REALTIME for ideas and pain_signals
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE ideas;
ALTER PUBLICATION supabase_realtime ADD TABLE pain_signals;

-- ============================================
-- 12. VERIFY SCHEMA
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('users', 'ideas', 'user_interactions', 'builder_dna', 'pain_signals', 'idea_validations', 'user_alerts', 'pro_waitlist')
ORDER BY table_name;
