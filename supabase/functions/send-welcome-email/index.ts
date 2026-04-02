import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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
      "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const cors = getCorsHeaders(req);

  try {
    const { email, name } = await req.json();

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const firstName = name ? name.split(" ")[0] : "Builder";

    // Check if user has unsubscribed from emails
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const checkClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: userRow } = await checkClient
        .from("users")
        .select("email_unsubscribed, is_banned")
        .eq("email", email.trim())
        .maybeSingle();
      if (userRow?.email_unsubscribed || userRow?.is_banned) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "User unsubscribed or banned" }), {
          status: 200, headers: { "Content-Type": "application/json", ...cors },
        });
      }
    } catch (_) { /* proceed if check fails */ }

    // Dark theme, inline-styled HTML email — matches lifecycle emails
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Welcome to Idearupt</title></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#18181b;border-radius:12px;overflow:hidden;border:1px solid #27272a;">

        <!-- Purple header bar -->
        <tr><td style="background:linear-gradient(135deg,#8B5CF6,#7C3AED);padding:28px 32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;">Idea</span><span style="font-size:22px;font-weight:700;color:#e0d4ff;">rupt</span>
        </td></tr>

        <!-- Main content -->
        <tr><td style="padding:32px 32px 24px;">
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;line-height:1.3;">Welcome to Idearupt, ${firstName} &#128075;</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">You just joined the community of builders who find <strong style="color:#f4f4f5;">real problems worth solving</strong>.</p>

          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Start your <strong style="color:#f4f4f5;">free 7-day Pro trial</strong> to unlock everything:</p>

          <!-- Feature list -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111827;border:1px solid #374151;border-radius:10px;margin:0 0 24px;">
            <tr><td style="padding:20px;">
              <p style="margin:0 0 10px;font-size:14px;color:#d1d5db;">&#10024; Pain Radar — live complaint feed filtered by your niche</p>
              <p style="margin:0 0 10px;font-size:14px;color:#d1d5db;">&#10024; Sniper Mode Alerts — get emailed when problems match your criteria</p>
              <p style="margin:0 0 10px;font-size:14px;color:#d1d5db;">&#10024; PDF exports — download &amp; share any idea report</p>
              <p style="margin:0 0 10px;font-size:14px;color:#d1d5db;">&#10024; Original source threads — see where every problem was found</p>
              <p style="margin:0 0 10px;font-size:14px;color:#d1d5db;">&#10024; Compare ideas side by side</p>
              <p style="margin:0 0 0;font-size:14px;color:#d1d5db;">&#10024; Unlimited saves &amp; higher daily limits</p>
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr><td style="background:linear-gradient(135deg,#F59E0B,#F97316);border-radius:8px;">
              <a href="https://idearupt.ai/feed" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Explore Problems &rarr;</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-align:center;">Full Pro access for 7 days. Cancel anytime.</p>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #27272a;"></div></td></tr>

        <!-- Founder note -->
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a;">I'm Bhavesh &#8212; I built a $1.5M agency starting from zero at 18. Idearupt is the tool I wish I had when I was looking for my first problem to solve.</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">Hit reply &#8212; I read every single one.</p>
          <p style="margin:8px 0 0;font-size:13px;color:#71717a;">&#8212; Bhavesh</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #27272a;"></div></td></tr>
        <tr><td style="padding:20px 32px 28px;">
          <p style="margin:0 0 4px;font-size:12px;color:#52525b;">&copy; 2026 Idearupt &middot; <a href="https://idearupt.ai/privacy" style="color:#8B5CF6;text-decoration:none;">Privacy</a> &middot; <a href="https://idearupt.ai/terms" style="color:#8B5CF6;text-decoration:none;">Terms</a></p>
          <p style="margin:0;font-size:11px;color:#3f3f46;">You're receiving this because you signed up at idearupt.ai</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const textContent = `Welcome to Idearupt, ${firstName}!

You just joined the community of builders who find real problems worth solving.

Start your free 7-day Pro trial to unlock everything:

✨ Pain Radar — live complaint feed filtered by your niche
✨ Sniper Mode Alerts — get emailed when problems match your criteria
✨ PDF exports — download & share any idea report
✨ Original source threads — see where every problem was found
✨ Compare ideas side by side
✨ Unlimited saves & higher daily limits

Full Pro access for 7 days. Cancel anytime.

Explore Problems: https://idearupt.ai/feed

---

I'm Bhavesh — I built a $1.5M agency starting from zero at 18. Idearupt is the tool I wish I had when I was looking for my first problem to solve.

Hit reply — I read every single one.

— Bhavesh

---
(c) 2026 Idearupt | Privacy: https://idearupt.ai/privacy | Terms: https://idearupt.ai/terms
You're receiving this because you signed up at idearupt.ai`;

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
        subject: `Welcome to Idearupt — start your free trial`,
        html: htmlContent,
        text: textContent,
        headers: {
          "List-Unsubscribe": "<mailto:hello@idearupt.ai?subject=unsubscribe>",
          "X-Entity-Ref-ID": crypto.randomUUID(),
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(JSON.stringify({ error: "Failed to send email. Please try again." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // Log to email_log so lifecycle cron knows welcome was sent
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);

      // Find the user by email to get their ID
      const { data: userData } = await adminClient
        .from("users")
        .select("id")
        .eq("email", email.trim())
        .maybeSingle();

      if (userData?.id) {
        await adminClient.from("email_log").insert({
          user_id: userData.id,
          email: email.trim(),
          email_type: "welcome",
          metadata: { source: "send-welcome-email" },
        });
      }
    } catch {
      // Non-blocking — welcome email still sent even if logging fails
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (error: unknown) {
    console.error("Error sending welcome email:", error);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
});
