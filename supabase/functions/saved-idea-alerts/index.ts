import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SAVED IDEA ALERTS
 * Triggered daily by pg_cron at 6 PM UTC.
 * For each user, checks their saved ideas. If any saved idea was updated
 * in the last 24 hours (score change, new data), sends an alert email.
 *
 * Saved ideas are stored in the user_interactions table with action = 'saved'.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Trial variant ($19/mo with 7-day trial) — for users who have NEVER started a trial
const CHECKOUT_19_WITH_TRIAL = "https://idearupt.lemonsqueezy.com/checkout/buy/d5f33458-36d9-4b0e-9f2b-2e7c79dfab76";
// No-trial variant ($19 direct charge) — for users who already had a trial
const CHECKOUT_19_NO_TRIAL = "https://idearupt.lemonsqueezy.com/checkout/buy/b7ea618b-4994-4d89-b36d-b63f25f6603a";
// Early adopter ($9/mo, no trial)
const CHECKOUT_9 = "https://idearupt.lemonsqueezy.com/checkout/buy/59b85633-b196-48e0-8324-28a4c365ce98";

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const todayStr = new Date().toISOString().substring(0, 10);

    // ── 1. Get all users who have saved ideas ───────────────
    const { data: allSaves } = await admin
      .from("user_interactions")
      .select("user_id, idea_id")
      .eq("action", "saved");

    if (!allSaves || allSaves.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "No saved ideas" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Group saves by user
    const userSaves: Record<string, string[]> = {};
    for (const s of allSaves) {
      if (!s.user_id || !s.idea_id) continue;
      if (!userSaves[s.user_id]) userSaves[s.user_id] = [];
      userSaves[s.user_id].push(s.idea_id);
    }

    const userIds = Object.keys(userSaves);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "No users with saves" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // ── 2. Get all ideas that were updated in last 24h ──────
    const allSavedIdeaIds = [...new Set(allSaves.map((s) => s.idea_id))];
    const { data: updatedIdeas } = await admin
      .from("ideas")
      .select("id, title, description, one_liner, category, overall_score, scores, view_count, updated_at")
      .in("id", allSavedIdeaIds)
      .gte("updated_at", yesterday);

    if (!updatedIdeas || updatedIdeas.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "No saved ideas updated recently" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const updatedMap = new Map(updatedIdeas.map((i: any) => [i.id, i]));

    // ── 3. Get user details ─────────────────────────────────
    const { data: users } = await admin
      .from("users")
      .select("id, email, subscription_status, plan_status, is_early_adopter, ls_customer_id")
      .in("id", userIds)
      .not("email", "is", null)
      .neq("email_unsubscribed", true)
      .neq("is_banned", true);

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "No user emails" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const userMap = new Map(users.map((u: any) => [u.id, u]));

    let sentCount = 0;
    let skippedCount = 0;

    for (const userId of userIds) {
      const user = userMap.get(userId);
      if (!user?.email) { skippedCount++; continue; }

      // Find which of this user's saved ideas were updated
      const savedIds = userSaves[userId];
      const changedIdeas = savedIds
        .map((id) => updatedMap.get(id))
        .filter(Boolean)
        .slice(0, 3); // Max 3 per email

      if (changedIdeas.length === 0) { skippedCount++; continue; }

      // Deduplication
      const { data: existing } = await admin
        .from("email_log")
        .select("id")
        .eq("user_id", userId)
        .eq("email_type", "saved_idea_alert")
        .gte("created_at", `${todayStr}T00:00:00Z`)
        .maybeSingle();

      if (existing) { skippedCount++; continue; }

      const firstName = getFirstName(user.email);
      const isPro = user.subscription_status === "pro" || user.subscription_status === "paid" || user.plan_status === "active" || user.plan_status === "trial";
      const isEarlyAdopter = !!user.is_early_adopter;
      const hasUsedTrial = !!user.ls_customer_id;
      const topIdea = changedIdeas[0] as any;
      const subject = `📈 An idea you saved just got hotter — ${topIdea.title.length > 50 ? topIdea.title.substring(0, 50) + "..." : topIdea.title} is trending`;
      const html = buildAlertEmail(changedIdeas, firstName, user.email, userId, isPro, isEarlyAdopter, hasUsedTrial);

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Bhavesh from Idearupt <hello@idearupt.ai>",
            reply_to: "bhavesh@idearupt.ai",
            to: [user.email],
            subject,
            html,
            headers: {
              "List-Unsubscribe": "<mailto:hello@idearupt.ai?subject=unsubscribe>",
              "X-Entity-Ref-ID": crypto.randomUUID(),
            },
          }),
        });

        if (res.ok) {
          await admin.from("email_log").insert({
            user_id: userId,
            email: user.email,
            email_type: "saved_idea_alert",
            metadata: { ideas: changedIdeas.map((i: any) => i.id) },
          });
          sentCount++;
        } else {
          const errText = await res.text();
          console.error(`Failed saved alert to ${user.email}:`, errText);
        }
      } catch (sendErr) {
        console.error(`Error sending saved alert to ${user.email}:`, sendErr);
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    return new Response(
      JSON.stringify({ success: true, processed: userIds.length, sent: sentCount, skipped: skippedCount }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Saved idea alerts error:", e);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});

// ─── Helpers ─────────────────────────────────────────────────

function getFirstName(email: string): string {
  const raw = email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] || "Builder";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function getCategoryColor(cat: string | null): string {
  const colors: Record<string, string> = {
    "ai/ml": "#A78BFA", "developer tools": "#22D3EE", marketing: "#FBBF24",
    sales: "#34D399", productivity: "#22D3EE", "e-commerce": "#FBBF24",
    analytics: "#22D3EE", finance: "#34D399", healthcare: "#F87171",
    education: "#A78BFA",
  };
  return colors[(cat || "").toLowerCase()] || "#A78BFA";
}

function buildIdeaCard(idea: any): string {
  const painScore = idea.scores?.pain_score ?? 0;
  const overallScore = idea.overall_score ?? 0;
  const catColor = getCategoryColor(idea.category);
  const oneLiner = idea.one_liner || idea.description?.substring(0, 120) || "";
  const viewCount = idea.view_count ?? 0;
  const ideaUrl = `https://idearupt.ai/feed?idea=${idea.id}`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1b2e;border:1px solid #2e2a45;border-radius:10px;margin:0 0 16px;">
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <span style="display:inline-block;font-size:11px;font-weight:600;color:${catColor};background:${catColor}18;border:1px solid ${catColor}40;border-radius:6px;padding:3px 8px;">${idea.category || "General"}</span>
          </td>
          <td align="right">
            <span style="display:inline-block;font-size:11px;font-weight:600;color:#34D399;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:6px;padding:3px 8px;">📈 Updated</span>
          </td>
        </tr></table>
        <h2 style="margin:12px 0 6px;font-size:16px;font-weight:700;color:#f4f4f5;line-height:1.3;">${idea.title}</h2>
        <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#a1a1aa;">${oneLiner.length > 140 ? oneLiner.substring(0, 140) + "..." : oneLiner}</p>
        <p style="margin:0 0 14px;font-size:11px;color:#71717a;">Score: ${overallScore.toFixed(1)} · Pain: ${painScore.toFixed(1)}${viewCount > 0 ? ` · ${viewCount} builders viewed this` : ""}</p>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
            <a href="${ideaUrl}" style="display:inline-block;padding:10px 24px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">Check Updated Insights &rarr;</a>
          </td></tr>
        </table>
      </td></tr>
    </table>`;
}

function checkoutUrl(email: string, isEarlyAdopter: boolean, hasUsedTrial: boolean = false): string {
  const base = isEarlyAdopter ? CHECKOUT_9 : (hasUsedTrial ? CHECKOUT_19_NO_TRIAL : CHECKOUT_19_WITH_TRIAL);
  return `${base}?checkout[email]=${encodeURIComponent(email)}`;
}

function buildAlertEmail(ideas: any[], firstName: string, email: string, userId: string, isPro: boolean = false, isEarlyAdopter: boolean = false, hasUsedTrial: boolean = false): string {
  const ideaCards = ideas.map((idea: any) => buildIdeaCard(idea)).join("");
  const priceLabel = isEarlyAdopter ? "$9/mo" : "$19/mo";
  const cUrl = checkoutUrl(email, isEarlyAdopter, hasUsedTrial);

  const upgradeBlock = !isPro ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c1a0e;border:1px solid #166534;border-radius:8px;margin:0 0 20px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#4ade80;">&#128275; <strong>${hasUsedTrial ? `Go Pro for ${priceLabel}` : "Start your free 7-day trial"}</strong> — Pain Radar, Sniper Mode Alerts, PDF exports, source threads, idea comparison &amp; unlimited saves. <a href="${cUrl}" style="color:#8B5CF6;font-weight:600;text-decoration:none;">${hasUsedTrial ? "Upgrade" : "Start Free Trial"} &rarr;</a></p>
            </td></tr>
          </table>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Saved Idea Alert</title></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#18181b;border-radius:12px;overflow:hidden;border:1px solid #27272a;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#8B5CF6,#7C3AED);padding:28px 32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;">Idea</span><span style="font-size:22px;font-weight:700;color:#e0d4ff;">rupt</span>
          <span style="float:right;font-size:11px;color:rgba(255,255,255,0.7);line-height:30px;">Saved Idea Alert</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 32px 24px;">
          <p style="margin:0 0 6px;font-size:15px;color:#a1a1aa;">Hey ${firstName},</p>
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#f4f4f5;line-height:1.3;">${ideas.length === 1 ? "An idea you saved is getting more traction:" : `${ideas.length} ideas you saved are getting more traction:`}</h1>

          ${ideaCards}

          <!-- CTA: See all saved -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td style="background:#27272a;border:1px solid #3f3f46;border-radius:8px;">
              <a href="https://idearupt.ai/saved" style="display:inline-block;padding:12px 28px;color:#f4f4f5;font-size:14px;font-weight:600;text-decoration:none;">See All Your Saved Ideas &rarr;</a>
            </td></tr>
          </table>

          ${upgradeBlock}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #27272a;"></div></td></tr>
        <tr><td style="padding:20px 32px 28px;">
          <p style="margin:0 0 4px;font-size:12px;color:#52525b;">&mdash; Bhavesh, Founder of Idearupt</p>
          <p style="margin:0 0 4px;font-size:11px;color:#3f3f46;">You're receiving this because you signed up for Idearupt.</p>
          <p style="margin:0;font-size:11px;color:#3f3f46;"><a href="mailto:hello@idearupt.ai?subject=unsubscribe" style="color:#8B5CF6;text-decoration:underline;">Unsubscribe</a> &middot; <a href="https://idearupt.ai/privacy" style="color:#8B5CF6;text-decoration:none;">Privacy</a> &middot; <a href="https://idearupt.ai/terms" style="color:#8B5CF6;text-decoration:none;">Terms</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
