# 🔐 SECURE OTP & PAYMENT SYSTEMS

Complete SQL migration suite for secure OTP authentication and payment webhook processing.

---

## 📋 Quick Summary

**6 Migration Files** | **16+ Functions** | **6 Tables** | **Complete Audit Trail**

Implements:
- ✅ Rate-limited OTP system (max 5 per 10 minutes)
- ✅ Hashed OTP codes (never stored as plaintext)
- ✅ Enumeration prevention
- ✅ Mandatory webhook signature verification
- ✅ Replay attack prevention (unique event IDs)
- ✅ Server-side subscription authority

---

## 🚀 DEPLOYMENT ORDER

```
1. migration_secure_otp_tables.sql
   └─ Creates: otp_requests, otp_codes, otp_audit_log tables

2. migration_otp_functions.sql
   └─ Deploys: OTP management functions with rate limiting & hashing

3. migration_secure_payment_tables.sql
   └─ Creates: payment_events, subscription_status, provider_customers tables

4. migration_webhook_functions.sql
   └─ Deploys: Webhook processing with mandatory signature verification

5. migration_provider_integration.sql
   └─ Deploys: Provider linking, feature access, payment history functions

6. Verify: migration_otp_payment_verify.sql
   └─ Run in Supabase SQL Editor to confirm all features deployed
```

---

## 🔐 OTP AUTHENTICATION SYSTEM

### Tables

#### `otp_requests` - Rate Limiting Tracker
```sql
id (uuid)           -- Primary key
identifier (text)   -- Email or phone
ip_address (text)   -- Source IP
user_agent (text)   -- Browser identifier
created_at (timestamp)
```
**Purpose:** Track OTP requests to enforce rate limits  
**Cleanup:** Purged after 24 hours

#### `otp_codes` - Hashed OTP Storage
```sql
id (uuid)
user_id (uuid)
identifier (text)
code_hash (text)    -- SHA256 hashed, NEVER plaintext
attempts_remaining (int)  -- Max 5 attempts
created_at (timestamp)
expires_at (timestamp)    -- 5 minutes after creation
verified_at (timestamp)   -- When verified
method (text)             -- 'email', 'sms', 'authenticator'
```
**Purpose:** Store secure OTP codes  
**Security:** Codes hashed immediately, never logged as plaintext

#### `otp_audit_log` - Compliance Audit Trail
```sql
id (uuid)
user_id (uuid)
identifier (text)
action (text)       -- 'requested', 'verified', 'failed', 'expired', 'blocked'
reason (text)       -- Why failed/expired
ip_address (text)
user_agent (text)
created_at (timestamp)
```
**Purpose:** Complete audit trail for compliance & investigation

### Core OTP Functions

#### 1. `request_otp_secure()`
```sql
SELECT * FROM request_otp_secure(
  p_identifier := 'user@example.com',
  p_ip_address := request.ip,
  p_user_agent := request.user_agent,
  p_method := 'email'
);
```

**What It Does:**
1. Generates random 6-digit OTP code
2. Checks rate limit (max 5 per 10 minutes per identifier, 50 per hour per IP)
3. Hashes OTP code (never stores plaintext)
4. Sets 5-minute expiration
5. Logs request to audit trail

**Returns:** `{ success, message, request_id }`

**Prevents:**
- Brute force attempts (rate limited)
- Enumeration (always returns same message)

**Key Feature:** Always returns same message whether account exists or not
```
"If account exists, OTP will be sent. Check spam folder if not received."
```

#### 2. `verify_otp_secure()`
```sql
SELECT * FROM verify_otp_secure(
  p_identifier := 'user@example.com',
  p_code := '123456',
  p_ip_address := request.ip,
  p_user_agent := request.user_agent
);
```

**What It Does:**
1. Finds OTP by identifier (not expired, not verified, not exhausted)
2. Hashes provided code and compares to stored hash
3. Decrements attempt counter
4. If 5 attempts used, expires OTP
5. Marks OTP as verified
6. Generates session token

**Returns:** `{ success, error_message, user_id, session_token }`

**Security:**
- Max 5 attempts per OTP
- Automatic expiry after 5 minutes
- Failed attempts logged

---

## 💳 PAYMENT & SUBSCRIPTION SYSTEM

### Tables

#### `payment_events` - Immutable Webhook Log
```sql
id (uuid)
user_id (uuid)                    -- Populated after verification
event_id (text)                   -- Unique, prevents replay attacks
event_type (text)                 -- 'subscription.created', etc
provider (text)                   -- 'stripe', 'paddle'
provider_event_id (text)          -- External event ID (UNIQUE per provider)
verified (boolean)                -- Signature verified?
signature_valid (boolean)         -- HMAC/RSA verified?
payload (jsonb)                   -- Raw webhook payload
processed (boolean)               -- Webhook handled?
processed_at (timestamp)
created_at (timestamp)
```
**Security:**
- Unique constraint on (provider, provider_event_id) prevents replays
- Immutable once created
- All updates recorded

#### `subscription_status` - Source of Truth
```sql
id (uuid)
user_id (uuid)
plan_type (text)              -- 'free', 'pro', 'business'
status (text)                 -- 'active', 'paused', 'canceled', 'past_due'
current_period_start (timestamp)
current_period_end (timestamp)
canceled_at (timestamp)
cancellation_reason (text)
provider (text)
provider_subscription_id (text)
last_payment_event_id (uuid)  -- Linked to payment_events
updated_at (timestamp)
```
**CRITICAL:** Server-side source of truth for subscription status  
**Never trust client:** All updates via verified webhooks only

#### `webhook_verification_log` - Security Audit
```sql
id (uuid)
provider (text)
event_id (text)
signature (text)
verification_result (boolean)
reason (text)                 -- Why failed
ip_address (cidr)
user_agent (text)
created_at (timestamp)
```
**Purpose:** Track all webhook signature attempts for detecting attacks

#### `provider_customers` - User -> Provider ID Mapping
```sql
id (uuid)
user_id (uuid)
provider (text)
provider_customer_id (text)   -- Stripe customer ID, Paddle ID, etc
provider_email (text)
created_at (timestamp)
```
**Purpose:** Map users to their provider customer IDs for webhook routing

---

### Core Payment Functions

#### 1. `verify_webhook_signature()` - MANDATORY Verification
```sql
SELECT * FROM verify_webhook_signature(
  p_provider := 'stripe',
  p_event_id := 'evt_123abc',
  p_signature := 't=timestamp,v1=hash',
  p_payload_json := webhook_body,
  p_ip_address := request.ip,
  p_user_agent := request.user_agent
);
```

**Returns:** `{ valid, payload, reason }`

**CRITICAL:**  
1. Verifies HMAC-SHA256 signature (Stripe format)
2. Checks webhook secret from environment
3. Logs ALL verification attempts
4. Triggers suspicious_activity alert if invalid

**Must be called BEFORE processing any webhook**

---

#### 2. `process_payment_event()` - Webhook Handler
```sql
SELECT * FROM process_payment_event(
  p_provider := 'stripe',
  p_event_id := 'evt_123abc',
  p_provider_event_id := 'pi_456def',
  p_event_type := 'subscription.updated',
  p_payload := jsonb_payload,
  p_signature_valid := true,
  p_ip_address := request.ip,
  p_user_agent := request.user_agent
);
```

**Security Checks:**
1. ✅ Verifies signature_valid = true (reject if false)
2. ✅ Rejects duplicate event IDs (replay attack prevention)
3. ✅ Validates customer ID in payload
4. ✅ Links to user via provider_customers table
5. ✅ Updates subscription_status (server source of truth)

**Returns:** `{ success, error_message, user_id, plan_updated_to }`

**Handles Events:**
- `subscription.created` - New subscription
- `subscription.updated` - Plan change or status change
- `subscription.deleted` - Subscription canceled
- `payment_intent.succeeded` - Payment processed
- `invoice.payment_failed` - Payment failed

---

#### 3. `get_user_subscription()` - Query Subscription (Never Trust Client)
```sql
SELECT * FROM get_user_subscription(user_id);
```

**Returns:**
- `plan_type` - From server DB, not client claims
- `status` - From server DB
- `can_access_paid_features` - Computed server-side
- `days_remaining` - Until renewal

**CRITICAL:** Always query this server-side, never trust client JWT claims

---

#### 4. `user_can_access_feature()`
```sql
SELECT * FROM user_can_access_feature(
  p_user_id := auth.uid(),
  p_feature := 'pro'
);
```

**Call in every protected endpoint:**
```
IF user_can_access_feature(user_id, 'pro').allowed THEN
  -- Allow feature
ELSE
  -- Reject with 403 Forbidden
END IF;
```

**Returns:** `{ allowed, current_plan, reason }`

---

## 🔒 SECURITY FEATURES

### OTP System
| Feature | How It Works |
|---------|-------------|
| Rate Limiting | 5 per 10 min per identifier, 50/hr per IP |
| Hashing | SHA256 with salt |
| Enumeration Prevention | Always returns "If account exists, OTP sent" |
| Attempt Limiting | Max 5 incorrect attempts |
| Expiration | 5 minutes |
| Audit Trail | All actions logged |

### Payment System
| Feature | How It Works |
|---------|-------------|
| Signature Verification | HMAC-SHA256 (Stripe) or RSA (Paddle) |
| Replay Attack Prevention | Unique event ID + unique provider_event_id |
| Server Source of Truth | Only verified webhooks update subscription |
| No Client Upgrades | Signature required for any plan change |
| Audit Trail | All webhook attempts logged |
| Duplicate Detection | Admin dashboard shows replay attempts |

---

## 📝 APPLICATION INTEGRATION

### Backend: Request OTP
```javascript
// POST /auth/request-otp
async function handleRequestOTP(req, res) {
  const identifier = req.body.email; // or phone
  
  const { data, error } = await supabase.rpc('request_otp_secure', {
    p_identifier: identifier,
    p_ip_address: req.ip,
    p_user_agent: req.headers['user-agent'],
    p_method: 'email'
  });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // CRITICAL: Always return same message
  res.json({ 
    message: "If account exists, OTP will be sent. Check spam folder.",
    request_id: data.request_id 
  });
}
```

### Backend: Verify OTP
```javascript
// POST /auth/verify-otp
async function handleVerifyOTP(req, res) {
  const { identifier, code } = req.body;

  const { data, error } = await supabase.rpc('verify_otp_secure', {
    p_identifier: identifier,
    p_code: code,
    p_ip_address: req.ip,
    p_user_agent: req.headers['user-agent']
  });

  if (error || !data.success) {
    return res.status(401).json({ error: data.error_message });
  }

  // Create authenticated session
  const token = createJWT(data.user_id);
  res.json({ token, user_id: data.user_id });
}
```

### Backend: Webhook Handler (Stripe Example)
```javascript
// POST /webhooks/stripe
async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const payload = req.body.toString(); // Raw body for signature verification

  // Step 1: Verify signature
  const { data: { valid } } = await supabase.rpc('verify_webhook_signature', {
    p_provider: 'stripe',
    p_event_id: req.body.id,
    p_signature: sig,
    p_payload_json: payload,
    p_ip_address: req.ip,
    p_user_agent: req.headers['user-agent']
  });

  if (!valid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Step 2: Process payment event
  const { data: result } = await supabase.rpc('process_payment_event', {
    p_provider: 'stripe',
    p_event_id: req.body.id,
    p_provider_event_id: req.body.id,
    p_event_type: req.body.type,
    p_payload: req.body,
    p_signature_valid: true,
    p_ip_address: req.ip,
    p_user_agent: req.headers['user-agent']
  });

  if (result.success) {
    res.json({ received: true });
  } else {
    console.error('Payment processing failed:', result.error_message);
    res.status(400).json({ error: result.error_message });
  }
}
```

### Frontend: Verify Subscription Before Feature Use
```javascript
// Check subscription server-side in protected endpoints
async function verifyFeatureAccess(featureName) {
  const response = await fetch('/api/check-feature-access', {
    method: 'POST',
    body: JSON.stringify({ feature: featureName }),
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const { allowed, current_plan, reason } = await response.json();

  if (!allowed) {
    showUpgradeModal(current_plan, reason);
    return false;
  }

  return true;
}

// Never trust client-side claims:
// ❌ WRONG: if (user.plan === 'pro') { allowFeature(); }
// ✅ CORRECT: verify server-side before allowing
```

---

## ⚙️ ENVIRONMENT SETUP

### Set Webhook Secrets
```bash
# Stripe
export APP_WEBHOOK_SECRET_STRIPE="whsec_test_..."

# Paddle (if used)
export APP_WEBHOOK_SECRET_PADDLE="your_paddle_secret"

# OTP Salt (for hashing)
export APP_OTP_SALT="your_random_salt_value"
```

### Verify Settings in Supabase
```sql
SELECT current_setting('app.webhook_secret_stripe', true);
SELECT current_setting('app.otp_salt', true);
```

---

## 📊 MONITORING

### Recent OTP Attempts
```sql
SELECT
  identifier,
  action,
  COUNT(*) as count,
  MAX(created_at) as last_attempt
FROM otp_audit_log
WHERE created_at > now() - interval '1 hour'
GROUP BY identifier, action
ORDER BY count DESC;
```

### Failed Webhook Signatures
```sql
SELECT
  provider,
  COUNT(*) as failed_count,
  ARRAY_AGG(DISTINCT ip_address::text) as ips
FROM webhook_verification_log
WHERE verification_result = false
  AND created_at > now() - interval '24 hours'
GROUP BY provider;
```

### Replay Attack Attempts
```sql
SELECT * FROM get_duplicate_webhook_attempts();
```

---

## ✅ DEPLOYMENT CHECKLIST

```
OTP System:
[ ] Set APP_OTP_SALT environment variable
[ ] Implement send_otp_email() function to actually send OTPs
[ ] Configure email provider (SendGrid, AWS SES, etc)
[ ] Test OTP endpoint with rate limiting
[ ] Verify OTP expires after 5 minutes
[ ] Test with valid/invalid OTP codes

Payment System:
[ ] Set APP_WEBHOOK_SECRET_STRIPE environment variable
[ ] Configure Stripe webhook endpoint URL
[ ] Test with Stripe test events
[ ] Verify signature verification with fake signatures
[ ] Test replay attack prevention
[ ] Test plan upgrade/downgrade flow
[ ] Monitor webhook_verification_log for issues

Both:
[ ] Run migration_otp_payment_verify.sql to confirm deployment
[ ] Review all audit logs
[ ] Set up alerts for failed webhook verifications
[ ] Test error handling in frontend
```

---

## 🚨 TROUBLESHOOTING

**OTP: "Rate limit exceeded"**
- Normal after 5 attempts (per 10 min)
- Wait 10 minutes for identifier reset
- Or test with different email

**Payment: "Invalid signature"**
- Check webhook secret is correct
- Verify signature format matches provider
- Check IP allowlist if present

**Payment: "Duplicate event ID"**
- Stripe might retrying webhook
- This is correct behavior (prevents replay)
- Log shows event already processed

---

**All migrations deployed and ready!**

Run: `migration_otp_payment_verify.sql` to confirm.
