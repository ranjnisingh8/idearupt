import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Per-request rate limiting via check_request_throttle RPC.
 * Returns a 429 Response if blocked, or null if allowed.
 * Fails open — if the RPC errors out, the request is allowed
 * (daily limits remain as the hard ceiling).
 */
export async function checkRequestThrottle(
  adminClient: SupabaseClient,
  userId: string,
  functionName: string,
  corsHeaders: Record<string, string>,
  windowSeconds = 60,
  maxRequests = 5
): Promise<Response | null> {
  try {
    const { data, error } = await adminClient.rpc("check_request_throttle", {
      p_user_id: userId,
      p_function_name: functionName,
      p_window_seconds: windowSeconds,
      p_max_requests: maxRequests,
    });

    if (error) {
      // Fail open — allow the request if RPC fails
      console.error("Rate limit RPC error (failing open):", error.message);
      return null;
    }

    if (data && !data.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many requests. Please wait a moment before trying again.",
          retry_after_seconds: windowSeconds,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return null; // Allowed
  } catch (err) {
    // Fail open on any exception
    console.error("Rate limit check exception (failing open):", err);
    return null;
  }
}
