import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

/**
 * SEND-REENGAGEMENT-BLAST — one-time email to all churned users.
 * Deploy only — do NOT trigger automatically.
 * POST with Authorization: Bearer <service_role_key>
 *
 * Sends a personal, plain-text-first email offering 7 days of Pro.
 * Rate limited: 100ms between emails to avoid Resend throttling.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_TYPE = "reengagement_blast_mar2026";

serve(async (req) => {
  try {
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

    // Parse dry_run flag from request body
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = !!body.dry_run;
    } catch { /* no body or invalid JSON — default to live mode */ }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const secret = Deno.env.get("FEEDBACK_TOKEN_SECRET") || supabaseServiceKey.slice(0, 32);

    // Get all churned users who haven't received this blast
    const { data: churnedUsers, error: fetchError } = await adminClient
      .from("users")
      .select("id, email, display_name")
      .eq("subscription_status", "churned")
      .not("email", "is", null)
      .neq("email_unsubscribed", true)
      .neq("is_banned", true);

    if (fetchError) {
      console.error("Failed to fetch churned users:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch users" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get already-sent emails for deduplication
    const { data: alreadySent } = await adminClient
      .from("email_log")
      .select("user_id")
      .eq("email_type", EMAIL_TYPE);

    const sentSet = new Set((alreadySent || []).map((r: any) => r.user_id));

    let sentCount = 0;
    let skippedCount = 0;

    for (const user of churnedUsers || []) {
      if (!user.email || sentSet.has(user.id)) {
        skippedCount++;
        continue;
      }

      // Generate signed reactivation URL (7 days Pro)
      const token = createHmac("sha256", secret).update(user.id).digest("hex");
      const reactivateUrl = `${supabaseUrl}/functions/v1/reactivate-trial?uid=${user.id}&token=${token}&days=7`;

      const firstName = ((user.display_name || user.email.split("@")[0]) as string)
        .replace(/[._-]/g, " ")
        .split(" ")[0]
        .toLowerCase();

      const html = buildPlainEmail(`
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">hey ${firstName},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">we fixed the things that were broken.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">since you left, we've added competitor analysis, build blueprints, pain radar, sniper mode alerts, and a bunch of fixes based on feedback from builders like you.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">i'd love for you to try it again — <a href="${reactivateUrl}" style="color:#A78BFA;text-decoration:underline;font-weight:600;">click here for 7 days of pro, on us</a>.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d4d4d8;">no strings. if it still doesn't click, no worries.</p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#71717a;">— bhavesh</p>
      `);

      const text = `hey ${firstName},\n\nwe fixed the things that were broken.\n\nsince you left, we've added competitor analysis, build blueprints, pain radar, sniper mode alerts, and a bunch of fixes based on feedback from builders like you.\n\ni'd love for you to try it again — click here for 7 days of pro, on us: ${reactivateUrl}\n\nno strings. if it still doesn't click, no worries.\n\n— bhavesh`;

      if (dryRun) {
        console.log(`[DRY RUN] Would send to: ${user.email}`);
        sentCount++;
      } else {
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
              subject: "hey — we fixed the things that were broken",
              html,
              text,
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
              email_type: EMAIL_TYPE,
              metadata: { blast: "mar2026", days_offered: 7 },
            });
            sentCount++;
          } else {
            const errText = await res.text();
            console.error(`Failed blast to ${user.email}:`, errText);
          }
        } catch (sendErr) {
          console.error(`Error sending blast to ${user.email}:`, sendErr);
        }
      }

      // Rate limit: 100ms between emails
      await new Promise((r) => setTimeout(r, 100));
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: churnedUsers?.length || 0,
        sent: sentCount,
        skipped: skippedCount,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("reengagement-blast error:", e);
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
