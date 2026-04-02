// ─── Idearupt Feature Flags & Pricing Config ─────────────────

/** Admin emails — hardcoded for simplicity. Must match SQL migration. */
export const ADMIN_EMAILS: string[] = ["garagefitness4@gmail.com"];

/** When true, free-tier limits are enforced and upgrade modals appear. */
export const PAYMENTS_ENABLED = true;

/** Trial duration in days. */
export const TRIAL_DAYS = 7;

/**
 * Free tier daily limits (after trial expires).
 * Free users see 3 ideas/signals/use cases per day — fully unlocked within
 * those views (no blurred content). The paywall is on view count, not content.
 * DEFINITIVE — keep in sync with lifecycle emails, pricing page, and edge functions.
 */
export const FREE_LIMITS: Record<string, number> = {
  idea_view: 3,
  signal_view: 3,
  use_case_view: 3,
  save: 2,
  blueprint: 1,           // free users get 1 blueprint per day
  validation: 1,
  competitor_analysis: 1,  // free users get 1 competitor analysis per day
  competitors: 1,          // alias — edge functions use "competitors" as the DB key
  deep_dive: 1,
  remix: 1,
  radar_view: 3,           // free users see 3 pain radar cards
  alert_create: 0,         // free users can't create alerts
  matching: 3,             // Builder DNA idea matching — edge function uses "matching" key
};

/** Backward-compat: old code uses FREE_SAVE_LIMIT. Now derived from FREE_LIMITS. */
export const FREE_SAVE_LIMIT = FREE_LIMITS.save;

/**
 * Public-facing platform stats — single source of truth.
 * Used on landing page, pricing page, auth page, and in-app copy.
 * Update these when real DB counts exceed them.
 */
export const PLATFORM_STATS = {
  problemsFound: 749,
  problemsValidated: 300,
  buildersActive: 140,
} as const;

/**
 * Trial & Pro tier daily limits (identical).
 * Trial = 7-day free trial. Pro = paid $19/mo (or $9/mo for early adopters).
 */
export const TRIAL_LIMITS: Record<string, number> = {
  idea_view: 8,
  signal_view: 8,
  use_case_view: 8,
  save: 5,
  blueprint: 3,
  validation: 3,
  competitor_analysis: 3,
  competitors: 3, // alias — edge functions use "competitors" as the DB key
  deep_dive: 2,
  remix: 2,
  radar_view: 50,           // Pro: 50 pain radar cards
  alert_create: 5,          // Pro: up to 5 alerts
  matching: 10,             // Builder DNA idea matching — edge function uses "matching" key
};
