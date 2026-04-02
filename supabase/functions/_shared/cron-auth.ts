/**
 * Verify that a request comes from pg_cron (service_role JWT).
 * Primary check: Bearer token matches SUPABASE_SERVICE_ROLE_KEY.
 * Secondary (defense-in-depth): Decode JWT payload and verify role claim.
 */
export function verifyCronAuth(req: Request): { authorized: boolean; error?: string } {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { authorized: false, error: "Missing or malformed Authorization header" };
  }

  const providedToken = authHeader.replace("Bearer ", "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!serviceRoleKey) {
    return { authorized: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" };
  }

  // Primary: exact string match
  if (providedToken !== serviceRoleKey) {
    return { authorized: false, error: "Invalid service role key" };
  }

  // Secondary (defense-in-depth): verify JWT payload contains service_role claim
  try {
    const parts = providedToken.split(".");
    if (parts.length === 3) {
      // Decode the JWT payload (middle part)
      const payload = JSON.parse(atob(parts[1]));
      if (payload.role !== "service_role") {
        return { authorized: false, error: "JWT role is not service_role" };
      }
    }
  } catch {
    // If JWT decode fails but string matched, still allow (primary check passed)
  }

  return { authorized: true };
}
