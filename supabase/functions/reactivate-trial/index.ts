import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

/**
 * REACTIVATE-TRIAL — one-click trial reactivation via signed link.
 * GET ?uid=USER_ID&token=HMAC_TOKEN&days=3
 * Verifies HMAC, extends trial, redirects to /feed?reactivated=true.
 */

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const uid = url.searchParams.get("uid");
    const token = url.searchParams.get("token");
    const days = parseInt(url.searchParams.get("days") || "3", 10);

    if (!uid || !token) {
      return new Response(JSON.stringify({ error: "Missing uid or token" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate days range (1-14)
    const safeDays = Math.min(Math.max(days, 1), 14);

    // Verify HMAC token
    const secret = Deno.env.get("FEEDBACK_TOKEN_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(0, 32);
    const expected = createHmac("sha256", secret).update(uid).digest("hex");

    if (token !== expected) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Update user: reactivate trial
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const newTrialEnd = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await adminClient
      .from("users")
      .update({
        subscription_status: "trial",
        plan_status: "free",
        trial_ends_at: newTrialEnd,
      })
      .eq("id", uid);

    if (updateError) {
      console.error("Failed to reactivate trial:", updateError);
      return new Response(JSON.stringify({ error: "Failed to reactivate" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log this reactivation
    try {
      await adminClient.from("email_log").insert({
        user_id: uid,
        email_type: `reactivation_${safeDays}d`,
        metadata: { days: safeDays, source: "link" },
      });
    } catch { /* non-blocking */ }

    // Redirect to feed
    return new Response(null, {
      status: 302,
      headers: {
        Location: `https://idearupt.ai/feed?reactivated=true`,
      },
    });
  } catch (e) {
    console.error("reactivate-trial error:", e);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
