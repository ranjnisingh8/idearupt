import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBatchInteractionCounts } from "../_shared/user-stats.ts";

/**
 * DAILY MORNING EMAIL — "Today's Top Problems"
 * Triggered daily by pg_cron at 8 AM UTC.
 * Picks top 3 highest-scored ideas from the last 24 hours (or latest 3 overall)
 * and emails every user who hasn't unsubscribed.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Trial variant ($19/mo with 7-day trial) — for users who have NEVER started a trial
const CHECKOUT_19_WITH_TRIAL = "https://idearupt.lemonsqueezy.com/checkout/buy/d5f33458-36d9-4b0e-9f2b-2e7c79dfab76";
// No-trial variant ($19 direct charge) — for users who already had a trial
const CHECKOUT_19_NO_TRIAL = "https://idearupt.lemonsqueezy.com/checkout/buy/b7ea618b-4994-4d89-b36d-b63f25f6603a";
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

    // ── 1. Get top 3 ideas ──────────────────────────────────
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let { data: topIdeas } = await admin
      .from("ideas")
      .select("id, title, description, one_liner, category, overall_score, scores, distinct_posters, save_count")
      .gte("created_at", yesterday)
      .order("overall_score", { ascending: false })
      .limit(3);

    // Fallback: if fewer than 3 ideas in last 24h, get latest 3 overall
    if (!topIdeas || topIdeas.length < 3) {
      const { data: fallback } = await admin
        .from("ideas")
        .select("id, title, description, one_liner, category, overall_score, scores, distinct_posters, save_count")
        .order("overall_score", { ascending: false })
        .limit(3);
      if (fallback && fallback.length > (topIdeas?.length || 0)) {
        topIdeas = fallback;
      }
    }

    if (!topIdeas || topIdeas.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "No ideas to feature" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Count how many new ideas dropped today
    const { count: todayCount } = await admin
      .from("ideas")
      .select("id", { count: "exact", head: true })
      .gte("created_at", yesterday);

    const extraCount = Math.max(0, (todayCount || 0) - 3);

    // ── 2. Get all users to email (include gamification data) ──
    const { data: users } = await admin
      .from("users")
      .select("id, email, subscription_status, is_early_adopter, current_streak, last_active_date, ls_customer_id, xp, level")
      .not("email", "is", null)
      .neq("email_unsubscribed", true)
      .neq("is_banned", true);

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "No users" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const todayStr = new Date().toISOString().substring(0, 10);
    let sentCount = 0;
    let skippedCount = 0;

    // ── Batch stats for personalization ──
    const userIds = users.map((u: any) => u.id);
    const interactionCounts = await getBatchInteractionCounts(admin, userIds);

    // Active users yesterday (for social proof hook)
    const yesterdayStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const yesterdayEnd = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let activeUsersYesterday = 0;
    try {
      const { count } = await admin
        .from("user_interactions")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", yesterdayStart)
        .lte("created_at", yesterdayEnd);
      activeUsersYesterday = count || 0;
    } catch { /* non-blocking */ }

    // XP levels for stickiness hooks
    const LEVELS = [
      { name: "Curious", xp: 0 },
      { name: "Explorer", xp: 100 },
      { name: "Scout", xp: 300 },
      { name: "Researcher", xp: 600 },
      { name: "Analyst", xp: 1000 },
      { name: "Strategist", xp: 2000 },
      { name: "Builder", xp: 4000 },
      { name: "Architect", xp: 7000 },
      { name: "Visionary", xp: 10000 },
      { name: "Top 1%", xp: 12000 },
    ];

    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));

    for (const user of users) {
      if (!user.email) { skippedCount++; continue; }

      // Deduplication: skip if already received daily email today
      const { data: existing } = await admin
        .from("email_log")
        .select("id")
        .eq("user_id", user.id)
        .eq("email_type", "daily_morning")
        .gte("created_at", `${todayStr}T00:00:00Z`)
        .maybeSingle();

      if (existing) { skippedCount++; continue; }

      const isPro = user.subscription_status === "pro" || user.subscription_status === "paid";
      const isEarlyAdopter = !!user.is_early_adopter;
      const firstName = getFirstName(user.email);

      // Streak-at-risk: user was active yesterday (streak > 0, last_active_date = yesterday)
      const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
      const streakAtRisk = (user.current_streak ?? 0) > 0 && user.last_active_date === yesterdayDate;
      const streakCount = user.current_streak ?? 0;

      // Engagement level from batch interaction counts
      const counts = interactionCounts.get(user.id) || { views: 0, saves: 0 };
      let engagementLevel: "ghost" | "light" | "medium" | "heavy" = "ghost";
      if (counts.views >= 10 && counts.saves >= 3) engagementLevel = "heavy";
      else if (counts.views >= 3) engagementLevel = "medium";
      else if (counts.views >= 1) engagementLevel = "light";

      // Top category from ideas (use first idea's category as personalized fallback)
      const topCat = topIdeas[0]?.category || "trending";

      // Personalized subject line by engagement
      let subject: string;
      if (engagementLevel === "ghost") {
        subject = `you signed up but never explored — here's what ${activeUsersYesterday || "dozens of"} builders found`;
      } else if (engagementLevel === "light") {
        subject = `3 new ${topCat} ideas just dropped`;
      } else {
        subject = `today's top 3 — including one in ${topCat}`;
      }

      // Personalized greeting intro
      let greetingIntro: string;
      if (engagementLevel === "ghost") {
        greetingIntro = `You signed up for Idearupt but haven't explored yet. Here's what you're missing — today's highest-scoring problems:`;
      } else if (engagementLevel === "light") {
        greetingIntro = `New problems just dropped. Here are today's top picks:`;
      } else if (engagementLevel === "medium") {
        greetingIntro = `You've been exploring — here are today's highest-scored problems:`;
      } else {
        greetingIntro = `Welcome back! Here are today's top problems, curated for builders like you:`;
      }

      // Stickiness hook
      let stickinessHook = "";
      if (streakAtRisk) {
        stickinessHook = `<p style="margin:0 0 12px;font-size:13px;color:#A78BFA;">your ${streakCount}-day streak resets in a few hours. one idea view keeps it going.</p>`;
      } else {
        const hookType = dayOfYear % 4;
        if (hookType === 0 && streakCount > 0) {
          stickinessHook = `<p style="margin:0 0 12px;font-size:13px;color:#A78BFA;">your ${streakCount}-day streak is alive</p>`;
        } else if (hookType === 1 && counts.saves > 0) {
          stickinessHook = `<p style="margin:0 0 12px;font-size:13px;color:#A78BFA;">you've saved ${counts.saves} idea${counts.saves !== 1 ? "s" : ""}</p>`;
        } else if (hookType === 2 && activeUsersYesterday > 0) {
          stickinessHook = `<p style="margin:0 0 12px;font-size:13px;color:#A78BFA;">${activeUsersYesterday} builders explored ideas yesterday</p>`;
        } else if (hookType === 3) {
          const userXp = user.xp ?? 0;
          const userLevel = user.level ?? 0;
          const nextLevel = Math.min(userLevel + 1, LEVELS.length - 1);
          const xpNeeded = LEVELS[nextLevel].xp - userXp;
          if (xpNeeded > 0) {
            stickinessHook = `<p style="margin:0 0 12px;font-size:13px;color:#A78BFA;">you're ${xpNeeded} XP from Level ${nextLevel + 1} (${LEVELS[nextLevel].name})</p>`;
          }
        }
      }

      const hasUsedTrial = !!user.ls_customer_id;
      const emailHtml = buildDailyEmail(topIdeas, firstName, isPro, user.email, user.id, extraCount, isEarlyAdopter, streakAtRisk, streakCount, hasUsedTrial, greetingIntro, stickinessHook);

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
            html: emailHtml,
            headers: {
              "List-Unsubscribe": "<mailto:hello@idearupt.ai?subject=unsubscribe>",
              "X-Entity-Ref-ID": crypto.randomUUID(),
            },
          }),
        });

        if (res.ok) {
          await admin.from("email_log").insert({
            user_id: user.id,
            email: user.email,
            email_type: "daily_morning",
            metadata: { ideas: topIdeas.map((i: any) => i.id) },
          });
          sentCount++;
        } else {
          const errText = await res.text();
          console.error(`Failed daily email to ${user.email}:`, errText);
        }
      } catch (sendErr) {
        console.error(`Error sending daily email to ${user.email}:`, sendErr);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 150));
    }

    return new Response(
      JSON.stringify({ success: true, processed: users.length, sent: sentCount, skipped: skippedCount }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Daily morning email error:", e);
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

function checkoutUrl(email: string, userId?: string, isEarlyAdopter: boolean = false, hasUsedTrial: boolean = false): string {
  const base = isEarlyAdopter ? CHECKOUT_9 : (hasUsedTrial ? CHECKOUT_19_NO_TRIAL : CHECKOUT_19_WITH_TRIAL);
  let url = `${base}?checkout[email]=${encodeURIComponent(email)}`;
  if (userId) url += `&checkout[custom][user_id]=${userId}`;
  return url;
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

function buildIdeaCard(idea: any, rank: number): string {
  const painScore = idea.scores?.pain_score ?? 0;
  const overallScore = idea.overall_score ?? 0;
  const catColor = getCategoryColor(idea.category);
  const oneLiner = idea.one_liner || idea.description?.substring(0, 120) || "";
  const posters = idea.distinct_posters ?? 0;
  const ideaUrl = `https://idearupt.ai/feed?idea=${idea.id}`;
  const isFirst = rank === 1;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${isFirst ? "#1e1b2e" : "#1a1a1f"};border:1px solid ${isFirst ? "#2e2a45" : "#27272a"};border-radius:10px;margin:0 0 16px;">
      <tr><td style="padding:20px;">
        <!-- Category + Score -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <span style="display:inline-block;font-size:11px;font-weight:600;color:${catColor};background:${catColor}18;border:1px solid ${catColor}40;border-radius:6px;padding:3px 8px;">${idea.category || "General"}</span>
            <span style="display:inline-block;font-size:11px;font-weight:600;color:#F59E0B;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:3px 8px;margin-left:6px;">Pain: ${painScore.toFixed(1)}</span>
          </td>
          <td align="right">
            <span style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:50%;background:linear-gradient(135deg,#8B5CF6,#06B6D4);color:#fff;font-size:13px;font-weight:700;">${overallScore.toFixed(0)}</span>
          </td>
        </tr></table>
        <!-- Title -->
        <h2 style="margin:12px 0 6px;font-size:${isFirst ? "18px" : "16px"};font-weight:700;color:#f4f4f5;line-height:1.3;">${idea.title}</h2>
        <!-- One liner -->
        <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#a1a1aa;">${oneLiner.length > 140 ? oneLiner.substring(0, 140) + "..." : oneLiner}</p>
        <!-- Stats -->
        <p style="margin:0 0 14px;font-size:11px;color:#71717a;">Score: ${overallScore.toFixed(1)} ${posters > 0 ? ` · ${posters} people complaining` : ""}</p>
        <!-- CTA -->
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td style="background:${isFirst ? "linear-gradient(135deg,#8B5CF6,#06B6D4)" : "#27272a"};border-radius:8px;">
            <a href="${ideaUrl}" style="display:inline-block;padding:10px 24px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">${isFirst ? "Explore This Idea" : "Explore"} &rarr;</a>
          </td></tr>
        </table>
      </td></tr>
    </table>`;
}

function buildDailyEmail(ideas: any[], firstName: string, isPro: boolean, email: string, userId: string, extraCount: number, isEarlyAdopter: boolean = false, streakAtRisk: boolean = false, streakCount: number = 0, hasUsedTrial: boolean = false, greetingIntro: string = "", stickinessHook: string = ""): string {
  const ideaCards = ideas.map((idea: any, i: number) => buildIdeaCard(idea, i + 1)).join("");
  const priceLabel = isEarlyAdopter ? "$9/mo" : "$19/mo";

  const streakBlock = streakAtRisk ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1c1007;border:1px solid #92400e;border-radius:10px;margin:0 0 20px;">
      <tr><td style="padding:18px 24px;">
        <p style="margin:0 0 4px;font-size:20px;">&#x1F525;</p>
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#FCD34D;">Your ${streakCount}-day streak is at risk!</p>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#D97706;">Don't let it slip — explore just one idea today to keep your streak alive.</p>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td style="background:linear-gradient(135deg,#F59E0B,#D97706);border-radius:8px;">
            <a href="https://idearupt.ai/feed" style="display:inline-block;padding:10px 24px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">Keep My Streak &#x1F525;</a>
          </td></tr>
        </table>
      </td></tr>
    </table>` : "";
  const upgradeBlock = !isPro ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c1a0e;border:1px solid #166534;border-radius:8px;margin:0 0 20px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#4ade80;">&#128275; <strong>${hasUsedTrial ? `Go Pro for ${priceLabel}` : "Start your free 7-day trial"}</strong> &mdash; Pain Radar, Sniper Mode Alerts, PDF exports, source threads, idea comparison &amp; unlimited saves. <a href="${checkoutUrl(email, userId, isEarlyAdopter, hasUsedTrial)}" style="color:#8B5CF6;font-weight:600;text-decoration:none;">${hasUsedTrial ? "Upgrade to Pro" : "Start Free Trial"} &rarr;</a></p>
      </td></tr>
    </table>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Today's Top Problems</title></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#18181b;border-radius:12px;overflow:hidden;border:1px solid #27272a;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#8B5CF6,#7C3AED);padding:28px 32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;">Idea</span><span style="font-size:22px;font-weight:700;color:#e0d4ff;">rupt</span>
          <span style="float:right;font-size:11px;color:rgba(255,255,255,0.7);line-height:30px;">Daily Briefing</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 32px 24px;">
          <p style="margin:0 0 6px;font-size:15px;color:#a1a1aa;">Good morning ${firstName},</p>

          ${streakBlock}

          <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#f4f4f5;line-height:1.3;">${greetingIntro || "Here are today's highest-scored problems people are begging someone to solve:"}</h1>

          ${ideaCards}

          ${extraCount > 0 ? `<p style="margin:0 0 16px;font-size:14px;color:#71717a;text-align:center;">+${extraCount} more problem${extraCount !== 1 ? "s" : ""} dropped today</p>` : ""}

          <!-- Big CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
              <a href="https://idearupt.ai/feed" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">See All Today's Problems &rarr;</a>
            </td></tr>
          </table>

          ${upgradeBlock}

          ${stickinessHook}
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
