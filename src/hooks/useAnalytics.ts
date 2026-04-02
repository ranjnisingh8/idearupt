import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackEvent, startPageTimer } from "@/lib/analytics";

/**
 * Tracks page views + time-on-page for every route change.
 * Sends to: Google Analytics, PostHog, and Supabase page_events.
 */
const useAnalytics = () => {
  const location = useLocation();

  useEffect(() => {
    const url = location.pathname + location.search;

    // Google Analytics page view
    if (window.gtag) {
      window.gtag("config", "G-8CT6NK976S", { page_path: url });
    }

    // PostHog page view
    if (window.posthog) {
      window.posthog.capture("$pageview", {
        $current_url: window.location.origin + url,
      });
    }

    // Track page view in Supabase
    trackEvent("page_view", { page: location.pathname });

    // Start time-on-page timer — cleanup fires on route change or unmount
    const stopTimer = startPageTimer(location.pathname);
    return () => stopTimer();
  }, [location]);
};

export default useAnalytics;
