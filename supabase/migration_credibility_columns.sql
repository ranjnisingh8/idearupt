-- ─── Credibility proof columns for ideas ────────────────────
-- Run once in Supabase SQL Editor
-- These columns power the proof line on idea cards and the
-- Pain Proof section on the detail page.

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS distinct_posters INTEGER DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS distinct_communities INTEGER DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS recurrence_weeks INTEGER DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS pain_type TEXT DEFAULT 'vocal';
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS source_threads JSONB DEFAULT '[]';
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS wtp_quotes JSONB DEFAULT '[]';
