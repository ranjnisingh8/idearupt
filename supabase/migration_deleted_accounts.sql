-- Archive table for deleted accounts
-- Stores a full snapshot of user data before account deletion
-- Only accessible by service_role (admin), not by any authenticated user

CREATE TABLE IF NOT EXISTS deleted_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_user_id UUID NOT NULL,
  email TEXT,
  display_name TEXT,
  plan_status TEXT, -- 'free', 'trial', 'pro'
  is_early_adopter BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  -- Full JSON snapshots of all user data
  user_row JSONB,       -- public.users row
  builder_dna JSONB,    -- builder_dna row
  interactions JSONB,   -- all user_interactions rows
  validations JSONB,    -- all idea_validations rows
  alerts JSONB,         -- all user_alerts rows
  usage JSONB,          -- all usage_tracking rows
  saved_ideas JSONB,    -- all user_saved_ideas rows
  collections JSONB,    -- all collections + items
  notification_prefs JSONB
);

-- No RLS — only service_role can access this table
ALTER TABLE deleted_accounts ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated roles
-- Only service_role (used by edge functions) can read/write

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_email ON deleted_accounts(email);
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_deleted_at ON deleted_accounts(deleted_at);
