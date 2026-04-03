# SECURITY FEATURE - DEVELOPER QUICK REFERENCE

Quick reference for using security features in your application code.

---

## 1. RATE LIMITING

### Check Rate Limit Before Operation

```javascript
// In your API handler or mutation
import { supabase } from '@/lib/supabase';

async function performExpensiveOperation(userId: string) {
  // Check rate limit first
  const { data, error } = await supabase.rpc('increment_usage_with_ratelimit', {
    p_user_id: userId,
    p_limit_per_hour: 100,
  });

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`);
  }

  if (!data.allowed) {
    return {
      allowed: false,
      error: 'Rate limit exceeded. Try again later.',
      reset_at: data.reset_at,
    };
  }

  // Proceed with operation
  return performOperation(userId);
}
```

### Use Cases

```javascript
// AI query (strict limit)
const aiLimit = await checkRateLimit(userId, 10); // 10 per hour

// Collection creation (moderate limit)
const collectionLimit = await checkRateLimit(userId, 50); // 50 per hour

// View page (generous limit)
const pageviewLimit = await checkRateLimit(userId, 1000); // 1000 per hour
```

---

## 2. SAFE DATA QUERIES

### Read Own Data (RLS protects you)

```javascript
// ✅ SAFE - RLS ensures user only sees own data
const { data: collections } = await supabase
  .from('collections')
  .select('*')
  .eq('owner_id', userId); // RLS will enforce this anyway

// Better - omit owner_id check, let RLS handle it
const { data: collections } = await supabase
  .from('collections')
  .select('*');

// Even better - use a function that returns only the user's data
const { data: profile } = await supabase.rpc('get_user_profile', {
  p_user_id: userId,
});
```

### Read Public Data (Read-only tables)

```javascript
// ✅ SAFE - Public tables are read-only
const { data: ideas } = await supabase
  .from('ideas')
  .select('*')
  .limit(10);

const { data: painSignals } = await supabase
  .from('pain_signals')
  .select('*');
```

### Create Data (Always verify ownership)

```javascript
// ✅ CORRECT - Let RLS enforce ownership through WITH CHECK policy
const { data, error } = await supabase
  .from('collections')
  .insert({
    owner_id: userId, // RLS blocks if doesn't match auth.uid()
    title: 'My Collection',
    description: 'Test',
  });

// ❌ WRONG - Attempting to create for someone else fails (RLS blocks it)
const { data, error } = await supabase
  .from('collections')
  .insert({
    owner_id: 'someone-else-id', // ❌ RLS will reject this
    title: 'Hacked Collection',
  });
```

---

## 3. ROLE-BASED ACCESS

### Check User Role Safely

```javascript
// Get user profile with role
const { data: user } = await supabase.auth.getUser();

// Query user details including role
const { data: profile } = await supabase
  .from('users')
  .select('id, email, role')
  .eq('id', user.id)
  .single();

// Check permissions
function canModerate(role: string): boolean {
  return ['admin', 'moderator'].includes(role);
}

function canDeleteUser(role: string): boolean {
  return role === 'admin';
}
```

### Perform Admin Operations

```javascript
// ✅ CORRECT - Use function, let backend validate
const { error } = await supabase.rpc('set_user_role', {
  p_user_id: targetUserId,
  p_new_role: 'pro',
});

if (error) {
  if (error.message.includes('Only admins')) {
    // User is not an admin
    alert('Permission denied');
  }
}

// ❌ WRONG - Never update roles directly
await supabase
  .from('users')
  .update({ role: 'admin' })
  .eq('id', userId); // RLS blocks this, only your own profile updateable
```

---

## 4. AUDIT LOG MONITORING (Admin Only)

### View Recent Changes

```javascript
// Only call this if user is admin (check role first!)
async function getRecentAuditLogs(limit = 50) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(limit);

  return data || [];
}

// Find specific changes
async function getRoleChanges(days = 7) {
  const { data } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('table_name', 'users')
    .eq('action', 'UPDATE')
    .gt('changed_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

  return data?.filter(log =>
    log.new_data?.role !== log.old_data?.role
  ) || [];
}
```

---

## 5. ERROR HANDLING

### Interpret Common Errors

```javascript
async function handleDatabaseOperation() {
  try {
    const { data, error } = await supabase
      .from('collections')
      .insert({ /* ... */ });

    if (error) {
      // Handle common security errors
      if (error.message.includes('row level security')) {
        // ❌ User doesn't have permission (RLS denied)
        console.error('Access denied: ' + error.message);
        return { error: 'You do not have permission to access this resource' };
      }

      if (error.message.includes('permission denied')) {
        // ❌ Function permission issues
        console.error('Function not callable: ' + error.message);
        return { error: 'Operation not allowed' };
      }

      if (error.message.includes('Rate limit')) {
        // ❌ Rate limit hit
        return { error: 'Rate limit exceeded. Please try again later.' };
      }

      // Other error
      throw error;
    }

    return { data };

  } catch (err) {
    console.error('Database error:', err);
    return { error: 'Database operation failed' };
  }
}
```

---

## 6. TYPESCRIPT TYPES FOR SECURITY

```typescript
// User role enum
enum UserRole {
  FREE = 'free',
  PRO = 'pro',
  ADMIN = 'admin',
}

// Request log type
interface RequestLog {
  id: string;
  user_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  created_at: string;
}

// Audit log type
interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_by: string;
  changed_at: string;
}

// Rate limit response
interface RateLimitResponse {
  allowed: boolean;
  reset_at?: string;
  remaining?: number;
}
```

---

## 7. COMMON PATTERNS

### Fetch User's Own Data

```javascript
// Pattern: User can only fetch their own data
async function getUserData(userId: string) {
  // First, verify this is the authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id !== userId) {
    return { error: 'Unauthorized' };
  }

  // RLS will still enforce even if we made a mistake above
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  return data;
}
```

### Check Permission Before Expensive Operation

```javascript
// Pattern: Verify permission, then check rate limit
async function deleteCollection(collectionId: string, userId: string) {
  // 1. Verify ownership
  const { data: collection } = await supabase
    .from('collections')
    .select('owner_id')
    .eq('id', collectionId)
    .single();

  if (collection?.owner_id !== userId) {
    return { error: 'Not authorized to delete this collection' };
  }

  // 2. Check rate limit
  const { data: rateLimit } = await supabase.rpc('increment_usage_with_ratelimit', {
    p_user_id: userId,
    p_limit_per_hour: 100,
  });

  if (!rateLimit.allowed) {
    return { error: 'Rate limit exceeded' };
  }

  // 3. Perform deletion
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', collectionId);

  return { error };
}
```

---

## 8. TESTING SECURITY

### Unit Tests

```javascript
describe('Rate Limiting', () => {
  it('should block requests exceeding rate limit', async () => {
    const userId = 'test-user-id';

    // Make 11 requests when limit is 10/hour
    for (let i = 0; i < 11; i++) {
      const { data } = await supabase.rpc('increment_usage_with_ratelimit', {
        p_user_id: userId,
        p_limit_per_hour: 10,
      });
      
      if (i < 10) {
        expect(data.allowed).toBe(true);
      } else {
        expect(data.allowed).toBe(false); // 11th request blocked
      }
    }
  });
});

describe('RLS Policies', () => {
  it('should not allow reading other users collections', async () => {
    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .eq('owner_id', 'other-user-id');

    // Should return empty array or no results, not an error
    expect(data).toEqual([]);
  });
});
```

---

## 9. MIGRATION CHECKLIST

When deploying security features:

```
[ ] Deploy database migrations (migration_security_enhancement.sql)
[ ] Update API handlers to use increment_usage_with_ratelimit()
[ ] Update error handling to catch RLS permission errors
[ ] Add rate limit UI messages ("Try again in X minutes")
[ ] Test with non-admin account (verify RLS enforcement)
[ ] Monitor real-time for permission errors in logs
[ ] Brief team on new security patterns
[ ] Update API documentation with rate limits
[ ] Set up alerts for rate limit abuse
```

---

## 10. WHEN SOMETHING BREAKS

### Debug RLS Denials

```sql
-- Check if RLS is enabled on table
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'collections';

-- View policies on table
SELECT policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'collections';

-- Find policies using true (potentially dangerous)
SELECT tablename, policyname
FROM pg_policies
WHERE (qual LIKE '%true%' OR with_check LIKE '%true%');
```

### Debug Rate Limit Issues

```sql
-- Check recent request logs
SELECT user_id, COUNT(*) as requests, MAX(created_at)
FROM request_logs
WHERE created_at > now() - interval '1 hour'
GROUP BY user_id
ORDER BY requests DESC;
```

### Debug Audit Issues

```sql
-- View recent audit logs
SELECT * FROM audit_logs
ORDER BY changed_at DESC
LIMIT 50;
```

---

## Support

For questions or issues:
1. Check [SECURITY_HARDENING.md](../SECURITY_HARDENING.md) for detailed documentation
2. Review the migration files in `/supabase/` folder
3. Run the verification script: `migration_security_verify.sql`
4. Contact security team for permission issues

