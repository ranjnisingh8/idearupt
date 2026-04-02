-- ============================================
-- MIGRATION: Add Proof Columns to Ideas Table
-- Adds credibility/proof data for conviction display
-- ============================================

-- Proof metrics — how many unique people, communities, and how long the pain has persisted
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS distinct_posters INTEGER DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS distinct_communities INTEGER DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS recurrence_weeks INTEGER DEFAULT 0;

-- Pain type classification: paid (people paying for bad solutions), vocal (loud complaints), latent (silent struggle)
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS pain_type TEXT DEFAULT 'vocal'
  CHECK (pain_type IS NULL OR pain_type IN ('paid', 'vocal', 'latent'));

-- Source threads — JSONB array of original discussion threads that spawned this idea
-- Each entry: { url, title, platform, upvotes, comments, subreddit? }
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS source_threads JSONB DEFAULT '[]'::jsonb;

-- WTP (Willingness To Pay) quotes — JSONB array of real user quotes showing payment intent
-- Each entry: { quote, source, url?, upvotes? }
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS wtp_quotes JSONB DEFAULT '[]'::jsonb;

-- Index for pain_type filtering
CREATE INDEX IF NOT EXISTS idx_ideas_pain_type ON ideas(pain_type);
