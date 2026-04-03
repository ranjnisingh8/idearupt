-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Provider Integration & Helpers
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROVIDER CUSTOMERS MAPPING TABLE
-- Links users to their external payment provider IDs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_customer_id text NOT NULL,
  provider_email text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT unique_provider_customer UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_provider_customers_user_id ON provider_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_customers_provider_id ON provider_customers(provider, provider_customer_id);

-- Enable RLS
ALTER TABLE provider_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_customers_user_view" ON provider_customers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LINK PROVIDER CUSTOMER - When user first subscribes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION link_provider_customer(
  p_user_id uuid,
  p_provider text,
  p_provider_customer_id text,
  p_provider_email text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_record_id uuid;
BEGIN
  INSERT INTO provider_customers (
    user_id,
    provider,
    provider_customer_id,
    provider_email
  ) VALUES (
    p_user_id,
    p_provider,
    p_provider_customer_id,
    p_provider_email
  )
  ON CONFLICT (user_id, provider)
  DO UPDATE SET
    provider_customer_id = p_provider_customer_id,
    provider_email = p_provider_email
  RETURNING id INTO v_record_id;

  RETURN v_record_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VERIFY USER CAN ACCESS PAID FEATURE
-- Should be called in all protected endpoints
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION user_can_access_feature(
  p_user_id uuid,
  p_feature text DEFAULT 'pro'
)
RETURNS TABLE (
  allowed boolean,
  current_plan text,
  reason text
) AS $$
DECLARE
  v_subscription record;
BEGIN
  -- Get user's current subscription from server
  SELECT * INTO v_subscription
  FROM subscription_status
  WHERE user_id = p_user_id;

  -- If no subscription, check if user is free
  IF v_subscription IS NULL THEN
    RETURN QUERY SELECT
      (p_feature = 'free'),
      'free',
      CASE WHEN p_feature = 'free' THEN 'Access allowed' ELSE 'Upgrade required' END;
    RETURN;
  END IF;

  -- Check subscription is active and not expired
  IF v_subscription.status != 'active' THEN
    RETURN QUERY SELECT false, v_subscription.plan_type, 'Subscription not active: ' || v_subscription.status;
    RETURN;
  END IF;

  IF v_subscription.current_period_end < now() THEN
    RETURN QUERY SELECT false, v_subscription.plan_type, 'Subscription expired';
    RETURN;
  END IF;

  -- Check if plan has feature
  RETURN QUERY SELECT
    (v_subscription.plan_type IN ('pro', 'business')),
    v_subscription.plan_type,
    CASE
      WHEN v_subscription.plan_type IN ('pro', 'business') THEN 'Access allowed'
      ELSE 'Your plan does not include this feature'
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. GET PAYMENT HISTORY - For user support/debugging
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_payment_history(p_user_id uuid)
RETURNS TABLE (
  event_type text,
  plan_type text,
  status text,
  amount numeric,
  created_at timestamp
) AS $$
BEGIN
  -- Only allow viewing own history or admin
  IF p_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Cannot view other users payment history';
  END IF;

  RETURN QUERY
  SELECT
    pe.event_type,
    (pe.payload->>'plan' OR pe.payload->'data'->>'plan')::text,
    (pe.payload->>'status' OR pe.payload->'data'->>'status')::text,
    COALESCE((pe.payload->>'amount' OR pe.payload->'data'->>'amount')::numeric, 0),
    pe.created_at
  FROM payment_events pe
  WHERE pe.user_id = p_user_id
    AND pe.verified = true
    AND pe.processed = true
  ORDER BY pe.created_at DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. DETECT DUPLICATE WEBHOOK ATTEMPTS (Admin Dashboard)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_duplicate_webhook_attempts()
RETURNS TABLE (
  provider text,
  event_id text,
  attempt_count integer,
  first_attempt timestamp,
  last_attempt timestamp,
  ip_addresses text[]
) AS $$
BEGIN
  -- Only admins
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    wvl.provider,
    wvl.event_id,
    COUNT(*)::integer,
    MIN(wvl.created_at),
    MAX(wvl.created_at),
    ARRAY_AGG(DISTINCT wvl.ip_address::text) FILTER (WHERE wvl.ip_address IS NOT NULL)
  FROM webhook_verification_log wvl
  WHERE wvl.created_at > now() - interval '7 days'
  GROUP BY wvl.provider, wvl.event_id
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'Provider Integration: Tables & Functions deployed ✅' AS migration_status;
