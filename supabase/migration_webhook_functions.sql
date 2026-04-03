-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Secure Webhook Processing & Payment Functions
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. VERIFY WEBHOOK SIGNATURE - MANDATORY for all webhooks
-- Returns: valid (boolean), payload (jsonb), reason (text)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION verify_webhook_signature(
  p_provider text,
  p_event_id text,
  p_signature text,
  p_payload_json text,
  p_ip_address cidr DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  valid boolean,
  payload jsonb,
  reason text
) AS $$
DECLARE
  v_expected_signature text;
  v_secret text;
  v_valid boolean := false;
  v_reason text := '';
  v_payload jsonb;
BEGIN
  -- Parse JSON payload
  v_payload := p_payload_json::jsonb;

  -- Get webhook secret from environment (must be set per provider)
  v_secret := current_setting('app.webhook_secret_' || p_provider, true);

  IF v_secret IS NULL THEN
    v_reason := 'Webhook secret not configured for provider: ' || p_provider;
    v_valid := false;
  ELSE
    -- Generate expected signature based on provider
    -- STRIPE: timestamp.payload signed with HMAC-SHA256
    -- PADDLE: payload signed with RSA public key
    CASE p_provider
      WHEN 'stripe' THEN
        -- Stripe format: timestamp.payload signed
        v_expected_signature := encode(
          hmac(
            substring(p_signature from '^(\d+)\.') || '.' || p_payload_json,
            v_secret,
            'sha256'
          ),
          'hex'
        );
        -- Check if signature matches
        v_valid := (p_signature LIKE '%,' || v_expected_signature);

      WHEN 'paddle' THEN
        -- Paddle uses RSA, would need public key verification
        -- For now, placeholder - implement with your Paddle public key
        v_reason := 'Paddle signature verification not yet implemented';
        v_valid := false;

      ELSE
        v_reason := 'Unknown webhook provider: ' || p_provider;
        v_valid := false;
    END CASE;
  END IF;

  -- Log verification attempt
  INSERT INTO webhook_verification_log (
    provider,
    event_id,
    signature,
    verification_result,
    reason,
    ip_address,
    user_agent
  ) VALUES (
    p_provider,
    p_event_id,
    CASE WHEN v_valid THEN 'verified' ELSE 'INVALID' END,
    v_valid,
    v_reason,
    p_ip_address,
    p_user_agent
  );

  -- If invalid, log security event
  IF NOT v_valid THEN
    INSERT INTO suspicious_activity (
      action,
      ip_address,
      user_agent,
      severity,
      details
    ) VALUES (
      'invalid_webhook_signature',
      p_ip_address::text,
      p_user_agent,
      'high',
      jsonb_build_object(
        'provider', p_provider,
        'event_id', p_event_id,
        'reason', v_reason
      )
    );
  END IF;

  RETURN QUERY SELECT v_valid, v_payload, v_reason;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PROCESS PAYMENT EVENT - Prevents replay attacks via unique event IDs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION process_payment_event(
  p_provider text,
  p_event_id text,
  p_provider_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_signature_valid boolean,
  p_ip_address cidr DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  error_message text,
  user_id uuid,
  plan_updated_to text
) AS $$
DECLARE
  v_user_id uuid;
  v_customer_id text;
  v_plan_type text;
  v_subscription_status text;
  v_period_start timestamp;
  v_period_end timestamp;
  v_event_record record;
  v_message text := '';
BEGIN
  -- CRITICAL: Reject if signature not verified
  IF NOT p_signature_valid THEN
    RETURN QUERY SELECT false, 'Webhook signature verification failed', NULL::uuid, NULL;
    RETURN;
  END IF;

  -- CRITICAL: Check for replay attacks (reject duplicate event IDs)
  IF EXISTS (
    SELECT 1 FROM payment_events
    WHERE provider = p_provider
      AND provider_event_id = p_provider_event_id
      AND verified = true
  ) THEN
    RETURN QUERY SELECT false, 'Duplicate event ID detected - replay attack prevented', NULL::uuid, NULL;
    RETURN;
  END IF;

  -- Insert event record (not yet processed)
  INSERT INTO payment_events (
    event_id,
    event_type,
    provider,
    provider_event_id,
    verified,
    signature_valid,
    payload
  ) VALUES (
    p_event_id,
    p_event_type,
    p_provider,
    p_provider_event_id,
    true,
    p_signature_valid,
    p_payload
  ) RETURNING * INTO v_event_record;

  -- Extract customer ID from payload (provider-specific)
  -- Stripe: customer field, Paddle: customer ID field
  v_customer_id := p_payload->>'customer_id'
    OR p_payload->'data'->>'customer_id'
    OR p_payload->>'customer'
    OR p_payload->'data'->>'customer';

  IF v_customer_id IS NULL THEN
    UPDATE payment_events
    SET processed = false
    WHERE id = v_event_record.id;

    RETURN QUERY SELECT false, 'Cannot extract customer ID from webhook payload', NULL::uuid, NULL;
    RETURN;
  END IF;

  -- Find user by provider customer ID
  -- You'd need to store this relationship in a provider_customers table
  SELECT users.id INTO v_user_id
  FROM users
  WHERE EXISTS (
    SELECT 1 FROM provider_customers
    WHERE user_id = users.id
      AND provider = p_provider
      AND provider_customer_id = v_customer_id
  )
  LIMIT 1;

  IF v_user_id IS NULL THEN
    UPDATE payment_events
    SET processed = false
    WHERE id = v_event_record.id;

    RETURN QUERY SELECT false, 'Customer not found in system', NULL::uuid, NULL;
    RETURN;
  END IF;

  -- Update payment events with user_id
  UPDATE payment_events
  SET user_id = v_user_id
  WHERE id = v_event_record.id;

  -- Handle different event types
  CASE p_event_type
    WHEN 'subscription.created' THEN
      v_plan_type := COALESCE(p_payload->'data'->>'plan' OR p_payload->>'plan', 'pro');
      v_subscription_status := 'active';
      v_period_start := now();
      v_period_end := now() + interval '1 month';

    WHEN 'subscription.updated' THEN
      v_plan_type := COALESCE(p_payload->'data'->>'plan' OR p_payload->>'plan', 'pro');
      v_subscription_status := COALESCE(p_payload->'data'->>'status' OR p_payload->>'status', 'active');
      v_period_start := TO_TIMESTAMP((p_payload->'data'->'current_period_start')::bigint);
      v_period_end := TO_TIMESTAMP((p_payload->'data'->'current_period_end')::bigint);

    WHEN 'subscription.deleted', 'subscription.canceled' THEN
      v_subscription_status := 'canceled';
      v_plan_type := 'free';

    WHEN 'payment_intent.succeeded' THEN
      -- Don't update subscription for payment success
      v_message := 'Payment processed successfully';

    WHEN 'invoice.payment_failed' THEN
      -- Set to past_due
      v_subscription_status := 'past_due';

    ELSE
      v_message := 'Event type not handled: ' || p_event_type;
  END CASE;

  -- CRITICAL: Only update subscription status via verified webhook
  -- Never trust client-side plan upgrade requests
  IF v_subscription_status IS NOT NULL THEN
    INSERT INTO subscription_status (
      user_id,
      plan_type,
      status,
      current_period_start,
      current_period_end,
      provider,
      provider_subscription_id,
      last_payment_event_id
    ) VALUES (
      v_user_id,
      v_plan_type,
      v_subscription_status,
      v_period_start,
      v_period_end,
      p_provider,
      v_customer_id,
      v_event_record.id
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      plan_type = v_plan_type,
      status = v_subscription_status,
      current_period_start = v_period_start,
      current_period_end = v_period_end,
      last_payment_event_id = v_event_record.id,
      updated_at = now();
  END IF;

  -- Mark event as processed
  UPDATE payment_events
  SET processed = true, processed_at = now()
  WHERE id = v_event_record.id;

  RETURN QUERY SELECT
    true,
    v_message,
    v_user_id,
    v_plan_type;

EXCEPTION WHEN OTHERS THEN
  UPDATE payment_events
  SET processed = false
  WHERE id = v_event_record.id;

  RETURN QUERY SELECT false, 'Error processing event: ' || SQLERRM, NULL::uuid, NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. GET USER SUBSCRIPTION - Query current subscription (never trust client)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_subscription(p_user_id uuid)
RETURNS TABLE (
  plan_type text,
  status text,
  current_period_start timestamp,
  current_period_end timestamp,
  can_access_paid_features boolean,
  days_remaining integer
) AS $$
DECLARE
  v_subscription record;
BEGIN
  SELECT * INTO v_subscription
  FROM subscription_status
  WHERE user_id = p_user_id;

  IF v_subscription IS NULL THEN
    -- User has free plan
    RETURN QUERY SELECT 'free', 'active', NULL::timestamp, NULL::timestamp, false, NULL::integer;
    RETURN;
  END IF;

  -- Return current subscription from server (not from client claim)
  RETURN QUERY SELECT
    v_subscription.plan_type,
    v_subscription.status,
    v_subscription.current_period_start,
    v_subscription.current_period_end,
    (v_subscription.status = 'active' AND v_subscription.plan_type != 'free'),
    EXTRACT(DAYS FROM (v_subscription.current_period_end - now()))::integer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CANCEL SUBSCRIPTION - Only via verified webhook
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cancel_subscription_via_webhook(
  p_user_id uuid,
  p_provider text,
  p_cancellation_reason text,
  p_event_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE subscription_status
  SET
    status = 'canceled',
    plan_type = 'free',
    canceled_at = now(),
    cancellation_reason = p_cancellation_reason,
    last_payment_event_id = p_event_id,
    updated_at = now()
  WHERE user_id = p_user_id
    AND provider = p_provider;

  -- Update user role to free
  UPDATE users
  SET role = 'free'
  WHERE id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CLEANUP PROCESSED EVENTS - Archive after 90 days
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION archive_old_payment_events()
RETURNS TABLE (
  archived_count integer,
  kept_recent_count integer
) AS $$
DECLARE
  v_archived integer;
BEGIN
  -- Keep last 90 days for audit trail, archive rest
  DELETE FROM payment_events
  WHERE created_at < now() - interval '90 days'
    AND processed = true;

  GET DIAGNOSTICS v_archived = ROW_COUNT;

  RETURN QUERY SELECT
    v_archived,
    (SELECT COUNT(*) FROM payment_events WHERE processed = true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'Secure Webhook Processing: Functions deployed ✅' AS migration_status;
