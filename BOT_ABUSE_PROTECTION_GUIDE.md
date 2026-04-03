# 🤖 BOT & ABUSE PROTECTION IMPLEMENTATION GUIDE

Complete SQL migration suite for comprehensive bot detection, trial abuse prevention, and soft-ban protection.

---

## 📋 Quick Summary

**5 Migration Files** | **10 Functions** | **3 Tables** | **8 Triggers** | **1 Dashboard**

Creates a multi-layered abuse prevention system with:
- ✅ Real-time suspicious activity detection
- ✅ Server-side device fingerprinting
- ✅ Automatic soft-banning of suspicious users
- ✅ Authentication enforcement on critical functions
- ✅ Trial abuse prevention
- ✅ Admin dashboard with live metrics

---

## 🚀 DEPLOYMENT ORDER

```
1. migration_bot_abuse_protection_tables.sql
   └─ Creates: suspicious_activity, device_fingerprints, abuse_patterns tables
   └─ Adds: is_limited, is_banned columns to users table

2. migration_suspicious_activity_functions.sql
   └─ Deploys: detect_suspicious_activity(), auto_ban_suspicious_user()
   └─ Deploys: soft_limit_user(), remove_soft_limit()

3. migration_device_fingerprint_functions.sql
   └─ Deploys: register_device_fingerprint(), can_create_trial()
   └─ Deploys: get_suspicious_devices(), block_device()

4. migration_secure_critical_functions.sql
   └─ Deploys: increment_user_usage_secure() - WITH auth & soft-ban checks
   └─ Deploys: track_referral_secure() - WITH referral spam detection
   └─ Deploys: activate_trial_secure() - WITH device & fingerprint checks
   └─ Deploys: complete_onboarding_secure() - WITH auth enforcement

5. migration_abuse_enforcement_triggers.sql
   └─ Creates: RLS policies blocking banned/limited users
   └─ Creates: Triggers for auto-banning, logging, cleanup

6. Verify: migration_abuse_protection_verify.sql
   └─ Run in Supabase SQL Editor to confirm all features deployed
```

---

## 📊 NEW TABLES

### 1. `suspicious_activity` - Detection Log
```
Tracks potentially malicious behavior:
- id (uuid) - Primary key
- user_id (uuid) - Which user
- action (text) - What they tried (e.g., 'signup_from_reused_fingerprint')
- ip_address (text) - Source IP
- user_agent (text) - User agent string
- request_fingerprint (text) - Hashed IP + user agent
- severity (text) - 'low', 'medium', 'high'
- details (jsonb) - Additional context (request counts, reason, etc)
- reviewed (boolean) - Admin has reviewed?
- created_at (timestamp) - When detected
```

### 2. `device_fingerprints` - Server-Side Device Tracking
```
Server-side tracking to prevent trial abuse:
- id (uuid) - Primary key
- user_id (uuid) - Associated user
- fingerprint_hash (text) - SHA256(IP + User Agent)
- ip_address (text) - Last known IP
- user_agent (text) - Last known user agent
- created_at (timestamp) - First seen
- last_seen_at (timestamp) - Most recent activity
- signup_count (integer) - How many accounts from this device
- is_flagged (boolean) - Admin flagged as suspicious
```

**Key:** Fingerprint can be reused across multiple user accounts  
**Abuse Pattern:** If signup_count > 3, treat as trial abuse attempt

### 3. `abuse_patterns` - Pattern Tracking
```
Higher-level pattern tracking:
- id (uuid) - Primary key
- user_id (uuid) - Affected user (can be NULL for device patterns)
- pattern_type (text) - Type of abuse detected
- pattern_data (jsonb) - Details of the pattern
- detected_at (timestamp) - When detected
- severity (text) - Severity level
- action_taken (text) - What was done
```

---

## 🔧 NEW FUNCTIONS

### Critical Authentication Functions (Use in your application)

#### 1. `increment_user_usage_secure()`
```sql
SELECT * FROM increment_user_usage_secure(
  p_usage_type := 'ai_queries',
  p_amount := 1,
  p_ip_address := request.headers.get('cf-connecting-ip'),
  p_user_agent := request.headers.get('user-agent')
);
```
**Checks:**
- ✅ User is authenticated (raises error if not)
- ✅ User is not banned
- ✅ User is not soft-limited
- ✅ No suspicious activity patterns detected
- ✅ If suspicious → auto soft-limits user for 24h

**Returns:** `{ success, error_message, new_count }`

---

#### 2. `track_referral_secure()`
```sql
SELECT * FROM track_referral_secure(
  p_referred_user_id := new_user_id,
  p_ip_address := request.headers.get('cf-connecting-ip')
);
```
**Checks:**
- ✅ User is authenticated
- ✅ User is not banned
- ✅ User is not soft-limited
- ✅ No referral spam (>20 referrals/hour = auto soft-limit)
- ✅ Detects suspicious referral patterns

**Returns:** `{ success, error_message }`

---

#### 3. `activate_trial_secure()`
```sql
SELECT * FROM activate_trial_secure(
  p_trial_type := 'pro',
  p_ip_address := request.headers.get('cf-connecting-ip'),
  p_user_agent := request.headers.get('user-agent')
);
```
**Checks:**
- ✅ User is authenticated
- ✅ User is not banned
- ✅ User has not exceeded device fingerprint trial limit (1 trial per device)
- ✅ Device is not flagged as suspicious
- ✅ No suspicious activity patterns
- ✅ If trial abuse detected → soft-limits for 3 days

**Returns:** `{ success, error_message, trial_id }`

---

#### 4. `complete_onboarding_secure()`
```sql
SELECT * FROM complete_onboarding_secure(
  p_data := onboarding_json,
  p_ip_address := request.headers.get('cf-connecting-ip')
);
```
**Checks:**
- ✅ User is authenticated
- ✅ User is not banned
- ✅ User is not soft-limited
- ✅ No suspicious onboarding patterns

**Returns:** `{ success, error_message }`

---

### Suspicious Activity Detection Functions

#### 5. `detect_suspicious_activity()` - Core Detection Engine
```sql
SELECT * FROM detect_suspicious_activity(
  p_user_id := user_id,
  p_action := 'api_call',
  p_ip_address := ip,
  p_user_agent := user_agent
);
```

**Detects:** (Returns in real-time)
1. **Extremely rapid requests** (>10 requests/minute) → `HIGH` severity, blocks immediately
2. **Excessive requests** (>500/hour) → `HIGH` severity, blocks immediately
3. **Multiple IPs in short time** (>5 different IPs/hour) → `HIGH` severity (account takeover indicator)
4. **Resumed activity after 7+ days from different IP** → `MEDIUM` severity
5. **Consistent rapid patterns** (>5 req/min AND >100 req/hour) → `MEDIUM` severity

**Returns:** `{ is_suspicious, severity, reason, should_block }`

---

#### 6. `auto_ban_suspicious_user()` - Auto-Banning
```sql
SELECT * FROM auto_ban_suspicious_user(
  p_user_id := user_id,
  p_threshold := 10  -- Ban if 10+ suspicious activities in 24h
);
```

**Triggers banif:**
- Suspicious count ≥ threshold (default 10)  
- OR high-severity incidents ≥ 3

**Returns:** `{ was_banned, reason, suspicious_count }`

---

#### 7. `soft_limit_user()` - Temporary Rate-Limiting
```sql
SELECT * FROM soft_limit_user(
  p_user_id := user_id,
  p_duration_hours := 24  -- 24-hour limit
);
```

**Effect on limited users:**
- Cannot increment usage
- Cannot create referrals
- Cannot activate trials
- Cannot modify collections/ideas
- Automatically lifts after duration expires

**Returns:** `{ was_limited, limited_until }`

---

#### 8. `remove_soft_limit()` - Manual Unban
```sql
SELECT * FROM remove_soft_limit(p_user_id := user_id);
```

---

### Device Fingerprinting Functions

#### 9. `register_device_fingerprint()` - Called on Signup
```sql
SELECT * FROM register_device_fingerprint(
  p_user_id := user_id,
  p_ip_address := request.headers.get('cf-connecting-ip'),
  p_user_agent := request.headers.get('user-agent')
);
```

**Does:**
- Hashes IP + User Agent into fingerprint
- Checks if fingerprint has signed up before
- Increments signup count for fingerprint
- Auto-flags fingerprint if signup_count > 3
- Logs as suspicious if reused

**Returns:** `{ fingerprint_id, is_new_device, previous_signup_count, suspicious }`

---

#### 10. `can_create_trial()` - Trial Abuse Prevention
```sql
SELECT * FROM can_create_trial(
  p_user_id := user_id,
  p_ip_address := request.ip,
  p_user_agent := request.user_agent,
  p_max_trials_per_device := 1  -- Max 1 trial per device
);
```

**Checks:**
- How many trials already created from this device fingerprint
- If fingerprint is flagged as suspicious
- Returns block reason if limit exceeded

**Returns:** `{ allowed, reason, trials_created_on_device }`

---

## 📋 DETECTION PATTERNS

### What Gets Flagged as Suspicious?

| Pattern | Threshold | Action |
|---------|-----------|--------|
| Requests per minute | > 10 | Block + soft-limit (24h) |
| Requests per hour | > 500 | Block + soft-limit (24h) |
| Unique IPs per hour | > 5 | Block + soft-limit (24h) |
| Resumed after 7+ days | From different IP | Soft-limit (24h) |
| Referrals per hour | > 20 | Block + soft-limit (48h) |
| Trials from same device | > 1 | Block + soft-limit (72h) |
| Suspicious activity count (24h) | > 10 incidents | AUTO-BAN |
| High-severity incidents (24h) | ≥ 3 incidents | AUTO-BAN |

---

## 🛡️ RLS POLICIES (Automatic)

### Policies Added to Prevent Banned/Limited Users:

1. **Collections**
   - Blocks ALL operations if user is banned
   - Blocks ALL operations if user is soft-limited

2. **Ideas**
   - Blocks INSERT if user is banned
   - Blocks INSERT if user is soft-limited

3. **User Interactions**
   - Blocks INSERT if user is banned
   - Blocks INSERT if user is soft-limited

---

## ⚙️ AUTOMATIC TRIGGERS

### Trigger 1: Auto-Ban on Threshold
```
WHEN: suspicious_activity INSERT
THEN: Check if threshold exceeded → Auto-ban if yes
      Log to audit_logs
```

### Trigger 2: Log Ban Events
```
WHEN: users.is_banned changed true → false
THEN: Log to audit_logs + abuse_patterns
```

### Trigger 3: Log Soft-Limit Removal
```
WHEN: users.is_limited changed true → false
THEN: Log to abuse_patterns (soft_limit_expired)
```

---

## 📊 ADMIN DASHBOARD

### `get_abuse_dashboard_stats()` - Real-Time Metrics
```sql
SELECT * FROM get_abuse_dashboard_stats();
```

**Returns:**
- `total_suspicious_activities` - Total in last 24h
- `high_severity_count` - High-severity incidents
- `users_banned_24h` - Newly banned in last 24h
- `users_limited_24h` - Currently soft-limited
- `unique_flagged_devices` - Suspicious device fingerprints
- `suspicious_ips` - Array of IPs with suspicious activity
- `top_patterns` - Most common suspicious actions

---

## 🔍 MONITORING QUERIES

### Find Banned Users
```sql
SELECT id, email, ban_reason, banned_at
FROM users
WHERE is_banned = true
ORDER BY banned_at DESC;
```

### Find Soft-Limited Users
```sql
SELECT
  id,
  email,
  limited_until,
  (limited_until - now()) AS time_remaining
FROM users
WHERE is_limited = true
  AND limited_until > now()
ORDER BY limited_until DESC;
```

### Find Suspicious IPs
```sql
SELECT
  ip_address,
  COUNT(*) AS incident_count,
  MAX(created_at) AS last_seen
FROM suspicious_activity
WHERE created_at > now() - interval '24 hours'
GROUP BY ip_address
ORDER BY incident_count DESC;
```

### Find Trial Abuse Attempts
```sql
SELECT
  fingerprint_hash,
  signup_count,
  COUNT(DISTINCT user_id) AS unique_users,
  last_seen_at
FROM device_fingerprints
WHERE signup_count > 3
ORDER BY signup_count DESC;
```

---

## 💻 APPLICATION CODE EXAMPLES

### Express.js Integration

```javascript
async function handleAIQuery(req, res) {
  const userId = req.user.id;
  const ip = req.headers['cf-connecting-ip'] || req.ip;
  const userAgent = req.headers['user-agent'];

  try {
    // Check rate limit & detect abuse
    const result = await supabase.rpc('increment_user_usage_secure', {
      p_usage_type: 'ai_queries',
      p_amount: 1,
      p_ip_address: ip,
      p_user_agent: userAgent,
    });

    if (!result.success) {
      return res.status(429).json({
        error: result.error_message,
        retryAfter: '24 hours',
      });
    }

    // Proceed with AI query
    const response = await openai.createChatCompletion(...);
    res.json({ response });

  } catch (error) {
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    throw error;
  }
}
```

### Trial Signup

```javascript
async function createTrial(req, res) {
  const userId = req.user.id;
  const ip = req.headers['cf-connecting-ip'] || req.ip;
  const userAgent = req.headers['user-agent'];

  // Check if device can create trial
  const canCreate = await supabase.rpc('can_create_trial', {
    p_user_id: userId,
    p_ip_address: ip,
    p_user_agent: userAgent,
  });

  if (!canCreate.allowed) {
    return res.status(403).json({
      error: canCreate.reason,
      code: 'TRIAL_ABUSE_DETECTED',
    });
  }

  // Register device for tracking
  const trial = await supabase.rpc('activate_trial_secure', {
    p_trial_type: 'pro',
    p_ip_address: ip,
    p_user_agent: userAgent,
  });

  if (!trial.success) {
    return res.status(403).json({ error: trial.error_message });
  }

  res.json({ trial_id: trial.trial_id });
}
```

---

## 🚨 INCIDENT RESPONSE

### User Got Soft-Limited
1. Check abuse_patterns table for action_taken
2. Review their recent requests in suspicious_activity
3. Wait 24-72 hours for auto-removal, OR
4. Manually remove: `SELECT * FROM remove_soft_limit(user_id);`

### User Got Auto-Banned
1. Review ban_reason in users table
2. Check audit_logs for the ban trigger
3. Manually unban if false positive: `UPDATE users SET is_banned = false WHERE id = ...;`
4. Or use: `SELECT * FROM emergency_unban_all('False positive - policy review');`

### IP Under Attack
1. Run: `SELECT * FROM get_abuse_dashboard_stats();`
2. Identify malicious IP from suspicious_ips array
3. Add to firewall/WAF rules
4. Run: `SELECT * FROM get_suspicious_devices();` to identify device fingerprints
5. Block devices: `SELECT * FROM block_device(fingerprint_id, 'DDoS attack source');`

---

## ✅ DEPLOYMENT CHECKLIST

- [ ] Deploy migrations in order (1-5)
- [ ] Run verification: `migration_abuse_protection_verify.sql`
- [ ] Update API handlers to use secure functions
- [ ] Set IP headers correctly in your framework
- [ ] Test with admin account (can see abuse dashboard)
- [ ] Test with regular account (respects soft-bans)
- [ ] Monitor logs for false positives
- [ ] Adjust thresholds if needed
- [ ] Brief team on soft-ban notifications
- [ ] Set up alerts for auto-bans

---

## 📞 SUPPORT

All secure functions automatically check `auth.uid()` - no authentication needed in calls, it's forced.

Questions? Check [SECURITY_DEVELOPER_REFERENCE.md] for more examples.
