import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

/**
 * SUBMIT-FEEDBACK — public endpoint for submitting feedback.
 * POST { uid, token, feedback_type, responses }
 * Verifies HMAC token, saves to user_feedback, grants reward.
 */

// Dynamic CORS
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https:\/\/.*\.lovable\.app$/,
  /^https:\/\/.*\.lovable\.dev$/,
  /^https:\/\/idearupt\.com$/,
  /^https:\/\/www\.idearupt\.com$/,
  /^https:\/\/idearupt\.ai$/,
  /^https:\/\/www\.idearupt\.ai$/,
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const isAllowed = ALLOWED_ORIGINS.some((p) => p.test(origin));
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { uid, token, feedback_type, responses } = body;

    if (!uid || !token || !feedback_type || !responses) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify HMAC token
    const secret = Deno.env.get("FEEDBACK_TOKEN_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(0, 32);
    const expected = createHmac("sha256", secret).update(uid).digest("hex");

    if (token !== expected) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Ban check
    const { data: bannedUser } = await adminClient
      .from("users")
      .select("is_banned")
      .eq("id", uid)
      .maybeSingle();
    if (bannedUser?.is_banned) {
      return new Response(JSON.stringify({ error: "Account suspended." }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check if already submitted this type
    const { data: existing } = await adminClient
      .from("user_feedback")
      .select("id")
      .eq("user_id", uid)
      .eq("feedback_type", feedback_type)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "You've already submitted this feedback. Thank you!" }), {
        status: 409,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Save feedback
    const { error: insertError } = await adminClient
      .from("user_feedback")
      .insert({
        user_id: uid,
        feedback_type,
        responses: typeof responses === "object" ? responses : { raw: responses },
        source: "email",
      });

    if (insertError) {
      console.error("Failed to insert feedback:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save feedback" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Grant reward: quick = 3 days, deep = 7 days
    const rewardDays = feedback_type === "deep" ? 7 : 3;
    const rewardExpiry = new Date(Date.now() + rewardDays * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await adminClient
      .from("users")
      .update({
        subscription_status: "trial",
        plan_status: "free",
        trial_ends_at: rewardExpiry,
        feedback_reward_granted: true,
        feedback_reward_expires_at: rewardExpiry,
      })
      .eq("id", uid);

    if (updateError) {
      console.error("Failed to grant reward:", updateError);
      // Still return success since feedback was saved
    }

    // Grant XP for feedback
    try {
      await adminClient.rpc("record_activity", {
        p_user_id: uid,
        p_action: "feedback",
        p_xp_amount: feedback_type === "deep" ? 50 : 25,
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({
        success: true,
        reward_days: rewardDays,
        message: `Done! You've got ${rewardDays} days of Pro access.`,
      }),
      {
        status: 200,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("submit-feedback error:", e);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
