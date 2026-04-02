/**
 * Centralized Lemon Squeezy checkout URL builder.
 *
 * Three variants:
 *   - early_adopter:    $9/mo  (no trial — locked forever for flagged users)
 *   - standard:         $19/mo (includes 7-day trial — for NEW users only)
 *   - standard_no_trial: $19/mo (no trial — for users who already used a trial)
 *
 * Every upgrade button in the app imports from here.
 * Early adopters are auto-detected via useProStatus().isEarlyAdopter
 * and routed to the $9 checkout. All other users see $19.
 *
 * Past trial users (plan_status='free', 'cancelled', 'past_due', or trial_ends_at
 * in the past) get the no-trial $19 variant so they can't double-dip.
 */

import { getStoredRefCode } from "@/lib/referral";

const CHECKOUT_URLS: Record<string, string> = {
  early_adopter:
    "https://idearupt.lemonsqueezy.com/checkout/buy/59b85633-b196-48e0-8324-28a4c365ce98",
  standard:
    "https://idearupt.lemonsqueezy.com/checkout/buy/d5f33458-36d9-4b0e-9f2b-2e7c79dfab76",
  standard_no_trial:
    "https://idearupt.lemonsqueezy.com/checkout/buy/b7ea618b-4994-4d89-b36d-b63f25f6603a",
};

/** The plan that all in-app upgrade CTAs default to for non-early-adopters. */
export const DEFAULT_PLAN = "standard";

/** Price per month for each plan. Used in button labels. */
export const PLAN_PRICES: Record<string, number> = {
  early_adopter: 9,
  standard: 19,
  standard_no_trial: 19,
};

/** Get the right plan key based on early adopter flag. */
export function getPlanForUser(isEarlyAdopter: boolean): string {
  return isEarlyAdopter ? "early_adopter" : "standard";
}

/** Get the display price string based on early adopter flag. */
export function getPriceLabel(isEarlyAdopter: boolean): string {
  return isEarlyAdopter ? "$9/mo" : "$19/mo";
}

/** Get the numeric price based on early adopter flag. */
export function getPrice(isEarlyAdopter: boolean): number {
  return isEarlyAdopter ? 9 : 19;
}

/**
 * Resolve the correct checkout variant based on the user's journey stage.
 * - Early adopters → always $9 (no trial)
 * - New users who never had a trial → $19 with 7-day trial
 * - Past trial users → $19 without trial
 */
export function resolveCheckoutPlan(
  basePlan: string,
  hasUsedTrial: boolean,
): string {
  // Early adopters always get their variant (no trial built in)
  if (basePlan === "early_adopter") return "early_adopter";
  // Past trial users get the no-trial $19 variant
  if (hasUsedTrial) return "standard_no_trial";
  // New users get the trial-enabled $19 variant
  return "standard";
}

/**
 * Build a Lemon Squeezy checkout URL with pre-filled email + user_id.
 * The email prefill is mandatory — without it the webhook cannot match the
 * payment to the Supabase user.
 *
 * @param plan - "early_adopter" | "standard" | "standard_no_trial"
 * @param email - User's email for pre-fill
 * @param userId - User ID for webhook matching
 */
export function getCheckoutUrl(
  plan: string = DEFAULT_PLAN,
  email?: string,
  userId?: string,
): string {
  const baseUrl = CHECKOUT_URLS[plan] || CHECKOUT_URLS.standard;
  if (!baseUrl) return "/pricing";

  const parts: string[] = [];
  if (email) parts.push(`checkout[email]=${encodeURIComponent(email)}`);
  if (userId) parts.push(`checkout[custom][user_id]=${encodeURIComponent(userId)}`);
  // Pass referral code through to webhook for commission tracking
  const refCode = getStoredRefCode();
  if (refCode) parts.push(`checkout[custom][ref_code]=${encodeURIComponent(refCode)}`);
  // Redirect back to app after successful checkout
  parts.push(`checkout[success_url]=${encodeURIComponent("https://idearupt.ai/feed?checkout=success")}`);

  if (parts.length === 0) return baseUrl;
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}${parts.join("&")}`;
}

/**
 * Open checkout in a new tab. Call from any component:
 *   openCheckout("standard_no_trial", user?.email, user?.id)
 */
export function openCheckout(
  plan: string = DEFAULT_PLAN,
  email?: string,
  userId?: string,
): void {
  const url = getCheckoutUrl(plan, email, userId);
  window.open(url, "_blank");
}
