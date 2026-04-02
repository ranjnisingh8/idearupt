import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

/**
 * SEND-FEEDBACK-EMAIL — sends a personalized feedback request email
 * with a signed link to the /feedback page.
 *
 * Called internally by send-lifecycle-email cron (Phase 3).
 * POST { user_id, email, feedback_type, display_name }
 * Requires Authorization: Bearer <service_role_key>
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Auth guard — service role only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { user_id, email, feedback_type, display_name } = body;

    if (!user_id || !email || !feedback_type) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate HMAC-signed token
    const secret = Deno.env.get("FEEDBACK_TOKEN_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(0, 32);
    const token = createHmac("sha256", secret).update(user_id).digest("hex");

    const feedbackUrl = `https://idearupt.ai/feedback?type=${feedback_type}&uid=${user_id}&token=${token}`;

    const firstName = (display_name || email.split("@")[0]).replace(/[._-]/g, " ").split(" ")[0] || "builder";
    const capFirst = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

    let subject: string;
    let htmlBody: string;
    let textBody: string;
    const rewardDays = feedback_type === "deep" ? 7 : 3;

    if (feedback_type === "quick") {
      subject = `${capFirst.toLowerCase()}, quick question (30 seconds)`;
      htmlBody = buildPlainEmail(`
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">hey ${capFirst.toLowerCase()},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">quick one — you tried idearupt and didn't stick around. totally fair.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">if you tell me why (takes 30 seconds), i'll give you <strong style="color:#f4f4f5;">${rewardDays} days of pro access</strong> as a thank you.</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#d4d4d8;"><a href="${feedbackUrl}" style="color:#A78BFA;text-decoration:underline;font-weight:600;">take the 30-second survey →</a></p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#71717a;">— bhavesh</p>
      `);
      textBody = `hey ${capFirst.toLowerCase()},\n\nquick one — you tried idearupt and didn't stick around. totally fair.\n\nif you tell me why (takes 30 seconds), i'll give you ${rewardDays} days of pro access as a thank you.\n\ntake the 30-second survey: ${feedbackUrl}\n\n— bhavesh`;
    } else {
      subject = `${capFirst.toLowerCase()}, help me build something better (2 min)`;
      htmlBody = buildPlainEmail(`
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">hey ${capFirst.toLowerCase()},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">i'm trying to figure out what idearupt is missing. you used it for a while — you'd know better than most.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">if you can spare 2 minutes, i'll unlock <strong style="color:#f4f4f5;">${rewardDays} days of pro access</strong> for you.</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#d4d4d8;"><a href="${feedbackUrl}" style="color:#A78BFA;text-decoration:underline;font-weight:600;">share your thoughts (2 min) →</a></p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#71717a;">— bhavesh</p>
      `);
      textBody = `hey ${capFirst.toLowerCase()},\n\ni'm trying to figure out what idearupt is missing. you used it for a while — you'd know better than most.\n\nif you can spare 2 minutes, i'll unlock ${rewardDays} days of pro access for you.\n\nshare your thoughts (2 min): ${feedbackUrl}\n\n— bhavesh`;
    }

    // Send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Bhavesh from Idearupt <hello@idearupt.ai>",
        reply_to: "bhavesh@idearupt.ai",
        to: [email],
        subject,
        html: htmlBody,
        text: textBody,
        headers: {
          "List-Unsubscribe": "<mailto:hello@idearupt.ai?subject=unsubscribe>",
          "X-Entity-Ref-ID": crypto.randomUUID(),
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Failed to send feedback email to ${email}:`, errText);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log to email_log
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    await adminClient.from("email_log").insert({
      user_id,
      email,
      email_type: `feedback_${feedback_type}`,
      metadata: { feedback_type, reward_days: rewardDays },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-feedback-email error:", e);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

/** Plain-text-first email wrapper — personal, not marketing. */
function buildPlainEmail(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <tr><td style="padding:0 0 32px;">
          ${body}
        </td></tr>
        <tr><td style="border-top:1px solid #27272a;padding:16px 0 0;">
          <p style="margin:0;font-size:11px;color:#3f3f46;">You're receiving this because you signed up for Idearupt. <a href="mailto:hello@idearupt.ai?subject=unsubscribe" style="color:#71717a;text-decoration:underline;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
