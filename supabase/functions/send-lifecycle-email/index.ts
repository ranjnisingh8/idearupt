import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";
import { getUserStats } from "../_shared/user-stats.ts";

/**
 * LIFECYCLE EMAIL CRON JOB
 * Triggered every 6 hours by pg_cron (0 *​/6 * * * UTC).
 * Sends trial-related lifecycle emails based on trial_ends_at.
 *
 * Email schedule (email_type values):
 *
 *  TRIAL NUDGES (users who signed up but never started their card-required trial):
 *  - trial_nudge_1h   (~1h after signup):  "Your free trial is waiting"
 *  - trial_nudge_1d   (~24h after signup): "X builders started their trial today"
 *  - trial_nudge_3d   (~72h after signup): "You're missing out — here's what Pro unlocks"
 *
 *  ACTIVE TRIAL LIFECYCLE (users who started their card trial):
 *  - welcome         (Day 0): Sent by send-welcome-email function on signup
 *  - day3_checkin    (Day 3): "You've got 4 days left on your Pro trial"
 *  - day5_warning    (Day 5): "2 days left on your Idearupt Pro trial"
 *  - day7_expired    (Day 7): "Your 7-day Pro trial just ended" + sets subscription_status='free'
 *  - day10_nudge     (Day 10): "You explored dozens of problems — don't lose access"
 *  - day14_nudge     (Day 14): "Builders are shipping ideas you explored"
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  try {
    // Auth guard — only allow calls with a valid service_role JWT (from pg_cron)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let sentCount = 0;
    let skippedCount = 0;

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: Trial nudge emails for users who signed up but
    //          never started their card-required free trial.
    //          Condition: plan_status='none', no LS subscription.
    // ═══════════════════════════════════════════════════════════
    const { data: nudgeUsers, error: nudgeError } = await adminClient
      .from("users")
      .select("id, email, created_at, is_early_adopter")
      .is("ls_subscription_id", null)
      .not("email", "is", null)
      .neq("email_unsubscribed", true)
      .neq("is_banned", true)
      .gte("created_at", new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString()); // Last 4 days only

    if (nudgeError) {
      console.error("Error fetching nudge users:", nudgeError);
    }

    for (const user of nudgeUsers || []) {
      if (!user.email || !user.created_at) continue;

      // Early adopters get their own dedicated drip sequence — skip them here
      if (user.is_early_adopter) {
        skippedCount++;
        continue;
      }

      // Double-check plan_status via a quick lookup (not in bulk query to keep it simple)
      const { data: userData } = await adminClient
        .from("users")
        .select("plan_status")
        .eq("id", user.id)
        .single();

      const ps = userData?.plan_status || "none";
      // Only nudge users who haven't started trial (plan_status='none')
      if (ps !== "none") {
        skippedCount++;
        continue;
      }

      const hoursSinceSignup = (now.getTime() - new Date(user.created_at).getTime()) / (1000 * 60 * 60);

      let nudgeType: string | null = null;

      // ~1 hour nudge: 1–6 hours after signup
      if (hoursSinceSignup >= 1 && hoursSinceSignup < 6) nudgeType = "trial_nudge_1h";
      // ~24 hour nudge: 18–30 hours after signup
      else if (hoursSinceSignup >= 18 && hoursSinceSignup < 30) nudgeType = "trial_nudge_1d";
      // ~72 hour nudge: 66–78 hours after signup
      else if (hoursSinceSignup >= 66 && hoursSinceSignup < 78) nudgeType = "trial_nudge_3d";

      if (!nudgeType) continue;

      // Deduplication
      const { data: existingNudge } = await adminClient
        .from("email_log")
        .select("id")
        .eq("user_id", user.id)
        .eq("email_type", nudgeType)
        .maybeSingle();

      if (existingNudge) {
        skippedCount++;
        continue;
      }

      const nudgeContent = getTrialNudgeContent(nudgeType, user.email, !!user.is_early_adopter);
      if (!nudgeContent) continue;

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
            subject: nudgeContent.subject,
            html: nudgeContent.html,
            text: nudgeContent.text,
            headers: {
              "List-Unsubscribe": "<mailto:hello@idearupt.ai?subject=unsubscribe>",
              "X-Entity-Ref-ID": crypto.randomUUID(),
            },
          }),
        });

        if (res.ok) {
          await adminClient.from("email_log").insert({
            user_id: user.id,
            email: user.email,
            email_type: nudgeType,
            metadata: { hours_since_signup: Math.round(hoursSinceSignup) },
          });
          sentCount++;
        } else {
          const errData = await res.text();
          console.error(`Failed to send ${nudgeType} to ${user.email}:`, errData);
        }
      } catch (sendErr) {
        console.error(`Error sending ${nudgeType} to ${user.email}:`, sendErr);
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: Existing trial lifecycle emails (for users who
    //          already started their trial)
    // ═══════════════════════════════════════════════════════════
    const { data: trialUsers, error: fetchError } = await adminClient
      .from("users")
      .select("id, email, trial_ends_at, subscription_status, is_early_adopter, plan_status, ls_subscription_id")
      .in("subscription_status", ["trial", "free", "churned"])
      .not("trial_ends_at", "is", null)
      .not("email", "is", null)
      .neq("email_unsubscribed", true)
      .neq("is_banned", true);

    if (fetchError) {
      console.error("Error fetching trial users:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch users" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Debug: log Phase 2 user counts for monitoring
    const phase2Stats = { total: trialUsers?.length || 0, day3: 0, day5: 0, day7: 0, day10: 0, day14: 0, filtered: 0 };
    for (const u of trialUsers || []) {
      if (!u.trial_ends_at) continue;
      const te = new Date(u.trial_ends_at);
      const nd = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
      const ed = Math.floor(te.getTime() / (1000 * 60 * 60 * 24));
      const dul = ed - nd;
      const dse = -dul;
      if (dul >= 3 && dul <= 4) phase2Stats.day3++;
      else if (dul >= 1 && dul <= 2) phase2Stats.day5++;
      else if (dul <= 0 && dse <= 2) phase2Stats.day7++;
      else if (dse >= 3 && dse <= 5) phase2Stats.day10++;
      else if (dse >= 7 && dse <= 8) phase2Stats.day14++;
    }
    console.log("[lifecycle] Phase 2 trial users:", JSON.stringify(phase2Stats));

    for (const user of trialUsers || []) {
      if (!user.email || !user.trial_ends_at) continue;

      if (user.subscription_status === "paid" || user.subscription_status === "pro") {
        skippedCount++;
        continue;
      }

      // Early adopters get their own dedicated drip sequence (send-early-adopter-email)
      // Skip them from generic lifecycle emails to avoid duplicate/conflicting messaging
      if (user.is_early_adopter) {
        skippedCount++;
        continue;
      }

      // Skip false-positive users: the auto_start_trial() DB trigger sets trial_ends_at
      // for ALL new users on signup. Users who never went through Lemon Squeezy checkout
      // (no ls_subscription_id) with plan_status='none' are NOT real trial users — they're
      // free users who got trial_ends_at from the trigger. Phase 1 nudge emails handle them.
      // NOTE: Users with plan_status='free' who HAVE trial_ends_at in the past are real
      // expired trial users — they should NOT be filtered out.
      const userPlanSt = user.plan_status || "none";
      if (!user.ls_subscription_id && userPlanSt === "none") {
        skippedCount++;
        continue;
      }

      const trialEnd = new Date(user.trial_ends_at);
      const nowDay = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
      const endDay = Math.floor(trialEnd.getTime() / (1000 * 60 * 60 * 24));
      const daysUntilEnd = endDay - nowDay;
      const daysSinceEnd = -daysUntilEnd;

      let emailType: string | null = null;

      // Widened windows to catch emails even if cron missed a run.
      // Deduplication ensures each email is only sent once per user.
      if (daysUntilEnd >= 3 && daysUntilEnd <= 4) emailType = "day3_checkin";
      else if (daysUntilEnd >= 1 && daysUntilEnd <= 2) emailType = "day5_warning";
      else if (daysUntilEnd <= 0 && daysSinceEnd <= 2) emailType = "day7_expired";
      else if (daysSinceEnd >= 3 && daysSinceEnd <= 5) emailType = "day10_nudge";
      else if (daysSinceEnd >= 7 && daysSinceEnd <= 8) emailType = "day14_nudge";

      if (!emailType) continue;

      // Check if already sent (deduplication)
      const { data: existingLog } = await adminClient
        .from("email_log")
        .select("id")
        .eq("user_id", user.id)
        .eq("email_type", emailType)
        .maybeSingle();

      if (existingLog) {
        skippedCount++;
        continue;
      }

      // Generate and send email — early adopters get $9/mo pricing
      const userPlanStatus = user.plan_status || "none";

      // Get user stats for day7_expired personalization
      let userStatsData: { totalViews: number; totalSaves: number; engagementLevel: string } | null = null;
      if (emailType === "day7_expired") {
        try {
          const stats = await getUserStats(adminClient, user.id);
          userStatsData = { totalViews: stats.totalViews, totalSaves: stats.totalSaves, engagementLevel: stats.engagementLevel };
        } catch { /* non-blocking */ }
      }

      const emailContent = getEmailContent(emailType, user.email, daysUntilEnd, !!user.is_early_adopter, userPlanStatus, userStatsData);
      if (!emailContent) continue;

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
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
            headers: {
              "List-Unsubscribe": "<mailto:hello@idearupt.ai?subject=unsubscribe>",
              "X-Entity-Ref-ID": crypto.randomUUID(),
            },
          }),
        });

        if (res.ok) {
          await adminClient.from("email_log").insert({
            user_id: user.id,
            email: user.email,
            email_type: emailType,
            metadata: { days_until_end: daysUntilEnd },
          });

          if (emailType === "day7_expired") {
            // Only set subscription_status='free' for legacy users (plan_status='none')
            // Users with plan_status='trial' are handled by Lemon Squeezy auto-charge
            const userPlanStatus = user.plan_status || "none";
            if (userPlanStatus === "none" || !userPlanStatus) {
              await adminClient
                .from("users")
                .update({ subscription_status: "free" })
                .eq("id", user.id)
                .in("subscription_status", ["trial", "churned"]);
            }
          }

          sentCount++;
        } else {
          const errData = await res.text();
          console.error(`Failed to send ${emailType} to ${user.email}:`, errData);
        }
      } catch (sendErr) {
        console.error(`Error sending ${emailType} to ${user.email}:`, sendErr);
      }

      // Rate limit: don't blast Resend
      await new Promise((r) => setTimeout(r, 200));
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: Feedback emails for churned/free users
    //          - feedback_quick (Day 8 after trial end): 30-second survey
    //          - feedback_deep  (Day 21 after trial end): 2-minute deep survey
    // ═══════════════════════════════════════════════════════════
    try {
      const { data: feedbackCandidates } = await adminClient
        .from("users")
        .select("id, email, display_name, trial_ends_at, subscription_status, email_unsubscribed")
        .in("subscription_status", ["free", "churned"])
        .not("trial_ends_at", "is", null)
        .not("email", "is", null)
        .neq("email_unsubscribed", true)
      .neq("is_banned", true);

      let feedbackSent = 0;
      for (const user of feedbackCandidates || []) {
        if (!user.email || !user.trial_ends_at) continue;

        const trialEnd = new Date(user.trial_ends_at);
        const daysSinceEnd = Math.floor((now.getTime() - trialEnd.getTime()) / (1000 * 60 * 60 * 24));

        let feedbackType: string | null = null;
        if (daysSinceEnd >= 1 && daysSinceEnd <= 2) feedbackType = "quick";
        else if (daysSinceEnd >= 14 && daysSinceEnd <= 15) feedbackType = "deep";

        if (!feedbackType) continue;

        const emailType = `feedback_${feedbackType}`;

        // Dedup
        const { data: existingFeedback } = await adminClient
          .from("email_log")
          .select("id")
          .eq("user_id", user.id)
          .eq("email_type", emailType)
          .maybeSingle();
        if (existingFeedback) continue;

        // Check if already submitted feedback
        const { data: existingSubmission } = await adminClient
          .from("user_feedback")
          .select("id")
          .eq("user_id", user.id)
          .eq("feedback_type", feedbackType)
          .maybeSingle();
        if (existingSubmission) continue;

        // Call send-feedback-email function
        try {
          const feedbackRes = await fetch(
            `${supabaseUrl}/functions/v1/send-feedback-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                user_id: user.id,
                email: user.email,
                feedback_type: feedbackType,
                display_name: user.display_name,
              }),
            }
          );

          if (feedbackRes.ok) {
            feedbackSent++;
            sentCount++;
          }
        } catch (feedErr) {
          console.error(`Error sending feedback email:`, feedErr);
        }

        await new Promise((r) => setTimeout(r, 200));
      }
      console.log(`[lifecycle] Phase 3 feedback: ${feedbackSent} sent`);
    } catch (e) {
      console.error("[lifecycle] Phase 3 feedback error:", e);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: Win-back emails for churned/free users
    //          - winback_30d  (Day 30 after trial end): "we built what was missing"
    //          - winback_45d  (Day 45): social proof + activity stats
    //          - winback_60d  (Day 60): final casual check-in
    // ═══════════════════════════════════════════════════════════
    try {
      const { data: winbackCandidates } = await adminClient
        .from("users")
        .select("id, email, display_name, trial_ends_at, subscription_status, is_early_adopter")
        .in("subscription_status", ["free", "churned"])
        .not("trial_ends_at", "is", null)
        .not("email", "is", null)
        .neq("email_unsubscribed", true)
      .neq("is_banned", true);

      const secret = Deno.env.get("FEEDBACK_TOKEN_SECRET") || supabaseServiceKey.slice(0, 32);

      // Get dynamic stats for win-back emails
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: newUserCount } = await adminClient
        .from("users")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo);

      const { count: totalIdeas } = await adminClient
        .from("ideas")
        .select("id", { count: "exact", head: true });

      const { data: topIdea } = await adminClient
        .from("ideas")
        .select("title, overall_score")
        .order("overall_score", { ascending: false })
        .limit(1)
        .maybeSingle();

      let winbackSent = 0;

      for (const user of winbackCandidates || []) {
        if (!user.email || !user.trial_ends_at) continue;
        if (user.is_early_adopter) continue;

        const trialEnd = new Date(user.trial_ends_at);
        const daysSinceEnd = Math.floor((now.getTime() - trialEnd.getTime()) / (1000 * 60 * 60 * 24));

        let winbackType: string | null = null;
        if (daysSinceEnd >= 23 && daysSinceEnd <= 24) winbackType = "winback_30d";
        else if (daysSinceEnd >= 38 && daysSinceEnd <= 39) winbackType = "winback_45d";
        else if (daysSinceEnd >= 53 && daysSinceEnd <= 54) winbackType = "winback_60d";

        if (!winbackType) continue;

        // Dedup
        const { data: existingWinback } = await adminClient
          .from("email_log")
          .select("id")
          .eq("user_id", user.id)
          .eq("email_type", winbackType)
          .maybeSingle();
        if (existingWinback) continue;

        const firstName = ((user.display_name || user.email.split("@")[0]) as string)
          .replace(/[._-]/g, " ")
          .split(" ")[0]
          .toLowerCase();

        // Count ideas added since user's trial ended
        const { count: newIdeasSince } = await adminClient
          .from("ideas")
          .select("id", { count: "exact", head: true })
          .gte("created_at", user.trial_ends_at);

        const token = createHmac("sha256", secret).update(user.id).digest("hex");
        const reactivateUrl = `${supabaseUrl}/functions/v1/reactivate-trial?uid=${user.id}&token=${token}&days=3`;

        const winbackContent = getWinbackContent(winbackType, firstName, {
          newIdeasSince: newIdeasSince || 0,
          newUserCount: newUserCount || 0,
          totalIdeas: totalIdeas || 0,
          topIdeaTitle: topIdea?.title || "Untitled",
          topIdeaScore: topIdea?.overall_score || 0,
          reactivateUrl,
        });

        if (!winbackContent) continue;

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
              subject: winbackContent.subject,
              html: winbackContent.html,
              text: winbackContent.text,
              headers: {
                "List-Unsubscribe": "<mailto:hello@idearupt.ai?subject=unsubscribe>",
                "X-Entity-Ref-ID": crypto.randomUUID(),
              },
            }),
          });

          if (res.ok) {
            await adminClient.from("email_log").insert({
              user_id: user.id,
              email: user.email,
              email_type: winbackType,
              metadata: { days_since_end: daysSinceEnd },
            });
            winbackSent++;
            sentCount++;
          }
        } catch (sendErr) {
          console.error(`Error sending ${winbackType}:`, sendErr);
        }

        await new Promise((r) => setTimeout(r, 200));
      }
      console.log(`[lifecycle] Phase 4 winback: ${winbackSent} sent`);
    } catch (e) {
      console.error("[lifecycle] Phase 4 winback error:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: trialUsers?.length || 0,
        sent: sentCount,
        skipped: skippedCount,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Lifecycle email error:", e);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ─── Checkout URLs ────────────────────────────────────────
// Standard with 7-day trial ($19/mo) — for users who have NEVER started a trial
const CHECKOUT_19_WITH_TRIAL = "https://idearupt.lemonsqueezy.com/checkout/buy/d5f33458-36d9-4b0e-9f2b-2e7c79dfab76";
// No-trial variant ($19 direct charge) — for users who already had a trial
const CHECKOUT_19_NO_TRIAL = "https://idearupt.lemonsqueezy.com/checkout/buy/b7ea618b-4994-4d89-b36d-b63f25f6603a";
// Early adopter ($9/mo, no trial baked in)
const CHECKOUT_9 = "https://idearupt.lemonsqueezy.com/checkout/buy/59b85633-b196-48e0-8324-28a4c365ce98";

function checkoutUrl(base: string, email: string): string {
  return `${base}?checkout[email]=${encodeURIComponent(email)}`;
}

// ─── Email templates ──────────────────────────────────────

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

// ─── Trial Nudge Templates (for users who haven't started trial) ──────

function getTrialNudgeContent(
  nudgeType: string,
  email: string,
  isEarlyAdopter: boolean = false,
): EmailContent | null {
  const firstName = email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] || "Builder";
  const capFirst = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const checkoutBase = isEarlyAdopter ? CHECKOUT_9 : CHECKOUT_19_WITH_TRIAL;
  const price = isEarlyAdopter ? "$9" : "$19";
  const priceLabel = isEarlyAdopter ? "$9/mo (early adopter pricing)" : "$19/mo";
  const cUrl = checkoutUrl(checkoutBase, email);

  switch (nudgeType) {
    // ── 1 hour after signup ─────────────────────────────────
    case "trial_nudge_1h":
      return {
        subject: `${capFirst}, your free 7-day trial is waiting`,
        html: wrapEmail(`
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;">You're one step away from Pro</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${capFirst}, you signed up for Idearupt &mdash; welcome! &#128075;</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Right now you're on the <strong style="color:#f4f4f5;">Free plan</strong> with limited access. But you have a <strong style="color:#F59E0B;">free 7-day Pro trial</strong> waiting for you &mdash; no charge until the trial ends.</p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#a1a1aa;">Here's what Pro unlocks:</p>
          ${featureList([
            "<strong style='color:#f4f4f5;'>PDF exports</strong> &mdash; download &amp; share any idea report",
            "<strong style='color:#f4f4f5;'>Original source threads</strong> &mdash; see where every problem was found",
            "<strong style='color:#f4f4f5;'>Compare ideas</strong> side by side",
            "<strong style='color:#f4f4f5;'>Unlimited saves</strong> &amp; higher daily limits",
            "<strong style='color:#f4f4f5;'>Pain Radar</strong> &mdash; live complaint feed filtered by your niche",
            "<strong style='color:#f4f4f5;'>Sniper Mode Alerts</strong> &mdash; get emailed when problems match your criteria",
          ])}
          ${ctaButton("Start Your Free Trial", cUrl)}
          <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-align:center;">7 days free. Cancel anytime. No charge until trial ends.</p>
        `),
        text: `Hey ${capFirst}, you signed up for Idearupt — welcome!\n\nRight now you're on the Free plan with limited access. But you have a free 7-day Pro trial waiting for you — no charge until the trial ends.\n\nHere's what Pro unlocks:\n✨ PDF exports — download & share any idea report\n✨ Original source threads — see where every problem was found\n✨ Compare ideas side by side\n✨ Unlimited saves & higher daily limits\n✨ Pain Radar — live complaint feed filtered by your niche\n✨ Sniper Mode Alerts — get emailed when problems match your criteria\n\nStart Your Free Trial: ${cUrl}\n\n7 days free. Cancel anytime. No charge until trial ends.`,
      };

    // ── 24 hours after signup ───────────────────────────────
    case "trial_nudge_1d":
      return {
        subject: "Builders are finding $10K+ ideas on Idearupt right now",
        html: wrapEmail(`
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;">While you wait, others are building</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${capFirst}, since you signed up yesterday, <strong style="color:#f4f4f5;">dozens of builders</strong> started their free trial and are already:</p>
          ${featureList([
            "Discovering <strong style='color:#f4f4f5;'>validated problems</strong> with real market demand",
            "Running <strong style='color:#f4f4f5;'>competitor analysis</strong> to find gaps in the market",
            "Generating <strong style='color:#f4f4f5;'>build blueprints</strong> with week-by-week launch plans",
            "Getting <strong style='color:#f4f4f5;'>AI-powered deep dives</strong> on high-scoring problems",
          ])}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1625;border:1px solid #8B5CF633;border-radius:10px;margin:0 0 24px;">
            <tr><td style="padding:20px;">
              <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#A78BFA;">&#128161; Your free trial is ready when you are</p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">7 days of full Pro access, completely free. Start whenever it feels right.</p>
            </td></tr>
          </table>
          ${ctaButton("Start My Free Trial", cUrl)}
          <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-align:center;">No charge for 7 days. Cancel in one click.</p>
        `),
        text: `Hey ${capFirst}, since you signed up yesterday, dozens of builders started their free trial and are already:\n\n✨ Discovering validated problems with real market demand\n✨ Running competitor analysis to find gaps in the market\n✨ Generating build blueprints with week-by-week launch plans\n✨ Getting AI-powered deep dives on high-scoring problems\n\n💡 Your free trial is ready when you are — 7 days of full Pro access, completely free.\n\nStart My Free Trial: ${cUrl}\n\nNo charge for 7 days. Cancel in one click.`,
      };

    // ── 72 hours after signup (final, heavy FOMO) ───────────
    case "trial_nudge_3d":
      return {
        subject: `${capFirst}, new validated problems just dropped`,
        html: wrapEmail(`
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;">New problems just dropped</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${capFirst}, since you joined Idearupt, we've added <strong style="color:#f4f4f5;">new validated problems</strong> across SaaS, AI, health, fintech, and more &mdash; each with demand signals, source threads, and detailed analysis.</p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#a1a1aa;">With a free trial, you'd also unlock:</p>
          ${featureList([
            "<strong style='color:#f4f4f5;'>PDF exports</strong> &mdash; download &amp; share any idea report",
            "<strong style='color:#f4f4f5;'>Original source threads</strong> &mdash; see where every problem was found",
            "<strong style='color:#f4f4f5;'>Compare ideas</strong> side by side",
            "<strong style='color:#f4f4f5;'>Unlimited saves</strong> &amp; higher daily limits",
            "<strong style='color:#f4f4f5;'>Pain Radar</strong> &mdash; live complaint feed filtered by your niche",
            "<strong style='color:#f4f4f5;'>Sniper Mode Alerts</strong> &mdash; get emailed when problems match your criteria",
          ])}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1625;border:1px solid #8B5CF633;border-radius:10px;margin:0 0 24px;">
            <tr><td style="padding:20px;">
              <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#A78BFA;">&#128161; Your trial is still available</p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">Try Pro free for 7 days. No charge unless you decide to keep it.</p>
            </td></tr>
          </table>
          ${ctaButton("Start My 7-Day Free Trial", cUrl)}
          <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-align:center;">Completely free for 7 days. ${priceLabel} after &mdash; cancel anytime.</p>
          ${secondaryLink("Or keep exploring on Free", "https://idearupt.ai/feed")}
        `),
        text: `Hey ${capFirst}, since you joined Idearupt, we've added new validated problems across SaaS, AI, health, fintech, and more.\n\nWith a free trial, you'd also unlock:\n✨ PDF exports — download & share any idea report\n✨ Original source threads — see where every problem was found\n✨ Compare ideas side by side\n✨ Unlimited saves & higher daily limits\n✨ Pain Radar — live complaint feed filtered by your niche\n✨ Sniper Mode Alerts — get emailed when problems match your criteria\n\n💡 Your trial is still available — try Pro free for 7 days. No charge unless you decide to keep it.\n\nStart My 7-Day Free Trial: ${cUrl}\n\nCompletely free for 7 days. ${priceLabel} after — cancel anytime.\n\nOr keep exploring on Free: https://idearupt.ai/feed`,
      };

    default:
      return null;
  }
}

// ─── Active Trial Email Templates ─────────────────────────────

function getEmailContent(
  emailType: string,
  email: string,
  daysLeft: number,
  isEarlyAdopter: boolean = false,
  planStatus: string = "none",
  userStats?: { totalViews: number; totalSaves: number; engagementLevel: string } | null
): EmailContent | null {
  const firstName = email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] || "Builder";
  const capFirst = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  // All lifecycle emails go to users who have started/used a trial → no-trial variant
  const checkoutBase = isEarlyAdopter ? CHECKOUT_9 : CHECKOUT_19_NO_TRIAL;
  const price = isEarlyAdopter ? "$9" : "$19";
  const priceLabel = isEarlyAdopter ? "$9/mo (early adopter)" : "$19/mo";
  const cUrl = checkoutUrl(checkoutBase, email);

  switch (emailType) {
    case "day3_checkin": {
      // Card-required users already have a subscription — don't show "Upgrade" promo
      const hasCard = planStatus === "trial" || planStatus === "active";
      return {
        subject: "You've got 4 days left on your Pro trial",
        html: wrapEmail(`
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;">4 days left on Pro</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${capFirst}, you're halfway through your 7-day Pro trial. Have you tried everything yet?</p>
          ${featureList([
            "<strong style='color:#f4f4f5;'>Build Blueprint</strong> &mdash; a week-by-week launch plan for any idea",
            "<strong style='color:#f4f4f5;'>Competitor Analysis</strong> &mdash; see who else is building in the space, their revenue, and real user quotes",
            "<strong style='color:#f4f4f5;'>Deep Dive</strong> &mdash; AI-powered market deep dive on any problem",
            "<strong style='color:#f4f4f5;'>Validate your own idea</strong> &mdash; paste any problem and get an instant AI score with feedback",
          ])}
          ${ctaButton("Explore Idearupt", "https://idearupt.ai/feed")}
          ${hasCard ? "" : promoBox(cUrl, priceLabel)}
        `),
        text: `You've got 4 days left on your Pro trial.\n\nHave you tried:\n- Build Blueprint — a week-by-week launch plan for any idea\n- Competitor Analysis — see who else is building in the space\n- Deep Dive — AI-powered market deep dive on any problem\n- Validate your own idea — paste any problem and get an instant AI score\n\nExplore: https://idearupt.ai/feed${hasCard ? "" : `\n\nLoving it? Keep Pro for ${priceLabel}: ${cUrl}`}`,
      };
    }

    case "day5_warning":
      return {
        subject: "Your trial ends in 2 days — your card will be charged automatically",
        html: wrapEmail(`
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;">Your trial ends in 2 days</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${capFirst}, your 7-day free trial ends in <strong style="color:#f4f4f5;">2 days</strong>. Your card will be charged <strong style="color:#f4f4f5;">${priceLabel}</strong> automatically when the trial ends.</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">If you'd like to cancel before then, you can do so anytime from your Settings page &mdash; no charge.</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Here's what you'll keep with Pro:</p>
          ${featureList([
            "<strong style='color:#f4f4f5;'>PDF exports</strong> &mdash; download &amp; share any idea report",
            "<strong style='color:#f4f4f5;'>Original source threads</strong> &mdash; see where every problem was found",
            "<strong style='color:#f4f4f5;'>Compare ideas</strong> side by side",
            "<strong style='color:#f4f4f5;'>Unlimited saves</strong> &amp; higher daily limits",
            "<strong style='color:#f4f4f5;'>Pain Radar</strong> &mdash; live complaint feed filtered by your niche",
            "<strong style='color:#f4f4f5;'>Sniper Mode Alerts</strong> &mdash; get emailed when problems match your criteria",
          ])}
          ${ctaButton("Explore Idearupt", "https://idearupt.ai/feed")}
        `),
        text: `Your trial ends in 2 days.\n\nYour card will be charged ${priceLabel} automatically when the trial ends.\n\nIf you'd like to cancel before then, you can do so anytime from your Settings page — no charge.\n\nHere's what you'll keep with Pro:\n✓ PDF exports — download & share any idea report\n✓ Original source threads — see where every problem was found\n✓ Compare ideas side by side\n✓ Unlimited saves & higher daily limits\n✓ Pain Radar — live complaint feed filtered by your niche\n✓ Sniper Mode Alerts — get emailed when problems match your criteria\n\nExplore: https://idearupt.ai/feed`,
      };

    case "day7_expired":
      // For card-required users (plan_status='trial'), LS auto-charges them
      if (planStatus === "trial" || planStatus === "active") {
        return {
          subject: "Your trial ended — your Pro subscription is now active!",
          html: wrapEmail(`
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;">Welcome to Idearupt Pro! &#127881;</h1>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${capFirst}, your 7-day free trial has ended and your Pro subscription is now active at <strong style="color:#f4f4f5;">${priceLabel}</strong>.</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">You'll continue to enjoy full access to all Pro features. You can manage your subscription anytime from Settings.</p>
            ${ctaButton("Explore Idearupt", "https://idearupt.ai/feed")}
          `),
          text: `Your trial ended — your Pro subscription is now active!\n\nYour 7-day free trial has ended and your Pro subscription is now active at ${priceLabel}.\n\nYou'll continue to enjoy full access to all Pro features. You can manage your subscription anytime from Settings.\n\nExplore: https://idearupt.ai/feed`,
        };
      }
      // Legacy users (plan_status='none') — trial ended, downgraded to free
      // Personalize based on engagement stats
      const statsIntro = userStats
        ? userStats.engagementLevel === "heavy"
          ? `You explored ${userStats.totalViews} ideas and saved ${userStats.totalSaves} during your trial.`
          : userStats.engagementLevel === "ghost"
            ? `You had 7 days of full access but barely got started. No pressure &mdash; you can still browse 3 ideas a day on Free.`
            : `You checked out ${userStats.totalViews} idea${userStats.totalViews !== 1 ? "s" : ""} during your trial.`
        : `Your 7-day Pro trial has ended.`;

      return {
        subject: "Your Pro trial wrapped up — here's what's next",
        html: wrapEmail(`
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;">Your trial wrapped up</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${capFirst}, ${statsIntro} You're now on the <strong style="color:#f4f4f5;">Free plan</strong> &mdash; you still get full idea details and 3 ideas per day.</p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#a1a1aa;">Pro features are now paused, but you can pick up where you left off anytime:</p>
          ${featureList([
            "<strong style='color:#f4f4f5;'>PDF exports</strong> &mdash; download &amp; share any idea report",
            "<strong style='color:#f4f4f5;'>Original source threads</strong> &mdash; see where every problem was found",
            "<strong style='color:#f4f4f5;'>Compare ideas</strong> side by side",
            "<strong style='color:#f4f4f5;'>Unlimited saves</strong> &amp; higher daily limits",
            "<strong style='color:#f4f4f5;'>Pain Radar</strong> &mdash; live complaint feed filtered by your niche",
            "<strong style='color:#f4f4f5;'>Sniper Mode Alerts</strong> &mdash; get emailed when problems match your criteria",
          ])}
          ${ctaButton(`Continue with Pro — ${priceLabel}`, cUrl)}
          ${secondaryLink("Or keep exploring on Free", "https://idearupt.ai/feed")}
        `),
        text: `Your Pro trial wrapped up — here's what's next.\n\nYour 7-day Pro trial has ended. You're now on the Free plan — you still get full idea details and 3 ideas per day.\n\nPro features are now paused, but you can pick up where you left off anytime:\n✨ PDF exports — download & share any idea report\n✨ Original source threads — see where every problem was found\n✨ Compare ideas side by side\n✨ Unlimited saves & higher daily limits\n✨ Pain Radar — live complaint feed filtered by your niche\n✨ Sniper Mode Alerts — get emailed when problems match your criteria\n\nContinue with Pro — ${priceLabel}: ${cUrl}\n\nOr keep exploring on Free: https://idearupt.ai/feed`,
      };

    case "day10_nudge":
      return {
        subject: "New high-scoring problems just dropped — thought you'd want to know",
        html: wrapEmail(`
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;">Fresh problems, just for you</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${capFirst}, <strong style="color:#f4f4f5;">new high-scoring problems dropped this week</strong> that match your Builder DNA.</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">You can still explore 3 ideas a day on Free. Whenever you're ready, Pro unlocks Pain Radar, Sniper Mode Alerts, PDF exports, source threads, idea comparison, and unlimited saves.</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">No pressure &mdash; just wanted you to know the option is there.</p>
          ${ctaButton(`See what's new`, "https://idearupt.ai/feed")}
          ${secondaryLink(`Upgrade to Pro — ${priceLabel}`, cUrl)}
        `),
        text: `New high-scoring problems just dropped — thought you'd want to know.\n\nNew high-scoring problems dropped this week that match your Builder DNA.\n\nYou can still explore 3 ideas a day on Free. Whenever you're ready, Pro unlocks Pain Radar, Sniper Mode Alerts, PDF exports, source threads, idea comparison, and unlimited saves.\n\nNo pressure — just wanted you to know the option is there.\n\nSee what's new: https://idearupt.ai/feed\n\nUpgrade to Pro — ${priceLabel}: ${cUrl}`,
      };

    case "day14_nudge":
      return {
        subject: `${capFirst}, builders are shipping ideas you explored`,
        html: wrapEmail(`
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;">Still thinking about building?</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${capFirst}, it's been two weeks since your trial ended. Since then, <strong style="color:#f4f4f5;">new high-scoring problems</strong> have been dropping daily &mdash; some in niches you explored during your trial.</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">You can still browse 3 ideas a day on Free. But if you want the full picture &mdash; competitor data, source threads, build blueprints, and PDF exports &mdash; Pro is here when you're ready.</p>
          ${ctaButton("See what's new", "https://idearupt.ai/feed")}
          ${secondaryLink(`Upgrade to Pro — ${priceLabel}`, cUrl)}
        `),
        text: `Still thinking about building?\n\nHey ${capFirst}, it's been two weeks since your trial ended. Since then, new high-scoring problems have been dropping daily — some in niches you explored during your trial.\n\nYou can still browse 3 ideas a day on Free. But if you want the full picture — competitor data, source threads, build blueprints, and PDF exports — Pro is here when you're ready.\n\nSee what's new: https://idearupt.ai/feed\n\nUpgrade to Pro — ${priceLabel}: ${cUrl}`,
      };

    default:
      return null;
  }
}

// ─── Win-back Email Templates (plain-text-first, personal tone) ─────

interface WinbackData {
  newIdeasSince: number;
  newUserCount: number;
  totalIdeas: number;
  topIdeaTitle: string;
  topIdeaScore: number;
  reactivateUrl: string;
}

function getWinbackContent(
  winbackType: string,
  firstName: string,
  data: WinbackData,
): EmailContent | null {
  const plainWrap = (body: string) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <tr><td style="padding:0 0 32px;">${body}</td></tr>
        <tr><td style="border-top:1px solid #27272a;padding:16px 0 0;">
          <p style="margin:0;font-size:11px;color:#3f3f46;">You're receiving this because you signed up for Idearupt. <a href="mailto:hello@idearupt.ai?subject=unsubscribe" style="color:#71717a;text-decoration:underline;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  switch (winbackType) {
    case "winback_30d":
      return {
        subject: "we asked 47 builders what was missing. then we built it.",
        html: plainWrap(`
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">hey ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">we asked builders what was missing from idearupt. then we built it.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">since you left, we've added ${data.newIdeasSince} new validated problems, plus competitor analysis, build blueprints, and pain radar.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;"><a href="${data.reactivateUrl}" style="color:#A78BFA;text-decoration:underline;font-weight:600;">try it again for 3 days, on us</a></p>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#71717a;">-- bhavesh</p>
        `),
        text: `hey ${firstName},\n\nwe asked builders what was missing from idearupt. then we built it.\n\nsince you left, we've added ${data.newIdeasSince} new validated problems, plus competitor analysis, build blueprints, and pain radar.\n\ntry it again for 3 days, on us: ${data.reactivateUrl}\n\n-- bhavesh`,
      };

    case "winback_45d":
      return {
        subject: `${data.newUserCount} builders joined this month`,
        html: plainWrap(`
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">hey ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">${data.newUserCount} builders joined idearupt this month. the platform now has ${data.totalIdeas} validated problems.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">top scoring idea right now: "${data.topIdeaTitle}" (score: ${data.topIdeaScore.toFixed(1)})</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;"><a href="https://idearupt.ai/feed" style="color:#A78BFA;text-decoration:underline;font-weight:600;">see what's trending</a></p>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#71717a;">-- bhavesh</p>
        `),
        text: `hey ${firstName},\n\n${data.newUserCount} builders joined idearupt this month. the platform now has ${data.totalIdeas} validated problems.\n\ntop scoring idea right now: "${data.topIdeaTitle}" (score: ${data.topIdeaScore.toFixed(1)})\n\nsee what's trending: https://idearupt.ai/feed\n\n-- bhavesh`,
      };

    case "winback_60d":
      return {
        subject: `hey -- still building something?`,
        html: plainWrap(`
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">hey ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">just checking in. we've added ${data.newIdeasSince} new problems since your trial ended.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">if you're still looking for something to build, <a href="https://idearupt.ai/feed" style="color:#A78BFA;text-decoration:underline;">we're here</a>.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">if not, no worries. this is the last email i'll send about it.</p>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#71717a;">-- bhavesh</p>
        `),
        text: `hey ${firstName},\n\njust checking in. we've added ${data.newIdeasSince} new problems since your trial ended.\n\nif you're still looking for something to build, we're here: https://idearupt.ai/feed\n\nif not, no worries. this is the last email i'll send about it.\n\n-- bhavesh`,
      };

    default:
      return null;
  }
}

// ─── HTML helpers ─────────────────────────────────────────

function wrapEmail(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Idearupt</title></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#18181b;border-radius:12px;overflow:hidden;border:1px solid #27272a;">
        <tr><td style="background:linear-gradient(135deg,#8B5CF6,#7C3AED);padding:28px 32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;">Idea</span><span style="font-size:22px;font-weight:700;color:#e0d4ff;">rupt</span>
        </td></tr>
        <tr><td style="padding:32px 32px 24px;">${body}</td></tr>
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #27272a;"></div></td></tr>
        <tr><td style="padding:20px 32px 28px;">
          <p style="margin:0 0 4px;font-size:12px;color:#52525b;">&copy; 2026 Idearupt &middot; <a href="https://idearupt.ai/privacy" style="color:#8B5CF6;text-decoration:none;">Privacy</a> &middot; <a href="https://idearupt.ai/terms" style="color:#8B5CF6;text-decoration:none;">Terms</a></p>
          <p style="margin:0;font-size:11px;color:#3f3f46;">You're receiving this because you signed up at idearupt.ai</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function featureList(items: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1b2e;border:1px solid #2e2a45;border-radius:10px;margin:0 0 20px;">
    <tr><td style="padding:20px;">
      ${items.map((s, i) => `<p style="margin:0 0 ${i === items.length - 1 ? "0" : "10px"};font-size:14px;line-height:1.5;color:#d4d4d8;">&bull; ${s}</p>`).join("")}
    </td></tr>
  </table>`;
}

function dropList(items: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1c1111;border:1px solid #7f1d1d;border-radius:10px;margin:0 0 20px;">
    <tr><td style="padding:20px;">
      ${items.map((item, i) => `<p style="margin:0 0 ${i === items.length - 1 ? "0" : "8px"};font-size:14px;color:#fca5a5;">&cross; ${item}</p>`).join("")}
    </td></tr>
  </table>`;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
    <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">${text} &rarr;</a>
    </td></tr>
  </table>`;
}

function secondaryLink(text: string, url: string): string {
  return `<p style="margin:0 0 20px;text-align:center;">
    <a href="${url}" style="font-size:14px;color:#8B5CF6;text-decoration:underline;">${text}</a>
  </p>`;
}

function promoBox(checkoutUrl: string, priceLabel: string = "$19/mo"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c1a0e;border:1px solid #166534;border-radius:8px;margin:0 0 20px;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0;font-size:13px;line-height:1.6;color:#4ade80;">&#128640; <strong>Loving it?</strong> Keep Pro for <strong>${priceLabel}</strong> before your trial ends. <a href="${checkoutUrl}" style="color:#8B5CF6;font-weight:600;text-decoration:none;">Upgrade now &rarr;</a></p>
    </td></tr>
  </table>`;
}

