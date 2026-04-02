import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { email, name, position } = await req.json();

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

    const features = [
      "Pain Radar — live complaint feed by niche",
      "Sniper Mode Alerts — email alerts when problems match your criteria",
      "8 idea views, 8 signals, 8 use cases per day",
      "PDF exports — download & share any idea report",
      "Original Reddit/HN source threads",
      "Compare ideas side by side",
      "Unlimited saved ideas",
      "3 validations, 2 deep dives, 2 remixes per day",
    ];

    const featureRows = features.map(f => `
                <tr>
                  <td style="padding:5px 0;font-size:14px;line-height:1.5;color:#3f3f46;">&#10003; ${f}</td>
                </tr>`).join("");

    // Table-based, inline-styled HTML email
    const htmlContent = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>You're locked in - Idearupt Pro</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Purple header bar -->
          <tr>
            <td style="background:linear-gradient(135deg,#8B5CF6,#7C3AED);padding:28px 32px;">
              <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Idea</span><span style="font-size:22px;font-weight:700;color:#e0d4ff;letter-spacing:-0.02em;">rupt</span>
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;line-height:1.3;">You're on the list, ${firstName} &#127881;</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#52525b;">You've secured your spot on the Idearupt Pro waitlist. We'll send you an exclusive upgrade link when Pro goes live.</p>
            </td>
          </tr>

          <!-- Price box -->
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;">
                <tr>
                  <td align="center" style="padding:28px 20px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">PRO PRICING</p>
                    <p style="margin:0 0 8px;">
                      <span style="font-size:36px;font-weight:800;color:#7c3aed;">$19</span>
                      <span style="font-size:15px;color:#a1a1aa;">/mo</span>
                    </p>
                    <p style="margin:0;font-size:13px;font-weight:600;color:#16a34a;">&#10003; Cancel anytime &#8212; your data stays</p>
                    ${position ? `<p style="margin:10px 0 0;font-size:13px;color:#71717a;">You're #${position} on the waitlist</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What happens next -->
          <tr>
            <td style="padding:0 32px 20px;">
              <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#18181b;">What happens next:</p>
              <p style="margin:0;font-size:14px;line-height:1.65;color:#52525b;">We'll send you an exclusive upgrade link when Pro goes live. One click and you're on Pro at $19/mo with all features unlocked.</p>
            </td>
          </tr>

          <!-- Features -->
          <tr>
            <td style="padding:0 32px 28px;">
              <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#18181b;">What you'll get with Pro:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e4e4e7;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${featureRows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding:0 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
                    <a href="https://idearupt.ai/feed" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Keep Exploring Ideas &#8594;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Share box -->
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#166534;">&#128279; Know other builders? Share Idearupt with them &#8212; they get a 7-day free trial: <a href="https://idearupt.ai" style="color:#7c3aed;font-weight:600;text-decoration:none;">idearupt.ai</a></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 32px;">
              <div style="border-top:1px solid #e4e4e7;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;">
              <p style="margin:0 0 4px;font-size:12px;color:#a1a1aa;">&#169; 2026 Idearupt &#183; <a href="https://idearupt.ai/privacy" style="color:#8B5CF6;text-decoration:none;">Privacy</a> &#183; <a href="https://idearupt.ai/terms" style="color:#8B5CF6;text-decoration:none;">Terms</a></p>
              <p style="margin:0;font-size:11px;color:#a1a1aa;">You're receiving this because you joined the Pro waitlist at idearupt.ai</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Plain text version
    const textContent = `You're on the list, ${firstName}!

You've secured your spot on the Idearupt Pro waitlist. We'll send you an exclusive upgrade link when Pro goes live.

PRO PRICING: $19/mo
Cancel anytime - your data stays
${position ? `You're #${position} on the waitlist` : ""}

WHAT HAPPENS NEXT:
We'll send you an exclusive upgrade link when Pro goes live. One click and you're on Pro at $19/mo with all features unlocked.

WHAT YOU'LL GET WITH PRO:
${features.map(f => `- ${f}`).join("\n")}

Keep Exploring Ideas: https://idearupt.ai/feed

Know other builders? Share Idearupt with them - they get a 7-day free trial: https://idearupt.ai

---
(c) 2026 Idearupt | Privacy: https://idearupt.ai/privacy | Terms: https://idearupt.ai/terms
You're receiving this because you joined the Pro waitlist at idearupt.ai`;

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
        subject: `You're on the Idearupt Pro waitlist!`,
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
      const errData = await res.json();
      console.error("Resend error:", errData);
      return new Response(JSON.stringify({ error: "Failed to send email. Please try again." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (error: unknown) {
    console.error("Error sending waitlist email:", error);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
});
