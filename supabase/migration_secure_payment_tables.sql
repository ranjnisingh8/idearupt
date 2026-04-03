-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Secure Payment & Subscription System
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PAYMENT EVENTS TABLE - Immutable webhook event log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  event_id text NOT NULL UNIQUE, -- External webhook event ID (prevents replays)
  event_type text NOT NULL,
  provider text NOT NULL, -- 'stripe', 'paddle', etc
  provider_event_id text NOT NULL,
  verified boolean DEFAULT false NOT NULL,
  signature_valid boolean DEFAULT false NOT NULL,
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  processed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT unique_event_per_provider UNIQUE(provider, provider_event_id)
);

-- Indexes for query optimization
CREATE INDEX IF NOT EXISTS idx_payment_events_user_id ON payment_events(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_id ON payment_events(event_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_provider_event ON payment_events(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON payment_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_verified ON payment_events(verified) WHERE verified = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SUBSCRIPTION STATUS TABLE - Source of truth for subscriptions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_type text NOT NULL CHECK (plan_type IN ('free', 'pro', 'business')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'canceled', 'past_due')),
  current_period_start timestamp,
  current_period_end timestamp,
  canceled_at timestamp,
  cancellation_reason text,
  provider text NOT NULL, -- 'stripe', 'paddle', etc
  provider_subscription_id text,
  last_payment_event_id uuid REFERENCES payment_events(id),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT valid_subscription_dates CHECK (
    CASE
      WHEN status = 'active' THEN current_period_start IS NOT NULL AND current_period_end IS NOT NULL
      ELSE true
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_subscription_status_user_id ON subscription_status(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_status_plan ON subscription_status(plan_type);
CREATE INDEX IF NOT EXISTS idx_subscription_status_updated ON subscription_status(updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. WEBHOOK SIGNATURE VERIFICATION LOG
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_verification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  signature text NOT NULL,
  verification_result boolean NOT NULL,
  reason text,
  ip_address cidr,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_verification_log_provider ON webhook_verification_log(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_verification_log_event_id ON webhook_verification_log(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_verification_log_result ON webhook_verification_log(verification_result);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_status ENABLE ROW LEVEL SECURITY;

-- Users can view their own payment events
CREATE POLICY "payment_events_user_view" ON payment_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only system can insert payment events
CREATE POLICY "payment_events_system_insert" ON payment_events
  FOR INSERT
  WITH CHECK (true); -- Verified by function

-- Users can view their own subscription
CREATE POLICY "subscription_status_user_view" ON subscription_status
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only system can update subscription
CREATE POLICY "subscription_status_system_update" ON subscription_status
  FOR UPDATE
  USING (false) -- Cannot update via client
  WITH CHECK (false);

-- Admins can view all
CREATE POLICY "payment_events_admin_view" ON payment_events
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "subscription_status_admin_view" ON subscription_status
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GRANT PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON payment_events FROM authenticated, anon;
REVOKE ALL ON subscription_status FROM authenticated, anon;
REVOKE ALL ON webhook_verification_log FROM authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'Secure Payment & Subscription: Tables created ✅' AS migration_status;
