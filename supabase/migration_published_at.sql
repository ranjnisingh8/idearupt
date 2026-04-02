-- Migration: Add published_at column to ideas table for 48-hour early access feature
-- Pro users see new ideas immediately. Free users see them after a 48-hour delay.

-- Add the column (defaults to NOW() so new ideas get a timestamp automatically)
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing ideas: set published_at to their created_at
UPDATE ideas SET published_at = created_at WHERE published_at IS NULL;

-- Index for efficient filtering by published_at
CREATE INDEX IF NOT EXISTS idx_ideas_published_at ON ideas(published_at DESC);
