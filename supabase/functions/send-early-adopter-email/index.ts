import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * EARLY ADOPTER RE-ENGAGEMENT — 4-EMAIL DRIP SEQUENCE
 *
 * Sends a psychology-based email sequence to all 65 early adopters
 * who signed up but never converted to paid. Each invoke sends the
 * NEXT unsent email in the sequence for each eligible user.
 *
 * Sequence:
 *   Email 1 — "I set something aside for you"      (Day 0: personal gratitude + founding member offer)
 *   Email 2 — "Here's what happened this week"      (Day 3: social proof + what they're missing)
 *   Email 3 — "I'm closing this offer Friday"       (Day 5: deadline + scarcity)
 *   Email 4 — "Last email about this"               (Day 7: final chance, loss aversion, goodbye)
 *
 * Invoke manually via:
 *   curl -X POST https://<project>.supabase.co/functions/v1/send-early-adopter-email \
 *     -H "Authorization: Bearer <service_role_key>"
 *
 * Invoke every 2–3 days to drip the sequence. Safe to re-invoke
 * (fully deduplicated — each email_type is logged per user).
 *
 * Optional: pass ?email_num=1|2|3|4 to force sending a specific email.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const CHECKOUT_9 = "https://idearupt.lemonsqueezy.com/checkout/buy/59b85633-b196-48e0-8324-28a4c365ce98";

// The 4 email types in order
const EMAIL_SEQUENCE = [
  "early_adopter_1_personal",
  "early_adopter_2_social_proof",
  "early_adopter_3_deadline",
  "early_adopter_4_final",
] as const;

// Minimum hours between emails (prevents sending 2 in one day)
const MIN_HOURS_BETWEEN = 48;

serve(async (req) => {
  try {
    // Auth guard — only allow calls with a valid service_role JWT
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
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    // Optional: force a specific email number (1-4)
    const url = new URL(req.url);
    const forceEmailNum = url.searchParams.get("email_num")
      ? parseInt(url.searchParams.get("email_num")!, 10)
      : null;

    // Fetch all early adopters who have an email
    const { data: earlyAdopters, error: fetchError } = await adminClient
      .from("users")
      .select("id, email, plan_status, subscription_status, created_at")
      .eq("is_early_adopter", true)
      .not("email", "is", null)
      .neq("email_unsubscribed", true)
      .neq("is_banned", true);

    if (fetchError) {
      console.error("Error fetching early adopters:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch users" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    let skippedCount = 0;
    const results: { email: string; status: string; email_type?: string }[] = [];

    for (const user of earlyAdopters || []) {
      if (!user.email) continue;

      const ps = user.plan_status || "none";

      // Skip users who are already paid/active/on trial
      if (ps === "active" || ps === "trial") {
        skippedCount++;
        results.push({ email: user.email, status: "skipped_active" });
        continue;
      }

      // Get ALL emails already sent to this user in the sequence
      const { data: sentEmails } = await adminClient
        .from("email_log")
        .select("email_type, created_at")
        .eq("user_id", user.id)
        .in("email_type", [...EMAIL_SEQUENCE])
        .order("created_at", { ascending: false });

      const sentTypes = new Set((sentEmails || []).map((e: { email_type: string }) => e.email_type));

      // Check the most recent email sent time (don't spam)
      if (sentEmails && sentEmails.length > 0) {
        const lastSent = new Date(sentEmails[0].created_at);
        const hoursSinceLast = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLast < MIN_HOURS_BETWEEN && !forceEmailNum) {
          skippedCount++;
          results.push({ email: user.email, status: `too_soon (${Math.round(hoursSinceLast)}h ago)` });
          continue;
        }
      }

      // Determine which email to send next
      let emailIndex: number;
      if (forceEmailNum && forceEmailNum >= 1 && forceEmailNum <= 4) {
        emailIndex = forceEmailNum - 1;
      } else {
        // Find the first email in the sequence that hasn't been sent
        emailIndex = EMAIL_SEQUENCE.findIndex((type) => !sentTypes.has(type));
      }

      // If all emails have been sent, skip
      if (emailIndex === -1) {
        skippedCount++;
        results.push({ email: user.email, status: "sequence_complete" });
        continue;
      }

      const emailType = EMAIL_SEQUENCE[emailIndex];

      // Check deduplication for this specific email
      if (sentTypes.has(emailType)) {
        skippedCount++;
        results.push({ email: user.email, status: `already_sent_${emailIndex + 1}` });
        continue;
      }

      // Build personalized email
      const firstName = user.email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] || "Builder";
      const capFirst = firstName.charAt(0).toUpperCase() + firstName.slice(1);
      const checkoutUrl = `${CHECKOUT_9}?checkout[email]=${encodeURIComponent(user.email)}`;

      const emailContent = getEmailContent(emailIndex, capFirst, checkoutUrl);
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
            metadata: { plan_status: ps, sequence_num: emailIndex + 1 },
          });
          sentCount++;
          results.push({ email: user.email, status: "sent", email_type: emailType });
        } else {
          const errData = await res.text();
          console.error(`Failed to send to ${user.email}:`, errData);
          results.push({ email: user.email, status: `error: ${errData.substring(0, 100)}` });
        }
      } catch (sendErr) {
        console.error(`Error sending to ${user.email}:`, sendErr);
        results.push({ email: user.email, status: "send_error" });
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_early_adopters: earlyAdopters?.length || 0,
        sent: sentCount,
        skipped: skippedCount,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Early adopter email error:", e);
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});

// ─── Email content generator ────────────────────────────────

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function getEmailContent(index: number, name: string, checkoutUrl: string): EmailContent | null {
  switch (index) {
    case 0: return email1Personal(name, checkoutUrl);
    case 1: return email2SocialProof(name, checkoutUrl);
    case 2: return email3Deadline(name, checkoutUrl);
    case 3: return email4Final(name, checkoutUrl);
    default: return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 1: THE GRATEFUL FOUNDER (Day 0)
// Psychology: Reciprocity + Exclusivity
// Tone: Personal favor, not marketing
// ═══════════════════════════════════════════════════════════════

function email1Personal(name: string, checkoutUrl: string): EmailContent {
  return {
    subject: `${name}, I set something aside for you`,
    html: wrapEmail(`
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${name},</p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Quick personal note. You were one of the first people to sign up for Idearupt &mdash; before I'd even launched properly. I genuinely appreciate that.</p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Since you signed up, I've been heads-down building. We now have <strong style="color:#f4f4f5;">200+ validated startup problems</strong> with real demand signals, competitor breakdowns, and AI-powered analysis &mdash; all sourced from actual complaints on Reddit and Hacker News.</p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">I wanted to give you something back for believing in this early.</p>

      <!-- Founder's offer box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c1a0e;border:1px solid #166534;border-radius:10px;margin:0 0 24px;">
        <tr><td style="padding:24px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#4ade80;">&#127381; Founding member pricing</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#d4d4d8;">I reserved <strong style="color:#f4f4f5;">$9/mo</strong> pricing for you &mdash; less than half what new users pay ($19/mo). It's my way of saying thanks. This rate stays with you as long as you're subscribed.</p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">Only available to the first 65 users who joined before launch. Not available anywhere on the site.</p>
        </td></tr>
      </table>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Here's what's been happening while you've been away:</p>

      <!-- What they've been missing -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1b2e;border:1px solid #2e2a45;border-radius:10px;margin:0 0 24px;">
        <tr><td style="padding:20px;">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#127919; <strong style='color:#f4f4f5;'>Pain Radar</strong> &mdash; a live feed of real complaints filtered by your niche, dripping in real-time</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#128276; <strong style='color:#f4f4f5;'>Sniper Mode Alerts</strong> &mdash; get emailed when new problems match your niches and pain threshold</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#128200; <strong style='color:#f4f4f5;'>Source thread links</strong> &mdash; every idea now links to the original Reddit/HN posts so you can read the raw pain in people's own words</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#128196; <strong style='color:#f4f4f5;'>PDF exports</strong> &mdash; download a full report on any idea and share it with a co-founder or investor</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#9878;&#65039; <strong style='color:#f4f4f5;'>Idea comparison</strong> &mdash; put 2&ndash;3 ideas side by side and compare pain scores, revenue potential, competition, and build difficulty</p>
          <p style="margin:0 0 0;font-size:14px;line-height:1.5;color:#d4d4d8;">&#9889; New problems are added <strong style='color:#f4f4f5;'>daily</strong>. Pro members get unlimited views plus Pain Radar, Sniper Alerts, and more</p>
        </td></tr>
      </table>

      <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#a1a1aa;">If it's not for you, cancel in one click anytime &mdash; no questions asked. Genuinely no pressure. I'd rather you try it and decide for yourself.</p>

      <!-- CTA -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
        <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
          <a href="${checkoutUrl}" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Upgrade to Pro for $9/mo &rarr;</a>
        </td></tr>
      </table>
      <p style="margin:0 0 24px;font-size:13px;color:#71717a;text-align:center;">Your founding member rate: $9/mo. Cancel anytime.</p>

      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#a1a1aa;">Thanks for being here early,</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#f4f4f5;">Bhavesh</p>
      <p style="margin:0;font-size:12px;color:#52525b;">P.S. If you have feedback or ideas for features, just hit reply. I read every email and it genuinely shapes what I build next.</p>
    `),
    text: `Hey ${name},

Quick personal note. You were one of the first people to sign up for Idearupt — before I'd even launched properly. I genuinely appreciate that.

Since you signed up, I've been heads-down building. We now have 200+ validated startup problems with real demand signals, competitor breakdowns, and AI-powered analysis — all sourced from actual complaints on Reddit and Hacker News.

I wanted to give you something back for believing in this early.

🎟 Founding member pricing
I reserved $9/mo pricing for you — less than half what new users pay ($19/mo). It's my way of saying thanks. This rate stays with you as long as you're subscribed.

Only available to the first 65 users who joined before launch. Not available anywhere on the site.

Here's what's been happening while you've been away:

🎯 Pain Radar — live feed of real complaints filtered by your niche
🔔 Sniper Mode Alerts — get emailed when problems match your criteria
📈 Source thread links — every idea now links to the original Reddit/HN posts
📄 PDF exports — download a full report on any idea
⚖️ Idea comparison — put 2–3 ideas side by side
⚡ New problems are added daily. Pro members get unlimited views plus Pain Radar, Sniper Alerts, and more

If it's not for you, cancel in one click anytime — no questions asked.

Upgrade to Pro for $9/mo: ${checkoutUrl}

Your founding member rate: $9/mo. Cancel anytime.

Thanks for being here early,
Bhavesh

P.S. If you have feedback or ideas for features, just hit reply. I read every email.`,
  };
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 2: SOCIAL PROOF + WHAT THEY'RE MISSING (Day 3)
// Psychology: Social proof + Loss aversion + Bandwagon effect
// Tone: Casual update — "thought you'd want to know"
// ═══════════════════════════════════════════════════════════════

function email2SocialProof(name: string, checkoutUrl: string): EmailContent {
  return {
    subject: `${name}, builders are already using your spot`,
    html: wrapEmail(`
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${name},</p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">I sent you a note a few days ago about your founding member pricing. Wanted to give you a quick update.</p>

      <!-- Social proof box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e1b2e;border:1px solid #8B5CF644;border-radius:10px;margin:0 0 24px;">
        <tr><td style="padding:24px;">
          <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#A78BFA;">&#128640; What happened since my last email</p>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#d4d4d8;"><strong style="color:#f4f4f5;">12 new validated problems</strong> were added to the platform &mdash; including 3 scoring above 85/100 in SaaS and AI</p>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#d4d4d8;">Pro members downloaded <strong style="color:#f4f4f5;">40+ PDF reports</strong> this week to share with co-founders and investors</p>
          <p style="margin:0 0 0;font-size:14px;line-height:1.6;color:#d4d4d8;">Several founding members already locked in their <strong style="color:#f4f4f5;">$9/mo rate</strong> &mdash; they're getting unlimited Pain Radar, Sniper Mode Alerts, and full Pro access</p>
        </td></tr>
      </table>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Meanwhile, here's what your free account can't access:</p>

      <!-- What they're missing — red/loss framing -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1c1111;border:1px solid #7f1d1d;border-radius:10px;margin:0 0 24px;">
        <tr><td style="padding:20px;">
          <p style="margin:0 0 10px;font-size:14px;color:#fca5a5;">&cross; Pain Radar (live complaint feed) &mdash; <strong style='color:#fca5a5;'>locked</strong></p>
          <p style="margin:0 0 10px;font-size:14px;color:#fca5a5;">&cross; Sniper Mode Alerts &mdash; <strong style='color:#fca5a5;'>locked</strong></p>
          <p style="margin:0 0 10px;font-size:14px;color:#fca5a5;">&cross; Original Reddit/HN source threads &mdash; <strong style='color:#fca5a5;'>locked</strong></p>
          <p style="margin:0 0 10px;font-size:14px;color:#fca5a5;">&cross; PDF exports &amp; idea reports &mdash; <strong style='color:#fca5a5;'>locked</strong></p>
          <p style="margin:0 0 10px;font-size:14px;color:#fca5a5;">&cross; Unlimited idea views &mdash; <strong style='color:#fca5a5;'>limited on free</strong></p>
          <p style="margin:0 0 0;font-size:14px;color:#fca5a5;">&cross; Side-by-side idea comparison &mdash; <strong style='color:#fca5a5;'>locked</strong></p>
        </td></tr>
      </table>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">I'm not saying this to pressure you. I'm saying it because you were early enough to earn this &mdash; and I don't want you to miss out on something I literally set aside for you.</p>

      <!-- Urgency hint -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1207;border:1px solid #F59E0B44;border-radius:10px;margin:0 0 24px;">
        <tr><td style="padding:20px;">
          <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#F59E0B;">&#128293; Spots are filling</p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">I only reserved this $9/mo rate for 65 founding members. Several have already claimed theirs. Once they're all taken, this pricing is gone &mdash; new users pay $19/mo with no exceptions.</p>
        </td></tr>
      </table>

      <!-- CTA -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
        <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
          <a href="${checkoutUrl}" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Claim your $9/mo rate &rarr;</a>
        </td></tr>
      </table>
      <p style="margin:0 0 24px;font-size:13px;color:#71717a;text-align:center;">$9/mo founding member rate. Cancel anytime.</p>

      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#a1a1aa;">Just wanted to keep you in the loop,</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#f4f4f5;">Bhavesh</p>
      <p style="margin:0;font-size:12px;color:#52525b;">P.S. Reply to this email if you have any questions. I personally answer every one.</p>
    `),
    text: `Hey ${name},

I sent you a note a few days ago about your founding member pricing. Wanted to give you a quick update.

🚀 What happened since my last email:
- 12 new validated problems were added — including 3 scoring above 85/100 in SaaS and AI
- Pro members downloaded 40+ PDF reports this week to share with co-founders and investors
- Several founding members already locked in their $9/mo rate — they're getting unlimited Pain Radar, Sniper Mode Alerts, and full Pro access

Meanwhile, here's what your free account can't access:

✗ Pain Radar (live complaint feed) — locked
✗ Sniper Mode Alerts — locked
✗ Original Reddit/HN source threads — locked
✗ PDF exports & idea reports — locked
✗ Unlimited idea views — limited on free
✗ Side-by-side idea comparison — locked

I'm not saying this to pressure you. I'm saying it because you were early enough to earn this — and I don't want you to miss out on something I literally set aside for you.

🔥 Spots are filling — I only reserved this $9/mo rate for 65 founding members. Several have already claimed theirs. Once they're all taken, this pricing is gone.

Claim your $9/mo rate: ${checkoutUrl}

$9/mo founding member rate. Cancel anytime.

Just wanted to keep you in the loop,
Bhavesh

P.S. Reply to this email if you have any questions. I personally answer every one.`,
  };
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 3: THE DEADLINE (Day 5)
// Psychology: Scarcity + Deadline + Fear of loss
// Tone: Honest, specific, time-limited — "closing Friday"
// ═══════════════════════════════════════════════════════════════

function email3Deadline(name: string, checkoutUrl: string): EmailContent {
  // Calculate the deadline — 2 days from when function runs
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 2);
  const deadlineStr = deadline.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return {
    subject: `${name}, your $9/mo founding rate closes ${deadlineStr}`,
    html: wrapEmail(`
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${name},</p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">I'll keep this short.</p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">I've been holding your <strong style="color:#f4f4f5;">$9/mo founding member pricing</strong> since you signed up. But I can't keep it open forever &mdash; I'm closing this offer on <strong style="color:#F59E0B;">${deadlineStr}</strong>.</p>

      <!-- Deadline box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1c0c0c;border:1px solid #EF444466;border-radius:10px;margin:0 0 24px;">
        <tr><td style="padding:24px;">
          <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#EF4444;">&#9200; Founding member pricing ends ${deadlineStr}</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#d4d4d8;">After this date, your reserved $9/mo rate will be released. If you come back later, you'll pay the standard <strong style="color:#f4f4f5;">$19/mo</strong> &mdash; same as everyone else. No exceptions.</p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">This isn't a marketing tactic. I set aside 65 founding slots when I launched. Several are claimed. The rest are going away.</p>
        </td></tr>
      </table>

      <!-- Price comparison -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td width="50%" style="padding:12px;background-color:#27272a;border-radius:8px 0 0 8px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#71717a;">After ${deadlineStr}</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#71717a;text-decoration:line-through;">$19/mo</p>
          </td>
          <td width="50%" style="padding:12px;background:linear-gradient(135deg,#1e1b2e,#2a1f4e);border:1px solid #8B5CF644;border-radius:0 8px 8px 0;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#4ade80;">Your price (until ${deadlineStr})</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#A78BFA;">$9/mo</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#a1a1aa;">Lock in the $9/mo rate now. If it's not for you, cancel anytime &mdash; no questions asked. But this price goes away after <strong style="color:#F59E0B;">${deadlineStr}</strong>.</p>

      <!-- CTA -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
        <tr><td style="background:linear-gradient(135deg,#EF4444,#F59E0B);border-radius:8px;">
          <a href="${checkoutUrl}" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">Lock in $9/mo before it's gone &rarr;</a>
        </td></tr>
      </table>
      <p style="margin:0 0 24px;font-size:13px;color:#71717a;text-align:center;">$9/mo founding member rate. Cancel anytime.</p>

      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#a1a1aa;">&mdash; Bhavesh</p>
      <p style="margin:0;font-size:12px;color:#52525b;">P.S. Even if you're not ready to use Pro every day, locking in $9/mo now means you'll never pay $19/mo. Cancel anytime if it's not for you.</p>
    `),
    text: `Hey ${name},

I'll keep this short.

I've been holding your $9/mo founding member pricing since you signed up. But I can't keep it open forever — I'm closing this offer on ${deadlineStr}.

⏰ Founding member pricing ends ${deadlineStr}
After this date, your reserved $9/mo rate will be released. If you come back later, you'll pay the standard $19/mo — same as everyone else. No exceptions.

This isn't a marketing tactic. I set aside 65 founding slots when I launched. Several are claimed. The rest are going away.

After ${deadlineStr}: $19/mo
Your price (until ${deadlineStr}): $9/mo

Lock in the $9/mo rate now. If it's not for you, cancel anytime — no questions asked. But this price goes away after the deadline.

Lock in $9/mo before it's gone: ${checkoutUrl}

$9/mo founding member rate. Cancel anytime.

— Bhavesh

P.S. Even if you're not ready to use Pro every day, locking in $9/mo now means you'll never pay $19/mo. Cancel anytime if it's not for you.`,
  };
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 4: THE FINAL GOODBYE (Day 7)
// Psychology: Loss aversion + Finality + Respect
// Tone: "I respect your inbox. This is the last one."
// ═══════════════════════════════════════════════════════════════

function email4Final(name: string, checkoutUrl: string): EmailContent {
  return {
    subject: `${name}, this is the last time I'll offer you this`,
    html: wrapEmail(`
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${name},</p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">This is the last email I'll send you about this. I respect your inbox.</p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">When you signed up, you were one of the first 65 people to believe in what I was building. I set aside <strong style="color:#f4f4f5;">$9/mo founding member pricing</strong> for you &mdash; something I've never offered publicly and never will again.</p>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">After today, I'm releasing your reserved spot. Your rate goes to <strong style="color:#f4f4f5;">$19/mo</strong> &mdash; the same price everyone else pays. There's no way to get $9/mo back once it's gone.</p>

      <!-- Final box — high contrast -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1c0c0c;border:1px solid #EF444488;border-radius:10px;margin:0 0 24px;">
        <tr><td style="padding:24px;">
          <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#EF4444;">&#128683; Your founding member rate expires today</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#d4d4d8;">After today:</p>
          <p style="margin:0 0 8px;font-size:14px;color:#fca5a5;">&cross; No more $9/mo &mdash; standard pricing is $19/mo</p>
          <p style="margin:0 0 8px;font-size:14px;color:#fca5a5;">&cross; No more founding member status</p>
          <p style="margin:0 0 8px;font-size:14px;color:#fca5a5;">&cross; No more reserved spot &mdash; it goes to a new user</p>
          <p style="margin:0 0 0;font-size:14px;color:#fca5a5;">&cross; No more emails from me about this</p>
        </td></tr>
      </table>

      <!-- What they'd get — green/gain framing -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c1a0e;border:1px solid #166534;border-radius:10px;margin:0 0 24px;">
        <tr><td style="padding:24px;">
          <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#4ade80;">What you'll unlock with your founding rate:</p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#10003; <strong style='color:#f4f4f5;'>Pain Radar</strong> &mdash; live complaint feed filtered by your niche</p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#10003; <strong style='color:#f4f4f5;'>Sniper Mode Alerts</strong> &mdash; get emailed when problems match your criteria</p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#10003; <strong style='color:#f4f4f5;'>200+ validated problems</strong> with demand signals, updated daily</p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#10003; <strong style='color:#f4f4f5;'>PDF reports, source threads, competitor data</strong> &mdash; all unlocked</p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#10003; <strong style='color:#f4f4f5;'>Unlimited Pain Radar &amp; Sniper Mode Alerts</strong></p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#d4d4d8;">&#10003; <strong style='color:#f4f4f5;'>Side-by-side idea comparison</strong> to pick the best opportunity</p>
          <p style="margin:0 0 0;font-size:14px;line-height:1.5;color:#d4d4d8;">&#10003; <strong style='color:#f4f4f5;'>$9/mo locked forever</strong> &mdash; never increases, even when I raise prices</p>
        </td></tr>
      </table>

      <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#a1a1aa;">$9/mo. Cancel in one click anytime. Zero risk. But after today, the founding rate is gone and I won't email you about this again.</p>

      <!-- CTA — final -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
        <tr><td style="background:linear-gradient(135deg,#EF4444,#DC2626);border-radius:8px;">
          <a href="${checkoutUrl}" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">Last chance &mdash; claim $9/mo &rarr;</a>
        </td></tr>
      </table>
      <p style="margin:0 0 24px;font-size:13px;color:#71717a;text-align:center;">After today this becomes $19/mo. No exceptions.</p>

      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#a1a1aa;">Either way, thanks for being one of the first.</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#f4f4f5;">Bhavesh</p>
      <p style="margin:0;font-size:12px;color:#52525b;">P.S. This is genuinely the last email. If Idearupt isn't right for you, no hard feelings. But I didn't want you to find out months from now that you missed this.</p>
    `),
    text: `Hey ${name},

This is the last email I'll send you about this. I respect your inbox.

When you signed up, you were one of the first 65 people to believe in what I was building. I set aside $9/mo founding member pricing for you — something I've never offered publicly and never will again.

After today, I'm releasing your reserved spot. Your rate goes to $19/mo — the same price everyone else pays. There's no way to get $9/mo back once it's gone.

🚫 Your founding member rate expires today

After today:
✗ No more $9/mo — standard pricing is $19/mo
✗ No more founding member status
✗ No more reserved spot — it goes to a new user
✗ No more emails from me about this

What you'll unlock with your founding rate:
✓ Pain Radar — live complaint feed filtered by your niche
✓ Sniper Mode Alerts — get emailed when problems match your criteria
✓ 200+ validated problems with demand signals, updated daily
✓ PDF reports, source threads, competitor data — all unlocked
✓ Unlimited Pain Radar & Sniper Mode Alerts
✓ Side-by-side idea comparison to pick the best opportunity
✓ $9/mo locked forever — never increases, even when I raise prices

$9/mo. Cancel in one click anytime. Zero risk. But after today, the founding rate is gone and I won't email you about this again.

Last chance — claim $9/mo: ${checkoutUrl}

After today this becomes $19/mo. No exceptions.

Either way, thanks for being one of the first.
Bhavesh

P.S. This is genuinely the last email. If Idearupt isn't right for you, no hard feelings. But I didn't want you to find out months from now that you missed this.`,
  };
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
          <p style="margin:0;font-size:11px;color:#3f3f46;">You're receiving this because you're one of Idearupt's founding members</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
