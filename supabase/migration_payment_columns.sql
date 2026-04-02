-- ─── ADD PAYMENT-RELATED COLUMNS TO USERS TABLE ─────────────────
-- Required for LemonSqueezy webhook integration.
-- RUN THIS IN SUPABASE SQL EDITOR
-- ─────────────────────────────────────────────────────────────────

-- LemonSqueezy subscription ID for managing subscriptions
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS ls_subscription_id TEXT;

-- When the user upgraded to Pro
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS upgraded_at TIMESTAMPTZ;

-- Index for quick lookups by subscription ID
CREATE INDEX IF NOT EXISTS idx_users_ls_subscription_id
ON public.users(ls_subscription_id)
WHERE ls_subscription_id IS NOT NULL;

-- ─── VERIFY ─────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'users' AND column_name IN ('ls_subscription_id', 'upgraded_at');
