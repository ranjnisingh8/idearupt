import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * WEEKLY RECAP EMAIL — "Your Week in Review"
 * Triggered every Monday at 10 AM UTC by pg_cron.
 * Per user: views, XP earned, streak, level this week + top idea.
 * Respects notification_preferences.weekly_roundup (future).
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Trial variant ($19/mo with 7-day trial) — for users who have NEVER started a trial
const CHECKOUT_19_WITH_TRIAL = "https://idearupt.lemonsqueezy.com/checkout/buy/d5f33458-36d9-4b0e-9f2b-2e7c79dfab76";
// No-trial variant ($19 direct charge) — for users who already had a trial
const CHECKOUT_19_NO_TRIAL = "https://idearupt.lemonsqueezy.com/checkout/buy/b7ea618b-4994-4d89-b36d-b63f25f6603a";
const CHECKOUT_9 = "https://idearupt.lemonsqueezy.com/checkout/buy/59b85633-b196-48e0-8324-28a4c365ce98";

const LEVEL_NAMES = ["Curious", "Explorer", "Tinkerer", "Builder", "Hustler", "Operator", "Visionary", "Founder", "Mogul", "Top 1%"];
const LEVEL_EMOJIS = ["\u{1F331}", "\u{1F50D}", "\u{1F527}", "\u{1F528}", "\u{1F525}", "\u{2699}\u{FE0F}", "\u{1F52D}", "\u{1F680}", "\u{1F451}", "\u{1F48E}"];

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

    // Date range: last 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoISO = weekAgo.toISOString();
    const todayStr = now.toISOString().substring(0, 10);

    // Get all users with gamification data
    const { data: users } = await admin
      .from("users")
      .select("id, email, subscription_status, plan_status, is_early_adopter, current_streak, longest_streak, xp, level, ls_customer_id")
      .not("email", "is", null)
      .neq("email_unsubscribed", true)
      .neq("is_banned", true);

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "No users" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Get the top idea of the week (highest scored)
    const { data: topIdeaOfWeek } = await admin
      .from("ideas")
      .select("id, title, one_liner, overall_score, category")
      .gte("created_at", weekAgoISO)
      .order("overall_score", { ascending: false })
      .limit(1);

    const topIdea = topIdeaOfWeek?.[0] || null;

    // Get count of new ideas added this week (for Pro early-access highlight)
    const { count: newIdeasCount } = await admin
      .from("ideas")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgoISO);

    // Get top 3 new ideas this week (for Pro section)
    const { data: newIdeasThisWeek } = await admin
      .from("ideas")
      .select("id, title, one_liner, overall_score, category")
      .gte("created_at", weekAgoISO)
      .order("overall_score", { ascending: false })
      .limit(3);

    let sentCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      if (!user.email) { skippedCount++; continue; }

      // Dedup: skip if already received weekly recap today
      const { data: existing } = await admin
        .from("email_log")
        .select("id")
        .eq("user_id", user.id)
        .eq("email_type", "weekly_recap")
        .gte("created_at", `${todayStr}T00:00:00Z`)
        .maybeSingle();

      if (existing) { skippedCount++; continue; }

      // Get user's activity this week
      const { data: weekActions } = await admin
        .from("user_interactions")
        .select("action, idea_id")
        .eq("user_id", user.id)
        .gte("created_at", weekAgoISO);

      const viewCount = weekActions?.filter((a: any) => a.action === "viewed").length ?? 0;
      const saveCount = weekActions?.filter((a: any) => a.action === "saved").length ?? 0;
      const shareCount = weekActions?.filter((a: any) => a.action === "shared").length ?? 0;
      const totalActions = weekActions?.length ?? 0;

      const isPro = user.subscription_status === "pro" || user.subscription_status === "paid";
      const planStatus = (user as any).plan_status || "none";
      const isActivePro = isPro || planStatus === "active" || planStatus === "trial";
      const isEarlyAdopter = !!user.is_early_adopter;

      // For Pro users: send even with zero activity (they still get Pain Radar + saved ideas recap)
      // For free users: skip if zero activity
      if (totalActions === 0 && !isActivePro) { skippedCount++; continue; }

      // Approximate XP earned this week (5*views + 10*saves + 20*shares)
      const weekXP = viewCount * 5 + saveCount * 10 + shareCount * 20;

      // For Pro users: fetch their saved ideas from this week (up to 5)
      let savedIdeas: any[] = [];
      if (isActivePro) {
        const savedIdeaIds = (weekActions || [])
          .filter((a: any) => a.action === "saved" && a.idea_id)
          .map((a: any) => a.idea_id);

        if (savedIdeaIds.length > 0) {
          const { data: savedData } = await admin
            .from("ideas")
            .select("id, title, overall_score, category")
            .in("id", savedIdeaIds.slice(0, 5));
          savedIdeas = savedData || [];
        }
      }

      const firstName = getFirstName(user.email);
      const levelIndex = Math.min(user.level ?? 0, 9);

      const hasUsedTrial = !!user.ls_customer_id;

      const emailHtml = buildWeeklyEmail({
        firstName,
        viewCount,
        saveCount,
        shareCount,
        weekXP,
        totalXP: user.xp ?? 0,
        streak: user.current_streak ?? 0,
        longestStreak: user.longest_streak ?? 0,
        level: levelIndex,
        levelName: LEVEL_NAMES[levelIndex],
        levelEmoji: LEVEL_EMOJIS[levelIndex],
        topIdea,
        isPro: isActivePro,
        isEarlyAdopter,
        email: user.email,
        userId: user.id,
        savedIdeas,
        newIdeasThisWeek: newIdeasThisWeek || [],
        newIdeasCount: newIdeasCount ?? 0,
        hasUsedTrial,
      });

      const subject = isActivePro
        ? `Your Pro week: ${newIdeasCount ?? 0} new ideas dropped + your saved picks`
        : `\u{1F4CA} Your week: ${viewCount} ideas explored, ${weekXP} XP earned`;

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
            email_type: "weekly_recap",
            metadata: { viewCount, saveCount, shareCount, weekXP },
          });
          sentCount++;
        } else {
          const errText = await res.text();
          console.error(`Failed weekly recap to ${user.email}:`, errText);
        }
      } catch (sendErr) {
        console.error(`Error sending weekly recap to ${user.email}:`, sendErr);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 150));
    }

    return new Response(
      JSON.stringify({ success: true, processed: users.length, sent: sentCount, skipped: skippedCount }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Weekly recap email error:", e);
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

interface WeeklyEmailData {
  firstName: string;
  viewCount: number;
  saveCount: number;
  shareCount: number;
  weekXP: number;
  totalXP: number;
  streak: number;
  longestStreak: number;
  level: number;
  levelName: string;
  levelEmoji: string;
  topIdea: any | null;
  isPro: boolean;
  isEarlyAdopter: boolean;
  email: string;
  userId: string;
  savedIdeas: any[];
  newIdeasThisWeek: any[];
  newIdeasCount: number;
  hasUsedTrial: boolean;
}

function buildWeeklyEmail(d: WeeklyEmailData): string {
  const priceLabel = d.isEarlyAdopter ? "$9/mo" : "$19/mo";

  const topIdeaBlock = d.topIdea ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1b2e;border:1px solid #2e2a45;border-radius:10px;margin:16px 0;">
      <tr><td style="padding:18px 24px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#A78BFA;text-transform:uppercase;letter-spacing:0.05em;">\u{2B50} Top Idea This Week</p>
        <h3 style="margin:0 0 6px;font-size:16px;font-weight:700;color:#f4f4f5;line-height:1.3;">${d.topIdea.title}</h3>
        <p style="margin:0 0 12px;font-size:13px;color:#a1a1aa;line-height:1.4;">${(d.topIdea.one_liner || "").substring(0, 120)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
            <a href="https://idearupt.ai/feed?idea=${d.topIdea.id}" style="display:inline-block;padding:10px 24px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">Explore This Idea &rarr;</a>
          </td></tr>
        </table>
      </td></tr>
    </table>` : "";

  // Pro-exclusive: Saved ideas recap
  const savedIdeasBlock = d.isPro && d.savedIdeas.length > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1b2e;border:1px solid #8B5CF633;border-radius:10px;margin:16px 0;">
      <tr><td style="padding:18px 24px;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:600;color:#A78BFA;text-transform:uppercase;letter-spacing:0.05em;">\u{1F4BE} Your Saved Ideas This Week</p>
        ${d.savedIdeas.map((idea: any) => `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;">
            <tr>
              <td style="font-size:14px;color:#f4f4f5;line-height:1.4;padding:4px 0;">
                <a href="https://idearupt.ai/feed?idea=${idea.id}" style="color:#f4f4f5;text-decoration:none;">${idea.title}</a>
              </td>
              <td align="right" style="font-size:12px;color:#A78BFA;font-weight:600;white-space:nowrap;padding:4px 0 4px 12px;">
                ${idea.overall_score ? Math.round(idea.overall_score) + '/100' : ''}
              </td>
            </tr>
          </table>
        `).join("")}
        <p style="margin:8px 0 0;font-size:12px;color:#71717a;">These are saved to your collection &mdash; revisit them anytime from your dashboard.</p>
      </td></tr>
    </table>` : "";

  // Pro-exclusive: New early-access ideas this week
  const earlyAccessBlock = d.isPro && d.newIdeasThisWeek.length > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c1a0e;border:1px solid #166534;border-radius:10px;margin:16px 0;">
      <tr><td style="padding:18px 24px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#4ade80;text-transform:uppercase;letter-spacing:0.05em;">\u{26A1} New This Week &mdash; ${d.newIdeasCount} Ideas</p>
        <p style="margin:0 0 12px;font-size:12px;color:#a1a1aa;">You had full Pro access to all ${d.newIdeasCount} new problems this week. Here are the top picks:</p>
        ${d.newIdeasThisWeek.map((idea: any) => `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;">
            <tr>
              <td style="font-size:14px;color:#f4f4f5;line-height:1.4;padding:4px 0;">
                <a href="https://idearupt.ai/feed?idea=${idea.id}" style="color:#f4f4f5;text-decoration:none;">${idea.title}</a>
                <span style="font-size:11px;color:#71717a;margin-left:6px;">${idea.category || ''}</span>
              </td>
              <td align="right" style="font-size:12px;color:#4ade80;font-weight:600;white-space:nowrap;padding:4px 0 4px 12px;">
                ${idea.overall_score ? Math.round(idea.overall_score) + '/100' : ''}
              </td>
            </tr>
          </table>
        `).join("")}
      </td></tr>
    </table>` : "";

  // Pro badge for the header
  const proBadge = d.isPro ? `<span style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;color:#fff;margin-left:8px;vertical-align:middle;">PRO</span>` : "";

  const upgradeBlock = !d.isPro ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c1a0e;border:1px solid #166534;border-radius:8px;margin:16px 0 0;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#4ade80;">\u{1F513} <strong>${d.hasUsedTrial ? `Go Pro for ${priceLabel}` : "Start your free 7-day trial"}</strong> &mdash; Pain Radar, Sniper Mode Alerts, PDF exports, source threads, idea comparison &amp; unlimited saves. <a href="${checkoutUrl(d.email, d.userId, d.isEarlyAdopter, d.hasUsedTrial)}" style="color:#8B5CF6;font-weight:600;text-decoration:none;">${d.hasUsedTrial ? "Upgrade to Pro" : "Start Free Trial"} &rarr;</a></p>
      </td></tr>
    </table>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your Weekly Recap</title></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#18181b;border-radius:12px;overflow:hidden;border:1px solid #27272a;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#8B5CF6,#7C3AED);padding:28px 32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;">Idea</span><span style="font-size:22px;font-weight:700;color:#e0d4ff;">rupt</span>
          <span style="float:right;font-size:11px;color:rgba(255,255,255,0.7);line-height:30px;">Weekly Recap</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 32px 24px;">
          <p style="margin:0 0 6px;font-size:15px;color:#a1a1aa;">Hey ${d.firstName},${proBadge}</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#f4f4f5;line-height:1.3;">${d.isPro ? "Your Pro week in review" : "Here's your week in review"} \u{1F4CA}</h1>

          <!-- Stats Grid -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
            <tr>
              <td width="50%" style="padding:0 6px 12px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1f;border:1px solid #27272a;border-radius:10px;">
                  <tr><td style="padding:16px 18px;">
                    <p style="margin:0 0 2px;font-size:24px;font-weight:700;color:#f4f4f5;">${d.viewCount}</p>
                    <p style="margin:0;font-size:11px;color:#71717a;">Ideas Explored</p>
                  </td></tr>
                </table>
              </td>
              <td width="50%" style="padding:0 0 12px 6px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1f;border:1px solid #27272a;border-radius:10px;">
                  <tr><td style="padding:16px 18px;">
                    <p style="margin:0 0 2px;font-size:24px;font-weight:700;color:#A78BFA;">+${d.weekXP}</p>
                    <p style="margin:0;font-size:11px;color:#71717a;">XP Earned</p>
                  </td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding:0 6px 12px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1f;border:1px solid #27272a;border-radius:10px;">
                  <tr><td style="padding:16px 18px;">
                    <p style="margin:0 0 2px;font-size:24px;font-weight:700;color:#F59E0B;">${d.streak > 0 ? `\u{1F525} ${d.streak}` : "0"}</p>
                    <p style="margin:0;font-size:11px;color:#71717a;">Day Streak</p>
                  </td></tr>
                </table>
              </td>
              <td width="50%" style="padding:0 0 12px 6px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1f;border:1px solid #27272a;border-radius:10px;">
                  <tr><td style="padding:16px 18px;">
                    <p style="margin:0 0 2px;font-size:24px;font-weight:700;color:#f4f4f5;">${d.levelEmoji} Lv ${d.level + 1}</p>
                    <p style="margin:0;font-size:11px;color:#71717a;">${d.levelName} &middot; ${d.totalXP.toLocaleString()} XP</p>
                  </td></tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Activity Breakdown -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1f;border:1px solid #27272a;border-radius:10px;margin:0 0 16px;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;">Activity Breakdown</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#f4f4f5;padding:4px 0;">\u{1F441}\u{FE0F} Viewed</td>
                  <td align="right" style="font-size:13px;font-weight:600;color:#f4f4f5;padding:4px 0;">${d.viewCount} ideas</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#f4f4f5;padding:4px 0;">\u{1F4BE} Saved</td>
                  <td align="right" style="font-size:13px;font-weight:600;color:#f4f4f5;padding:4px 0;">${d.saveCount} ideas</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#f4f4f5;padding:4px 0;">\u{1F4E4} Shared</td>
                  <td align="right" style="font-size:13px;font-weight:600;color:#f4f4f5;padding:4px 0;">${d.shareCount} ideas</td>
                </tr>
              </table>
            </td></tr>
          </table>

          ${topIdeaBlock}

          ${savedIdeasBlock}

          ${earlyAccessBlock}

          <!-- Big CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 16px;">
            <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
              <a href="https://idearupt.ai/feed" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">${d.isPro ? "See What's New This Week" : "Continue Exploring"} &rarr;</a>
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
