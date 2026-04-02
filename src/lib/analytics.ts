import { supabase } from "@/lib/supabase";
import { getStoredLandingReferrer } from "@/lib/referral";

// ─── Types ───────────────────────────────────────────
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    posthog?: {
      capture: (event: string, properties?: Record<string, any>) => void;
      identify: (distinctId: string, properties?: Record<string, any>) => void;
      reset: () => void;
    };
  }
}

// ─── Event names — use these everywhere ──────────────
export const EVENTS = {
  // Landing page
  CTA_HERO_CLICK: "cta_hero_click",
  CTA_EXPLORE_PROBLEMS: "cta_explore_problems",
  CTA_VALIDATE_IDEA: "cta_validate_idea",
  CTA_GET_STARTED: "cta_get_started",
  CTA_CLAIM_PRO: "cta_claim_pro",
  CTA_COMING_SOON_SIGNUP: "cta_coming_soon_signup",
  CTA_MID_PAGE: "cta_mid_page",
  WAITLIST_BANNER_SUBMIT: "waitlist_banner_submit",

  // App engagement
  IDEA_VIEWED: "idea_viewed",
  IDEA_SAVED: "idea_saved",
  IDEA_SHARED: "idea_shared",
  IDEA_UNSAVED: "idea_unsaved",
  BLUEPRINT_VIEWED: "blueprint_viewed",
  BLUEPRINT_TAB_SWITCHED: "blueprint_tab_switched",
  VALIDATION_STARTED: "validation_started",
  VALIDATION_COMPLETED: "validation_completed",
  VALIDATION_EXAMPLE_CLICKED: "validation_example_clicked",
  VALIDATION_VOICE_USED: "validation_voice_used",
  VALIDATION_LIMIT_REACHED: "validation_limit_reached",
  SIGNAL_VIEWED: "signal_viewed",
  SIGNAL_PLATFORM_FILTERED: "signal_platform_filtered",
  SIGNAL_EXPANDED: "signal_expanded",
  SIGNAL_EXTERNAL_CLICKED: "signal_external_clicked",
  USE_CASE_VIEWED: "use_case_viewed",
  USECASE_SEARCHED: "usecase_searched",
  USECASE_FILTERED: "usecase_filtered",
  USECASE_UPGRADE_CLICKED: "usecase_upgrade_clicked",

  // Feed actions
  FEED_SORT_CHANGED: "feed_sort_changed",
  FEED_CATEGORY_FILTERED: "feed_category_filtered",
  FEED_SEARCH_PERFORMED: "feed_search_performed",
  FEED_LOAD_MORE: "feed_load_more",

  // Saved / Settings
  SAVED_IDEA_OPENED: "saved_idea_opened",
  SETTINGS_PROFILE_UPDATED: "settings_profile_updated",
  SETTINGS_NOTIFICATION_TOGGLED: "settings_notification_toggled",
  SETTINGS_SIGNOUT: "settings_signout",

  // Share / Waitlist
  SHARE_MODAL_OPENED: "share_modal_opened",
  WAITLIST_MODAL_OPENED: "waitlist_modal_opened",
  WAITLIST_JOINED: "waitlist_joined",

  // Leaderboard
  LEADERBOARD_VIEWED: "leaderboard_viewed",

  // User actions
  QUIZ_STARTED: "quiz_started",
  QUIZ_COMPLETED: "quiz_completed",
  ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",
  ONBOARDING_SKIPPED: "onboarding_skipped",
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",
  LOGIN_COMPLETED: "login_completed",
  SESSION_START: "session_start",

  // Error & confusion tracking
  ERROR_JS: "error_js",
  ERROR_API: "error_api",
  RAGE_CLICK: "rage_click",
  DEAD_CLICK: "dead_click",
} as const;

// ─── Core tracking function ──────────────────────────
export function trackEvent(
  event: string,
  properties?: Record<string, any>
) {
  // Use the stored landing referrer (first external referrer) if available,
  // falling back to document.referrer. This ensures we track the original
  // traffic source even after internal navigation clears document.referrer.
  const landingRef = getStoredLandingReferrer();
  const enriched = {
    ...properties,
    timestamp: new Date().toISOString(),
    page_url: window.location.pathname,
    referrer: landingRef || document.referrer || undefined,
  };

  // 1. PostHog (primary — has session recording, funnels, etc.)
  if (window.posthog) {
    window.posthog.capture(event, enriched);
  }

  // 2. Google Analytics (backup + SEO attribution)
  if (window.gtag) {
    window.gtag("event", event, enriched);
  }

  // 3. Supabase page_events table (queryable in your dashboard)
  // Fire and forget — don't block the UI.
  // Only insert if user is authenticated — RLS requires auth.uid() IS NOT NULL.
  // Unauthenticated visitors (landing page) are tracked via PostHog/GA only.
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session?.user) return; // Skip DB insert for anonymous visitors
    supabase
      .from("page_events")
      .insert({
        event_name: event,
        event_data: enriched,
        page_url: window.location.pathname,
        session_id: getSessionId(),
      })
      .then(() => {});
  });
}

// ─── Identify user in PostHog (call on login) ────────
export function identifyUser(userId: string, email?: string) {
  if (window.posthog) {
    window.posthog.identify(userId, {
      email: email || undefined,
      signed_up_at: new Date().toISOString(),
    });
  }
}

// ─── Reset analytics on logout ───────────────────────
export function resetAnalytics() {
  if (window.posthog) {
    window.posthog.reset();
  }
}

// ─── Session ID (persists per browser tab session) ───
function getSessionId(): string {
  let sid = sessionStorage.getItem("ir_session_id");
  if (!sid) {
    sid = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("ir_session_id", sid);
  }
  return sid;
}

// ─── Time-on-page tracker ────────────────────────────
// Call startPageTimer() when a page mounts, call the returned function on unmount.
// It sends a "time_on_page" event with the duration in seconds.
export function startPageTimer(pageName: string): () => void {
  const start = Date.now();
  return () => {
    const seconds = Math.round((Date.now() - start) / 1000);
    if (seconds > 2) {
      // Only track if they spent more than 2 seconds (filters out bounces)
      trackEvent("time_on_page", { page: pageName, duration_seconds: seconds });
    }
  };
}
