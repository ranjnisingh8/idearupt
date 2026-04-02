import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ONE-TIME RE-ENGAGEMENT EMAIL
 * For users who signed up 4–30 days ago, had a no-card trial,
 * trial expired, and never received lifecycle emails (cron was broken).
 *
 * Offers them a fresh 7-day Pro trial WITH card ($19/mo after).
 * Only sends once per user (deduped via email_log).
 * Trigger manually once, then delete or leave dormant.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// 7-day trial with card required ($19/mo after)
const CHECKOUT_19_WITH_TRIAL = "https://idearupt.lemonsqueezy.com/checkout/buy/d5f33458-36d9-4b0e-9f2b-2e7c79dfab76";

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

    const now = new Date();
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Target: non-early-adopters, no LS subscription, signed up 4–30 days ago
    const { data: users, error } = await admin
      .from("users")
      .select("id, email, created_at, is_early_adopter, plan_status, subscription_status")
      .is("ls_subscription_id", null)
      .eq("is_early_adopter", false)
      .not("email", "is", null)
      .neq("email_unsubscribed", true)
      .neq("is_banned", true)
      .lte("created_at", fourDaysAgo)
      .gte("created_at", thirtyDaysAgo);

    if (error) {
      console.error("Error fetching users:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch users" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const user of users || []) {
      if (!user.email) { skippedCount++; continue; }

      // Skip if already Pro/paid
      if (user.subscription_status === "pro" || user.subscription_status === "paid") {
        skippedCount++;
        continue;
      }

      // Skip if already got this re-engagement email
      const { data: existing } = await admin
        .from("email_log")
        .select("id")
        .eq("user_id", user.id)
        .eq("email_type", "reengagement_warm")
        .maybeSingle();

      if (existing) { skippedCount++; continue; }

      const firstName = getFirstName(user.email);
      const cUrl = `${CHECKOUT_19_WITH_TRIAL}?checkout[email]=${encodeURIComponent(user.email)}`;
      const daysSinceSignup = Math.floor((now.getTime() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));

      const subject = `${firstName}, we've added new ideas since you joined`;
      const html = buildEmail(firstName, cUrl, daysSinceSignup);

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
            user_id: user.id,
            email: user.email,
            email_type: "reengagement_warm",
            metadata: { days_since_signup: daysSinceSignup },
          });
          sentCount++;
        } else {
          const errText = await res.text();
          console.error(`Failed reengagement to ${user.email}:`, errText);
        }
      } catch (sendErr) {
        console.error(`Error sending to ${user.email}:`, sendErr);
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(
      JSON.stringify({ success: true, processed: users?.length || 0, sent: sentCount, skipped: skippedCount }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Re-engagement email error:", e);
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});

function getFirstName(email: string): string {
  const raw = email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] || "Builder";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function buildEmail(firstName: string, checkoutUrl: string, daysSinceSignup: number): string {
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
        <tr><td style="padding:32px 32px 24px;">

          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;">New ideas just dropped</h1>

          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${firstName}, it's been ${daysSinceSignup} days since you joined Idearupt. Since then, we've been adding <strong style="color:#f4f4f5;">fresh validated problems</strong> every week &mdash; each one scored, analyzed, and ready to build.</p>

          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">You can still browse 3 ideas a day on Free. But if you want the full picture, Pro gives you everything:</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1b2e;border:1px solid #2e2a45;border-radius:10px;margin:0 0 20px;">
            <tr><td style="padding:20px;">
              <p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#d4d4d8;">&bull; <strong style="color:#f4f4f5;">PDF exports</strong> &mdash; download &amp; share any idea report</p>
              <p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#d4d4d8;">&bull; <strong style="color:#f4f4f5;">Original source threads</strong> &mdash; see where every problem was found</p>
              <p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#d4d4d8;">&bull; <strong style="color:#f4f4f5;">Competitor deep dives</strong> &mdash; revenue estimates, user quotes, gaps</p>
              <p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#d4d4d8;">&bull; <strong style="color:#f4f4f5;">Build blueprints</strong> &mdash; week-by-week launch plans</p>
              <p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#d4d4d8;">&bull; <strong style="color:#f4f4f5;">Pain Radar</strong> &mdash; live complaint feed filtered by your niche</p>
              <p style="margin:0;font-size:14px;line-height:1.5;color:#d4d4d8;">&bull; <strong style="color:#f4f4f5;">Sniper Mode Alerts</strong> &mdash; get emailed when problems match your criteria</p>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1625;border:1px solid #8B5CF633;border-radius:10px;margin:0 0 24px;">
            <tr><td style="padding:20px;">
              <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#A78BFA;">&#127873; Try Pro free for 7 days</p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">Full access to everything. No charge until your trial ends. Cancel anytime with one click.</p>
            </td></tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
              <a href="${checkoutUrl}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Start Your Free Trial &rarr;</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-align:center;">7 days free, then $19/mo. Cancel anytime.</p>

          <p style="margin:0;text-align:center;">
            <a href="https://idearupt.ai/feed" style="font-size:14px;color:#8B5CF6;text-decoration:underline;">Or keep exploring on Free</a>
          </p>

        </td></tr>
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
