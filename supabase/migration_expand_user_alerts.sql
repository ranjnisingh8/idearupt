-- Migration: Expand user_alerts table for Sniper Mode
-- Adds structured alert criteria (niches, pain threshold, frequency)

-- Add new columns (safe with IF NOT EXISTS pattern via DO block)
DO $$
BEGIN
  -- Alert name
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_alerts' AND column_name = 'name') THEN
    ALTER TABLE user_alerts ADD COLUMN name TEXT DEFAULT 'My Alert';
  END IF;

  -- Niche categories to match
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_alerts' AND column_name = 'niches') THEN
    ALTER TABLE user_alerts ADD COLUMN niches TEXT[] DEFAULT '{}';
  END IF;

  -- Minimum pain score threshold
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_alerts' AND column_name = 'min_pain_score') THEN
    ALTER TABLE user_alerts ADD COLUMN min_pain_score NUMERIC DEFAULT 6;
  END IF;

  -- Alert frequency
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_alerts' AND column_name = 'frequency') THEN
    ALTER TABLE user_alerts ADD COLUMN frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly'));
  END IF;

  -- Active/paused status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_alerts' AND column_name = 'status') THEN
    ALTER TABLE user_alerts ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused'));
  END IF;

  -- Last triggered timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_alerts' AND column_name = 'last_triggered_at') THEN
    ALTER TABLE user_alerts ADD COLUMN last_triggered_at TIMESTAMPTZ;
  END IF;

  -- Cumulative matches count
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_alerts' AND column_name = 'matches_count') THEN
    ALTER TABLE user_alerts ADD COLUMN matches_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Index for fetching active alerts
CREATE INDEX IF NOT EXISTS idx_user_alerts_status ON user_alerts (status) WHERE status = 'active';
