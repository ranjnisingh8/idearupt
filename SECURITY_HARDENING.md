# SECURITY HARDENING IMPLEMENTATION GUIDE

## Overview
This document outlines all security enhancements implemented for the Supabase backend, focusing on preventing unauthorized access, role escalation, and data leaks.

---

## 1. REQUEST RATE LIMITING & LOGGING

### Components
- **Table**: `request_logs` - Tracks all API requests for rate limiting
- **Function**: `increment_usage_with_ratelimit()` - Atomically checks rate limits
- **Purpose**: Prevent DDoS attacks and API abuse

### Implementation Details
```sql
CREATE TABLE request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer,
  response_time_ms integer,
  ip_address text NOT NULL,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now()
);
```

### Key Features
- Tracks per-user API request counts
- Enforces rate limits before processing
- Logs failed requests for attack detection
- Automatically maintains per-hour/per-day windows

### How to Use
```javascript
// In your API handler:
const result = await supabase.rpc('increment_usage_with_ratelimit', {
  p_user_id: userId,
  p_limit_per_hour: 100,
});

if (!result.data.allowed) {
  throw new Error('Rate limit exceeded');
}
```

---

## 2. AUDIT LOGGING FOR COMPLIANCE

### Components
- **Table**: `audit_logs` - Tracks all sensitive data modifications
- **Triggers**: Auto-record on INSERT/UPDATE/DELETE of sensitive tables
- **Purpose**: Maintain compliance trail and detect unauthorized changes

### Tracked Tables
- `users` - Role changes, profile updates
- `collections` - Creation, deletion, ownership changes
- `idea_validations` - Validation results changes
- `usage_tracking` - Usage data modifications
- `email_log` - Email delivery tracking

### Audit Log Schema
```sql
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL, -- INSERT, UPDATE, DELETE
  old_data jsonb,
  new_data jsonb,
  changed_by uuid REFERENCES users(id),
  changed_at timestamp NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);
```

### Query Example
```sql
-- Find all role escalations
SELECT * FROM audit_logs
WHERE table_name = 'users'
  AND action = 'UPDATE'
  AND new_data->>'role' != old_data->>'role'
  AND changed_at > now() - interval '7 days'
ORDER BY changed_at DESC;
```

---

## 3. ROLE ESCALATION PREVENTION

### Vulnerability Addressed
Attackers cannot directly modify their own role through UPDATE statements.

### Implementation
```sql
-- Update policy that prevents role modification
CREATE POLICY "users_update_self_no_role_change" ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM users WHERE id = auth.uid()) -- Can't change role
  );
```

### How It Works
1. User can only UPDATE their own row
2. The `WITH CHECK` clause verifies role hasn't changed
3. Role changes must go through `set_user_role()` function
4. This function includes business logic validation

### Safe Role Change Function
```sql
CREATE OR REPLACE FUNCTION set_user_role(
  p_user_id uuid,
  p_new_role user_role
)
RETURNS void AS $$
DECLARE
  v_caller_role user_role;
BEGIN
  -- Get caller's role
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  
  -- Only admins can change roles
  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can modify roles';
  END IF;
  
  -- Audit the change
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  SELECT 'users', p_user_id, 'UPDATE',
    jsonb_build_object('role', role),
    jsonb_build_object('role', p_new_role),
    auth.uid()
  FROM users WHERE id = p_user_id;
  
  -- Apply the change
  UPDATE users SET role = p_new_role WHERE id = p_user_id;
  
  RAISE NOTICE 'Role updated for user % to %', p_user_id, p_new_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Usage
```sql
-- Safe: Only admins can call this
SELECT set_user_role('some-uuid', 'pro');
```

---

## 4. REMOVE DANGEROUSLY PERMISSIVE POLICIES

### Vulnerable Pattern - DON'T DO THIS
```sql
-- ❌ DANGEROUS - All authenticated users can read everything
CREATE POLICY "read_all" ON collections
  FOR SELECT
  TO authenticated
  USING(true);
```

### Secure Pattern
```sql
-- ✅ SECURE - Only read own collections
CREATE POLICY "collections_select" ON collections
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());
```

### Audit Script
Run this to find remaining dangerous policies:
```sql
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE (qual LIKE '%true%' OR with_check LIKE '%true%')
  AND schemaname = 'public'
  AND tablename NOT IN ('ideas', 'pain_signals'); -- Only public read-only tables
ORDER BY tablename;
```

---

## 5. ROW LEVEL SECURITY (RLS) ENFORCEMENT

### Verification
```sql
-- Check RLS is enabled on all sensitive tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'collections', 'collection_items', 'user_interactions',
    'usage_tracking', 'user_alerts', 'email_log'
  );
```

### Expected Output
All should show `rowsecurity = true`

### If RLS is Disabled
```sql
-- Enable RLS on a table
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

-- Revoke all default access
REVOKE ALL ON public.collection_items FROM authenticated;

-- Add explicit policies
CREATE POLICY "user_owns_items" ON collection_items
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM collections
    WHERE collections.id = collection_items.collection_id
      AND collections.owner_id = auth.uid()
  ));
```

---

## 6. SECURITY DEFINER FUNCTIONS

### Purpose
Temporarily elevate permissions to perform privileged operations without granting direct access.

### Best Practices
```sql
-- ✅ CORRECT - Always validate auth.uid()
CREATE OR REPLACE FUNCTION sensitive_operation()
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Operation now runs as function owner
  UPDATE other_user_data SET field = 'value'
  WHERE user_id = auth.uid(); -- Only affects authenticated user's data
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ❌ WRONG - SECURITY DEFINER without checking auth.uid()
CREATE OR REPLACE FUNCTION dangerous_operation(user_id uuid, new_role text)
RETURNS void AS $$
BEGIN
  UPDATE users SET role = new_role WHERE id = user_id; -- DANGER: Can modify anyone!
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### How to Audit
```sql
SELECT
  routine_name,
  security_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND security_type = 'DEFINER'
ORDER BY routine_name;
```

---

## 7. GRANT STATEMENTS - FORCE API BOUNDARY

### Principle
Users should NOT have direct table access. All access must go through RPCs.

### Implementation
```sql
-- ✅ CORRECT - Only specific functions are callable
REVOKE ALL ON public.users FROM authenticated;
GRANT SELECT ON public.ideas TO authenticated; -- Read-only public data
GRANT SELECT ON public.pain_signals TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_profile() TO authenticated;

-- ❌ WRONG - Direct table access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
```

### Verification Script
```sql
-- Find insecure grants
SELECT
  schemaname,
  tablename,
  privilege_type,
  grantee
FROM role_table_grants
WHERE schemaname = 'public'
  AND grantee IN ('authenticated', 'anon')
  AND privilege_type NOT IN ('SELECT') -- If anything other than SELECT
ORDER BY tablename;
```

---

## 8. SECURITY CHECKLIST FOR NEW TABLES

When adding a new table, ensure:

- [ ] RLS is ENABLED: `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`
- [ ] Default access is REVOKED: `REVOKE ALL ON table_name FROM authenticated;`
- [ ] Explicit POLICIES are defined (SELECT + INSERT + UPDATE + DELETE as needed)
- [ ] Policies use `auth.uid()` for user isolation
- [ ] No `USING(true)` or `WITH CHECK(true)` on sensitive data
- [ ] Audit trigger is added if data is sensitive
- [ ] Rate limiting is added if operation is high-volume
- [ ] Function creates an audit log entry when appropriate

---

## 9. COMMON VULNERABILITY PATTERNS & FIXES

### Pattern 1: Missing User Isolation
```sql
-- ❌ WRONG - Anyone can see all collections
CREATE POLICY "collections_read" ON collections
  FOR SELECT
  TO authenticated
  USING(true);

-- ✅ CORRECT
CREATE POLICY "collections_read" ON collections
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR is_public = true);
```

### Pattern 2: No CHECK on INSERT
```sql
-- ❌ WRONG - User can insert collections they don't own
CREATE POLICY "collections_create" ON collections
  FOR INSERT
  TO authenticated
  USING(true);

-- ✅ CORRECT
CREATE POLICY "collections_create" ON collections
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());
```

### Pattern 3: Unsafe Role Operations
```sql
-- ❌ WRONG - Direct role modification
UPDATE users SET role = 'admin' WHERE id = current_user_id;

-- ✅ CORRECT - Use function with validation
SELECT set_user_role(current_user_id, 'admin');
```

### Pattern 4: Missing Rate Limit Checks
```sql
-- ❌ WRONG - Unlimited API calls
CREATE OR REPLACE FUNCTION expensive_operation()
RETURNS void AS $$
BEGIN
  -- Do expensive work
END;
$$ LANGUAGE plpgsql;

-- ✅ CORRECT
CREATE OR REPLACE FUNCTION expensive_operation()
RETURNS void AS $$
BEGIN
  -- Check rate limit
  IF NOT (SELECT allowed FROM increment_usage_with_ratelimit(
    auth.uid(), 'expensive_op', 10 -- max 10/hour
  )) THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;
  
  -- Do expensive work
END;
$$ LANGUAGE plpgsql;
```

---

## 10. MONITORING & INCIDENT RESPONSE

### Monitor for Attacks
```sql
-- Find users with suspicious activity
SELECT
  user_id,
  COUNT(*) as request_count,
  COUNT(DISTINCT endpoint) as unique_endpoints,
  MAX(created_at) as last_request
FROM request_logs
WHERE created_at > now() - interval '1 hour'
GROUP BY user_id
HAVING COUNT(*) > 1000 -- More than 1000 requests/hour
ORDER BY request_count DESC;
```

### Find Unauthorized Changes
```sql
-- Detect role escalation attempts
SELECT
  changed_by,
  old_data,
  new_data,
  changed_at
FROM audit_logs
WHERE table_name = 'users'
  AND action = 'UPDATE'
  AND new_data->>'role' != old_data->>'role'
  AND changed_at > now() - interval '24 hours'
ORDER BY changed_at DESC;
```

### Revoke Compromised Tokens
```sql
-- Invalidate session for a user
UPDATE auth.sessions SET expires_at = now()
WHERE user_id = 'compromised-user-id';

-- Log the incident
INSERT INTO audit_logs (table_name, record_id, action, new_data)
VALUES ('security_incident', 'null'::uuid, 'SESSION_REVOKED',
  jsonb_build_object('user_id', 'compromised-user-id', 'reason', 'Account compromise detected'));
```

---

## 11. DEPLOYMENT CHECKLIST

Before deploying these migrations:

```
[ ] Review all policies in migration_security_enhancement.sql
[ ] Test rate limiting with load test tool
[ ] Verify audit logs capture all changes
[ ] Run migration_security_verify.sql to confirm deployment
[ ] Check application code to use new RPC functions
[ ] Monitor logs for any access denied errors
[ ] Update API documentation with new rate limits
[ ] Brief team on security best practices
[ ] Schedule quarterly security audits
```

---

## 12. REFERENCES & RESOURCES

- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/sql-syntax.html#SQL-SYNTAX-IDENTIFIERS)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Best Practices](https://supabase.com/docs/guides/database/best-practices)

---

## Questions?

Contact the security team for clarification on any policy or when implementing new features.
