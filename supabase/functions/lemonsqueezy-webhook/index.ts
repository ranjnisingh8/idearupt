import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** HMAC-SHA256 using Web Crypto API (no external deps) */
async function verifySignature(secret: string, body: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hexHash = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hexHash === signature;
}

/**
 * LEMONSQUEEZY WEBHOOK HANDLER
 *
 * Handles payment events from LemonSqueezy to manage subscription status.
 * Also sends Pro Welcome email on activation and Cancellation email on cancel.
 *
 * Events handled:
 *  - order_created          → Set user to 'pro' + send Pro Welcome email
 *  - subscription_created   → Set user to 'pro' + send Pro Welcome email
 *  - subscription_updated   → Update status based on subscription state
 *  - subscription_cancelled → Send Cancellation feedback email
 *  - subscription_expired   → Set user to 'churned'
 */

const WEBHOOK_SECRET = Deno.env.get("LEMON_SQUEEZY_SIGNING_SECRET") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// No-trial variant ($19 direct charge) — cancellation re-subscribe emails go to past subscribers
const CHECKOUT_19 = "https://idearupt.lemonsqueezy.com/checkout/buy/b7ea618b-4994-4d89-b36d-b63f25f6603a";
const CHECKOUT_9 = "https://idearupt.lemonsqueezy.com/checkout/buy/59b85633-b196-48e0-8324-28a4c365ce98";

serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const rawBody = await req.text();

    // ─── Verify webhook signature (REQUIRED — never skip) ───
    if (!WEBHOOK_SECRET) {
      console.error("LEMON_SQUEEZY_SIGNING_SECRET is not configured — rejecting webhook");
      return new Response(JSON.stringify({ error: "Webhook signing secret not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const signature = req.headers.get("x-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isValid = await verifySignature(WEBHOOK_SECRET, rawBody, signature);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const eventName: string = payload.meta?.event_name || "";

    // Extract user_id and ref_code from custom data (passed during checkout)
    const customData = payload.meta?.custom_data || {};
    const userId: string | null = customData.user_id || null;
    const refCode: string | null = customData.ref_code || null;

    // Also try to get email from the order/subscription
    const email: string | null =
      payload.data?.attributes?.user_email ||
      payload.data?.attributes?.customer_email ||
      null;

    if (!userId && !email) {
      console.error("No user_id or email in webhook payload:", eventName);
      return new Response(JSON.stringify({ error: "No user identifier" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ─── Supabase admin client ──────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Find the user — by ID first, then by email
    let targetUserId = userId;
    let targetEmail = email;
    let isEarlyAdopter = false;
    if (!targetUserId && email) {
      const { data: userByEmail } = await adminClient
        .from("users")
        .select("id, is_early_adopter")
        .eq("email", email)
        .maybeSingle();
      targetUserId = userByEmail?.id || null;
      isEarlyAdopter = !!userByEmail?.is_early_adopter;
    }

    // If we have userId but no email, look up the email + early adopter flag
    if (targetUserId && !targetEmail) {
      const { data: userById } = await adminClient
        .from("users")
        .select("email, is_early_adopter")
        .eq("id", targetUserId)
        .maybeSingle();
      targetEmail = userById?.email || null;
      isEarlyAdopter = !!userById?.is_early_adopter;
    }

    // If we found user by ID initially but didn't fetch early_adopter yet
    if (targetUserId && userId && !isEarlyAdopter) {
      const { data: eaCheck } = await adminClient
        .from("users")
        .select("is_early_adopter")
        .eq("id", targetUserId)
        .maybeSingle();
      isEarlyAdopter = !!eaCheck?.is_early_adopter;
    }

    if (!targetUserId) {
      console.error("Could not find user for webhook:", { userId, email, eventName });
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ─── Handle events ──────────────────────────────────────
    const subscriptionStatus = payload.data?.attributes?.status;
    const lsSubscriptionId = payload.data?.id || null;
    const lsCustomerId = payload.data?.attributes?.customer_id?.toString() || null;
    const subscriptionPlan =
      payload.data?.attributes?.variant_name ||
      payload.data?.attributes?.product_name ||
      null;

    // Extract period end + trial end from LS payload
    const lsRenewsAt = payload.data?.attributes?.renews_at || null;
    const lsEndsAt = payload.data?.attributes?.ends_at || null;
    const lsTrialEndsAt = payload.data?.attributes?.trial_ends_at || null;
    const periodEnd = lsRenewsAt || lsEndsAt || null;

    let newStatus: string | null = null;
    let newPlanStatus: string | null = null;
    let shouldSendProWelcome = false;
    let shouldSendCancellation = false;
    let cancelAtPeriodEnd = false;

    switch (eventName) {
      case "order_created":
        newStatus = "pro";
        newPlanStatus = "active";
        shouldSendProWelcome = true;
        break;

      case "subscription_created":
        // Check if this is a trial start or direct active
        if (subscriptionStatus === "on_trial" || subscriptionStatus === "trialing") {
          newStatus = "pro";
          newPlanStatus = "trial";
        } else {
          newStatus = "pro";
          newPlanStatus = "active";
        }
        shouldSendProWelcome = true;
        break;

      case "subscription_payment_success":
        // Recurring payment succeeded — confirm active status
        newStatus = "pro";
        newPlanStatus = "active";
        break;

      case "subscription_payment_failed":
        // Payment failed
        newPlanStatus = "past_due";
        break;

      case "subscription_updated":
        if (subscriptionStatus === "active") {
          newStatus = "pro";
          newPlanStatus = "active";
        } else if (subscriptionStatus === "trialing" || subscriptionStatus === "on_trial") {
          newStatus = "pro";
          newPlanStatus = "trial";
        } else if (subscriptionStatus === "past_due" || subscriptionStatus === "unpaid") {
          console.error(`Subscription ${subscriptionStatus} for user ${targetUserId}`);
          newPlanStatus = "past_due";
        } else if (subscriptionStatus === "cancelled") {
          // Check if user was on a free trial — if so, cut access immediately
          // Check BOTH plan_status AND trial_ends_at to handle race condition
          // where subscription_updated(active) arrives before the cancel event
          const { data: subUpdUser } = await adminClient
            .from("users")
            .select("plan_status, trial_ends_at")
            .eq("id", targetUserId)
            .maybeSingle();

          const isTrialUser = subUpdUser?.plan_status === "trial" ||
            (subUpdUser?.trial_ends_at && new Date(subUpdUser.trial_ends_at) > new Date());

          if (isTrialUser) {
            // Trial user cancelled — immediate downgrade, no grace period
            newStatus = "churned";
            newPlanStatus = "free";
          } else {
            // Paying user cancelled — keep access until period end
            newPlanStatus = "cancelled";
            cancelAtPeriodEnd = true;
          }
        } else if (subscriptionStatus === "expired") {
          newStatus = "churned";
          newPlanStatus = "free";
        }
        break;

      case "subscription_cancelled": {
        // Check if user is on a free trial — if so, cut access immediately
        // Check BOTH plan_status AND trial_ends_at to handle race condition
        const { data: cancelUser } = await adminClient
          .from("users")
          .select("plan_status, trial_ends_at")
          .eq("id", targetUserId)
          .maybeSingle();

        const isTrialCancel = cancelUser?.plan_status === "trial" ||
          (cancelUser?.trial_ends_at && new Date(cancelUser.trial_ends_at) > new Date());

        if (isTrialCancel) {
          // Trial user cancelled — immediate downgrade, create FOMO
          newStatus = "churned";
          newPlanStatus = "free";
          shouldSendCancellation = true;
        } else {
          // Paying user cancelled — keep access until period end
          newPlanStatus = "cancelled";
          cancelAtPeriodEnd = true;
          shouldSendCancellation = true;
        }
        break;
      }

      case "subscription_expired":
        newStatus = "churned";
        newPlanStatus = "free";
        break;

      default:
        console.error(`Unhandled webhook event: ${eventName}`);
    }

    // Build update data
    if (newStatus || newPlanStatus) {
      const updateData: Record<string, unknown> = {
        subscription_updated_at: new Date().toISOString(),
      };

      // Legacy subscription_status (backward compat)
      if (newStatus) updateData.subscription_status = newStatus;

      // New plan_status system
      if (newPlanStatus) updateData.plan_status = newPlanStatus;

      if (lsSubscriptionId) updateData.ls_subscription_id = lsSubscriptionId;
      if (lsCustomerId) updateData.ls_customer_id = lsCustomerId;
      if (subscriptionPlan) updateData.subscription_plan = subscriptionPlan;

      // Set period end date from LS
      if (periodEnd) updateData.current_period_end = periodEnd;

      // For trial users who cancelled: expire period immediately so frontend cuts access
      if (newPlanStatus === "free" && (eventName === "subscription_cancelled" || (eventName === "subscription_updated" && subscriptionStatus === "cancelled"))) {
        updateData.current_period_end = new Date().toISOString();
        updateData.cancel_at_period_end = false;
        updateData.trial_ends_at = new Date().toISOString();
      }

      // Set cancel flag
      if (cancelAtPeriodEnd) updateData.cancel_at_period_end = true;
      // Clear cancel flag when reactivated
      if (newPlanStatus === "active" || newPlanStatus === "trial") {
        updateData.cancel_at_period_end = false;
      }

      // Set trial_ends_at from LS if starting a trial
      if (newPlanStatus === "trial" && lsTrialEndsAt) {
        updateData.trial_ends_at = lsTrialEndsAt;
      }

      if (newStatus === "pro") {
        updateData.upgraded_at = new Date().toISOString();
      }

      const { error: updateError } = await adminClient
        .from("users")
        .update(updateData)
        .eq("id", targetUserId);

      if (updateError) {
        console.error("Failed to update user:", updateError);
        return new Response(JSON.stringify({ error: "Database update failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      // User updated: status/plan change logged via webhook event

      // ─── Track referral conversion commission ───────────────
      if (eventName === "order_created" || eventName === "subscription_created" || eventName === "subscription_payment_success") {
        const paymentAmount = payload.data?.attributes?.total
          ? Number(payload.data.attributes.total) / 100 // LS sends cents
          : (payload.data?.attributes?.subtotal ? Number(payload.data.attributes.subtotal) / 100 : 0);

        if (paymentAmount > 0 && targetUserId) {
          try {
            await adminClient.rpc("record_referral_conversion", {
              p_referred_id: targetUserId,
              p_payment_amount: paymentAmount,
            });
            // Referral conversion recorded
          } catch (refErr) {
            // Non-blocking — referral system may not be deployed yet
            console.error("Referral conversion tracking failed:", refErr);
          }
        }
      }
    }

    // ─── Send Pro Welcome email ─────────────────────────────
    if (shouldSendProWelcome && targetEmail && RESEND_API_KEY) {
      // Deduplicate: only send once
      const { data: existingLog } = await adminClient
        .from("email_log")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("email_type", "pro_welcome")
        .maybeSingle();

      if (!existingLog) {
        try {
          await sendProWelcomeEmail(targetEmail);
          await adminClient.from("email_log").insert({
            user_id: targetUserId,
            email: targetEmail,
            email_type: "pro_welcome",
            metadata: { event: eventName },
          });
          // Pro Welcome email sent
        } catch (emailErr) {
          console.error("Failed to send Pro Welcome email:", emailErr);
        }
      }
    }

    // ─── Send Cancellation email ────────────────────────────
    if (shouldSendCancellation && targetEmail && RESEND_API_KEY) {
      const { data: existingLog } = await adminClient
        .from("email_log")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("email_type", "cancellation")
        .maybeSingle();

      if (!existingLog) {
        try {
          await sendCancellationEmail(targetEmail, isEarlyAdopter);
          await adminClient.from("email_log").insert({
            user_id: targetUserId,
            email: targetEmail,
            email_type: "cancellation",
            metadata: { event: eventName },
          });
          // Cancellation email sent
        } catch (emailErr) {
          console.error("Failed to send Cancellation email:", emailErr);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, event: eventName, user_id: targetUserId, new_status: newStatus }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(
      JSON.stringify({ error: "Something went wrong." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// ─── Email senders ───────────────────────────────────────────

async function sendProWelcomeEmail(email: string): Promise<void> {
  const firstName = email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] || "Builder";
  const capFirst = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Welcome to Idearupt Pro</title></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#18181b;border-radius:12px;overflow:hidden;border:1px solid #27272a;">
        <tr><td style="background:linear-gradient(135deg,#8B5CF6,#7C3AED);padding:28px 32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;">Idea</span><span style="font-size:22px;font-weight:700;color:#e0d4ff;">rupt</span>
        </td></tr>
        <tr><td style="padding:32px 32px 24px;">
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;line-height:1.3;">You're in, ${capFirst} &#127881;</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Welcome to <strong style="color:#f4f4f5;">Idearupt Pro</strong>. Here's everything that's now unlocked for you every day:</p>

          <!-- Unlocked features -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c1a0e;border:1px solid #166534;border-radius:10px;margin:0 0 24px;">
            <tr><td style="padding:20px;">
              <p style="margin:0 0 10px;font-size:14px;color:#4ade80;">&#10004; 8 idea views, 8 signals, 8 use cases per day</p>
              <p style="margin:0 0 10px;font-size:14px;color:#4ade80;">&#10004; PDF exports &mdash; download &amp; share any idea report</p>
              <p style="margin:0 0 10px;font-size:14px;color:#4ade80;">&#10004; Original Reddit/HN source threads</p>
              <p style="margin:0 0 10px;font-size:14px;color:#4ade80;">&#10004; Compare ideas side by side</p>
              <p style="margin:0 0 10px;font-size:14px;color:#4ade80;">&#10004; Pain Radar &mdash; live complaint feed filtered by your niche</p>
              <p style="margin:0 0 10px;font-size:14px;color:#4ade80;">&#10004; Sniper Mode Alerts &mdash; get emailed when problems match your criteria</p>
              <p style="margin:0 0 0;font-size:14px;color:#4ade80;">&#10004; Unlimited saves &amp; higher daily limits</p>
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
              <a href="https://idearupt.ai/feed" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Explore Pro Features &rarr;</a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#71717a;text-align:center;">Questions? Reply to this email &mdash; I read every one.</p>
        </td></tr>
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #27272a;"></div></td></tr>
        <tr><td style="padding:20px 32px 28px;">
          <p style="margin:0 0 4px;font-size:12px;color:#52525b;">&copy; 2026 Idearupt &middot; <a href="https://idearupt.ai/privacy" style="color:#8B5CF6;text-decoration:none;">Privacy</a> &middot; <a href="https://idearupt.ai/terms" style="color:#8B5CF6;text-decoration:none;">Terms</a></p>
          <p style="margin:0;font-size:11px;color:#3f3f46;">You're receiving this because you subscribed to Idearupt Pro</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textContent = `Welcome to Idearupt Pro, ${capFirst}!

Here's everything that's now unlocked for you:

✓ 8 idea views, 8 signals, 8 use cases per day
✓ PDF exports — download & share any idea report
✓ Original Reddit/HN source threads
✓ Compare ideas side by side
✓ Pain Radar — live complaint feed filtered by your niche
✓ Sniper Mode Alerts — get emailed when problems match your criteria
✓ Unlimited saves & higher daily limits

Explore Pro Features: https://idearupt.ai/feed

Questions? Reply to this email — I read every one.

---
(c) 2026 Idearupt | Privacy: https://idearupt.ai/privacy | Terms: https://idearupt.ai/terms`;

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
      subject: "Welcome to Idearupt Pro — you're all set!",
      html: htmlContent,
      text: textContent,
      headers: {
        "List-Unsubscribe": "<mailto:hello@idearupt.ai?subject=unsubscribe>",
        "X-Entity-Ref-ID": crypto.randomUUID(),
      },
    }),
  });

  if (!res.ok) {
    const errData = await res.text();
    throw new Error(`Resend error: ${errData}`);
  }
}

async function sendCancellationEmail(email: string, isEarlyAdopter: boolean = false): Promise<void> {
  const firstName = email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] || "Builder";
  const capFirst = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const checkoutBase = isEarlyAdopter ? CHECKOUT_9 : CHECKOUT_19;
  const priceLabel = isEarlyAdopter ? "$9/mo" : "$19/mo";
  const cUrl = `${checkoutBase}?checkout[email]=${encodeURIComponent(email)}`;

  // Build mailto links for feedback reasons
  const feedbackReasons = [
    { label: "Too expensive", subject: "Cancellation feedback: Too expensive", body: "I cancelled because the price was too high." },
    { label: "Didn't use it enough", subject: "Cancellation feedback: Didn't use it enough", body: "I cancelled because I didn't use Idearupt enough." },
    { label: "Missing features", subject: "Cancellation feedback: Missing features", body: "I cancelled because features I needed were missing:" },
    { label: "Found an alternative", subject: "Cancellation feedback: Found an alternative", body: "I cancelled because I found an alternative:" },
    { label: "Other reason", subject: "Cancellation feedback: Other", body: "I cancelled because:" },
  ];

  const feedbackPills = feedbackReasons
    .map(
      (r) =>
        `<a href="mailto:bhavesh@idearupt.ai?subject=${encodeURIComponent(r.subject)}&body=${encodeURIComponent(r.body)}" style="display:inline-block;padding:8px 16px;margin:0 6px 8px 0;background-color:#27272a;border:1px solid #3f3f46;border-radius:20px;color:#d4d4d8;font-size:13px;font-weight:500;text-decoration:none;line-height:1.3;">${r.label}</a>`
    )
    .join("");

  const feedbackPillsText = feedbackReasons
    .map((r) => `- ${r.label}: mailto:bhavesh@idearupt.ai?subject=${encodeURIComponent(r.subject)}`)
    .join("\n");

  const htmlContent = `<!DOCTYPE html>
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
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#f4f4f5;line-height:1.3;">Where did we lose you?</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#a1a1aa;">Hey ${capFirst}, sorry to see you go. Your Pro access stays active until the end of your current billing period.</p>

          <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#a1a1aa;">If you have a second, I'd love to know why you cancelled. Just tap a reason:</p>

          <!-- Feedback reason pills -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="padding:0;line-height:2.2;">
              ${feedbackPills}
            </td></tr>
          </table>

          <p style="margin:0 0 24px;font-size:14px;line-height:1.65;color:#71717a;">Your feedback helps me make Idearupt better for everyone.</p>

          <!-- Re-subscribe CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);border-radius:8px;">
              <a href="${cUrl}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Re-subscribe to Pro &mdash; ${priceLabel} &rarr;</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a;">&#8212; Bhavesh</p>
        </td></tr>
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #27272a;"></div></td></tr>
        <tr><td style="padding:20px 32px 28px;">
          <p style="margin:0 0 4px;font-size:12px;color:#52525b;">&copy; 2026 Idearupt &middot; <a href="https://idearupt.ai/privacy" style="color:#8B5CF6;text-decoration:none;">Privacy</a> &middot; <a href="https://idearupt.ai/terms" style="color:#8B5CF6;text-decoration:none;">Terms</a></p>
          <p style="margin:0;font-size:11px;color:#3f3f46;">You're receiving this because you cancelled your Idearupt Pro subscription</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textContent = `Where did we lose you?

Hey ${capFirst}, sorry to see you go. Your Pro access stays active until the end of your current billing period.

If you have a second, I'd love to know why you cancelled:

${feedbackPillsText}

Your feedback helps me make Idearupt better for everyone.

Re-subscribe to Pro — ${priceLabel}: ${cUrl}

— Bhavesh

---
(c) 2026 Idearupt | Privacy: https://idearupt.ai/privacy | Terms: https://idearupt.ai/terms`;

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
      subject: "Where did we lose you?",
      html: htmlContent,
      text: textContent,
      headers: {
        "List-Unsubscribe": "<mailto:hello@idearupt.ai?subject=unsubscribe>",
        "X-Entity-Ref-ID": crypto.randomUUID(),
      },
    }),
  });

  if (!res.ok) {
    const errData = await res.text();
    throw new Error(`Resend error: ${errData}`);
  }
}
