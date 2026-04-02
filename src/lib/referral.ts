/**
 * UTM + Referral capture utilities.
 *
 * Uses localStorage (survives OAuth redirects like Google sign-in).
 * - Referral codes: first-touch attribution (don't overwrite within 30 days)
 * - UTM params: last-touch attribution (always take latest)
 */

import { supabase } from "@/lib/supabase";

// localStorage keys
const KEY_REF_CODE = "ir_ref_code";
const KEY_REF_TS = "ir_ref_ts";
const KEY_UTM_SOURCE = "ir_utm_source";
const KEY_UTM_MEDIUM = "ir_utm_medium";
const KEY_UTM_CAMPAIGN = "ir_utm_campaign";
const KEY_LANDING_REFERRER = "ir_landing_referrer";

// 30-day expiry for referral codes (in ms)
const REF_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Capture UTM and referral params from the current URL.
 * Should be called once on app mount (in App.tsx).
 */
export function captureUrlParams(): void {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);

  // ── Referral code (first-touch, 30-day expiry) ──
  const refCode = params.get("ref");
  if (refCode && refCode.length >= 4) {
    const existingTs = localStorage.getItem(KEY_REF_TS);
    const isExpired = !existingTs || Date.now() - Number(existingTs) > REF_EXPIRY_MS;
    const noExisting = !localStorage.getItem(KEY_REF_CODE);

    if (noExisting || isExpired) {
      localStorage.setItem(KEY_REF_CODE, refCode.toUpperCase());
      localStorage.setItem(KEY_REF_TS, String(Date.now()));
    }

    // Track click (fire-and-forget, works even for anonymous visitors)
    trackReferralClick(refCode.toUpperCase());
  }

  // ── UTM params (last-touch, always overwrite) ──
  const utmSource = params.get("utm_source");
  const utmMedium = params.get("utm_medium");
  const utmCampaign = params.get("utm_campaign");

  if (utmSource) localStorage.setItem(KEY_UTM_SOURCE, utmSource);
  if (utmMedium) localStorage.setItem(KEY_UTM_MEDIUM, utmMedium);
  if (utmCampaign) localStorage.setItem(KEY_UTM_CAMPAIGN, utmCampaign);

  // ── Landing referrer (first-touch, capture once per visitor) ──
  // document.referrer is only set on the very first page load from an external site.
  // After internal navigation it becomes the current domain or empty.
  // We save it once so it survives through signup/OAuth flows.
  if (!localStorage.getItem(KEY_LANDING_REFERRER)) {
    const ref = document.referrer || "";
    // Only store if it's an external referrer (not our own domain)
    if (ref && !ref.includes("idearupt.") && !ref.includes("localhost")) {
      localStorage.setItem(KEY_LANDING_REFERRER, ref);
    }
  }
}

/**
 * Get stored referral code (if any, and not expired).
 */
export function getStoredRefCode(): string | null {
  if (typeof window === "undefined") return null;
  const code = localStorage.getItem(KEY_REF_CODE);
  const ts = localStorage.getItem(KEY_REF_TS);
  if (!code) return null;
  // Check expiry
  if (ts && Date.now() - Number(ts) > REF_EXPIRY_MS) {
    localStorage.removeItem(KEY_REF_CODE);
    localStorage.removeItem(KEY_REF_TS);
    return null;
  }
  return code;
}

/**
 * Get stored UTM params.
 */
export function getStoredUtmParams(): { source: string | null; medium: string | null; campaign: string | null } {
  if (typeof window === "undefined") return { source: null, medium: null, campaign: null };
  return {
    source: localStorage.getItem(KEY_UTM_SOURCE),
    medium: localStorage.getItem(KEY_UTM_MEDIUM),
    campaign: localStorage.getItem(KEY_UTM_CAMPAIGN),
  };
}

/**
 * Get the original landing referrer URL (first-touch, external only).
 */
export function getStoredLandingReferrer(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_LANDING_REFERRER);
}

/**
 * Clear all referral/UTM data from localStorage.
 * Called after successfully saving to DB.
 */
export function clearReferralData(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_REF_CODE);
  localStorage.removeItem(KEY_REF_TS);
  localStorage.removeItem(KEY_UTM_SOURCE);
  localStorage.removeItem(KEY_UTM_MEDIUM);
  localStorage.removeItem(KEY_UTM_CAMPAIGN);
  localStorage.removeItem(KEY_LANDING_REFERRER);
}

/**
 * Track a referral link click (fire-and-forget).
 */
function trackReferralClick(refCode: string): void {
  supabase.rpc("increment_referral_click", { p_ref_code: refCode }).then(() => {}).catch(() => {});
}
