import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Dynamic CORS — only allow your domains
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https:\/\/.*\.lovable\.app$/,
  /^https:\/\/.*\.lovable\.dev$/,
  /^https:\/\/hseuprmcguiqgrdcqexi\.supabase\.co$/,
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Auth guard — must be authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create a client with the user's JWT to verify identity
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Admin client for privileged operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // ── STEP 1: Archive everything into deleted_accounts ──
    const [userRow, dnaRow, interactions, validations, alerts, usage, savedIdeas, collections] =
      await Promise.all([
        adminClient.from("users").select("*").eq("id", userId).maybeSingle(),
        adminClient.from("builder_dna").select("*").eq("user_id", userId).maybeSingle(),
        adminClient.from("user_interactions").select("*").eq("user_id", userId),
        adminClient.from("idea_validations").select("*").eq("user_id", userId),
        adminClient.from("user_alerts").select("*").eq("user_id", userId),
        adminClient.from("usage_tracking").select("*").eq("user_id", userId),
        adminClient.from("user_saved_ideas").select("*").eq("user_id", userId),
        adminClient.from("collections").select("*").eq("user_id", userId),
      ]);

    // Determine plan status
    const u = userRow.data;
    let planStatus = "free";
    if (u?.subscription_status === "active") planStatus = "pro";
    else if (u?.trial_ends_at && new Date(u.trial_ends_at) > new Date()) planStatus = "trial";

    await adminClient.from("deleted_accounts").insert({
      original_user_id: userId,
      email: user.email || u?.email || null,
      display_name: u?.display_name || user.user_metadata?.display_name || null,
      plan_status: planStatus,
      is_early_adopter: u?.is_early_adopter || false,
      user_row: u || null,
      builder_dna: dnaRow.data || null,
      interactions: interactions.data || [],
      validations: validations.data || [],
      alerts: alerts.data || [],
      usage: usage.data || [],
      saved_ideas: savedIdeas.data || [],
      collections: collections.data || [],
      notification_prefs: u?.notification_preferences || null,
    });

    // ── STEP 2: Unsubscribe from all emails immediately ──
    await adminClient
      .from("users")
      .update({ email_unsubscribed: true, notification_preferences: {} })
      .eq("id", userId);

    // ── STEP 3: Delete user data from public tables ──
    const tables = [
      "builder_dna",
      "user_interactions",
      "idea_validations",
      "user_alerts",
      "usage_tracking",
      "page_events",
      "feature_waitlist",
      "collections",
      "user_saved_ideas",
    ];

    for (const table of tables) {
      await adminClient.from(table).delete().eq("user_id", userId);
    }

    // ── STEP 4: Delete from public.users ──
    await adminClient.from("users").delete().eq("id", userId);

    // ── STEP 5: Delete from auth.users using admin API ──
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error("Failed to delete auth user:", deleteAuthError.message);
      return new Response(
        JSON.stringify({ error: "Failed to delete account. Please contact support." }),
        {
          status: 500,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please contact support." }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
