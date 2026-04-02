import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PROCESS IDEA ALERTS (Sniper Mode)
 * Triggered daily by pg_cron at 10 AM UTC.
 * For each active alert, finds ideas created in the last 24h (daily) or 7 days (weekly)
 * that match the alert's niches + min_pain_score. Sends email via Resend.
 * Deduped via email_log (email_type = 'idea_alert').
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const todayStr = now.toISOString().substring(0, 10);

    // 1. Get all active alerts
    const { data: alerts, error: alertErr } = await admin
      .from("user_alerts")
      .select("*")
      .eq("status", "active");

    if (alertErr || !alerts || alerts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, reason: "No active alerts" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Get recent ideas (last 7 days covers both daily and weekly)
    const { data: recentIdeas } = await admin
      .from("ideas")
      .select("id, title, one_liner, description, category, overall_score, pain_score, tags, created_at")
      .gte("created_at", sevenDaysAgo)
      .order("pain_score", { ascending: false });

    if (!recentIdeas || recentIdeas.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, reason: "No recent ideas" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Get user details for all alert owners
    const userIds = [...new Set(alerts.map((a: any) => a.user_id))];
    const { data: users } = await admin
      .from("users")
      .select("id, email, subscription_status, plan_status, is_early_adopter")
      .in("id", userIds)
      .not("email", "is", null)
      .neq("email_unsubscribed", true)
      .neq("is_banned", true);

    const userMap = new Map((users || []).map((u: any) => [u.id, u]));

    let sentCount = 0;
    let skippedCount = 0;

    for (const alert of alerts) {
      const user = userMap.get(alert.user_id);
      if (!user?.email) { skippedCount++; continue; }

      // Check frequency: daily alerts use 24h window, weekly use 7-day window
      const cutoff = alert.frequency === "weekly" ? sevenDaysAgo : oneDayAgo;

      // Filter ideas by alert criteria
      const matchingIdeas = recentIdeas.filter((idea: any) => {
        // Must be within time window
        if (idea.created_at < cutoff) return false;
        // Must meet pain threshold
        if ((idea.pain_score ?? 0) < (alert.min_pain_score ?? 0)) return false;
        // Must match at least one niche
        if (alert.niches && alert.niches.length > 0) {
          const ideaCat = (idea.category || "").toLowerCase();
          const ideaTags = (idea.tags || []).map((t: string) => t.toLowerCase());
          const matchesNiche = alert.niches.some((niche: string) => {
            const n = niche.toLowerCase();
            if (ideaCat.includes(n) || n.includes(ideaCat)) return true;
            if (ideaTags.some((tag: string) => tag.includes(n) || n.includes(tag))) return true;
            return false;
          });
          if (!matchesNiche) return false;
        }
        return true;
      });

      if (matchingIdeas.length === 0) { skippedCount++; continue; }

      // Dedup: check if we already sent for this alert today
      const { data: existing } = await admin
        .from("email_log")
        .select("id")
        .eq("user_id", alert.user_id)
        .eq("email_type", "idea_alert")
        .gte("sent_at", `${todayStr}T00:00:00Z`)
        .maybeSingle();

      if (existing) { skippedCount++; continue; }

      const topIdeas = matchingIdeas.slice(0, 5);
      const firstName = getFirstName(user.email);
      const subject = `🎯 ${matchingIdeas.length} new problem${matchingIdeas.length !== 1 ? "s" : ""} match "${alert.name}"`;
      const html = buildAlertEmail(topIdeas, firstName, alert.name, matchingIdeas.length);

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
            user_id: alert.user_id,
            email: user.email,
            email_type: "idea_alert",
            metadata: {
              alert_id: alert.id,
              alert_name: alert.name,
              matches: matchingIdeas.length,
              ideas: topIdeas.map((i: any) => i.id),
            },
          });

          // Update alert stats
          await admin
            .from("user_alerts")
            .update({
              last_triggered_at: now.toISOString(),
              matches_count: (alert.matches_count || 0) + matchingIdeas.length,
            })
            .eq("id", alert.id);

          sentCount++;
        } else {
          const errText = await res.text();
          console.error(`Failed alert email to ${user.email}:`, errText);
        }
      } catch (sendErr) {
        console.error(`Error sending alert to ${user.email}:`, sendErr);
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: alerts.length,
        sent: sentCount,
        skipped: skippedCount,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Process idea alerts error:", e);
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ── Helpers ─────────────────────────────────────────────────

function getFirstName(email: string): string {
  const raw = email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] || "Builder";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function buildAlertEmail(ideas: any[], firstName: string, alertName: string, totalMatches: number): string {
  const ideaRows = ideas
    .map((idea: any) => {
      const painScore = idea.pain_score ?? 0;
      const overallScore = idea.overall_score ?? 0;
      const oneLiner = (idea.one_liner || idea.description || "").substring(0, 140);
      const ideaUrl = `https://idearupt.ai/feed?idea=${idea.id}`;
      return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #27272a;">
        <a href="${ideaUrl}" style="text-decoration:none;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#f4f4f5;">${idea.title}</p>
          <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#a1a1aa;">${oneLiner}</p>
          <p style="margin:0;font-size:11px;color:#71717a;">Score: ${overallScore.toFixed(1)} · Pain: ${painScore.toFixed(1)} · ${idea.category || "General"}</p>
        </a>
      </td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Idea Alert</title></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#18181b;border-radius:12px;overflow:hidden;border:1px solid #27272a;">
        <tr><td style="background:linear-gradient(135deg,#8B5CF6,#7C3AED);padding:28px 32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;">Idea</span><span style="font-size:22px;font-weight:700;color:#e0d4ff;">rupt</span>
          <span style="float:right;font-size:11px;color:rgba(255,255,255,0.7);line-height:30px;">🎯 Alert: ${alertName}</span>
        </td></tr>
        <tr><td style="padding:32px 32px 24px;">
          <p style="margin:0 0 6px;font-size:15px;color:#a1a1aa;">Hey ${firstName},</p>
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#f4f4f5;line-height:1.3;">
            ${totalMatches} new problem${totalMatches !== 1 ? "s" : ""} match your "${alertName}" alert
          </h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${ideaRows}
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 0;">
            <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
              <a href="https://idearupt.ai/radar" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View on Pain Radar &rarr;</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #27272a;"></div></td></tr>
        <tr><td style="padding:20px 32px 28px;">
          <p style="margin:0 0 4px;font-size:12px;color:#52525b;">&mdash; Bhavesh, Founder of Idearupt</p>
          <p style="margin:0 0 4px;font-size:11px;color:#3f3f46;">You're receiving this because you set up an Idea Alert.</p>
          <p style="margin:0;font-size:11px;color:#3f3f46;"><a href="mailto:hello@idearupt.ai?subject=unsubscribe" style="color:#8B5CF6;text-decoration:underline;">Unsubscribe</a> &middot; <a href="https://idearupt.ai/privacy" style="color:#8B5CF6;text-decoration:none;">Privacy</a> &middot; <a href="https://idearupt.ai/terms" style="color:#8B5CF6;text-decoration:none;">Terms</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
