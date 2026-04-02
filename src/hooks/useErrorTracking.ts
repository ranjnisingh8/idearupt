import { useEffect, useRef } from "react";
import { trackEvent, EVENTS } from "@/lib/analytics";

/**
 * Global error & confusion tracking hook.
 * Add once in App.tsx to capture:
 * - JS runtime errors (window.onerror, unhandledrejection)
 * - Rage clicks (3+ clicks on same element within 1s)
 * - Dead clicks (clicks on non-interactive elements)
 *
 * All events flow through trackEvent() → PostHog + GA + Supabase page_events.
 */
const useErrorTracking = () => {
  const rageClickRef = useRef<{ target: string; count: number; timer: ReturnType<typeof setTimeout> | null }>({
    target: "",
    count: 0,
    timer: null,
  });
  const trackedErrorsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // ─── JS Error Handler ─────────────────────────────
    const handleError = (event: ErrorEvent) => {
      // Ignore errors from browser extensions and third-party scripts
      const filename = event.filename || "";
      if (
        filename.includes("extension://") ||
        filename.includes("moz-extension://") ||
        filename === "" ||
        (!filename.startsWith(window.location.origin) && !filename.includes("localhost"))
      ) {
        return;
      }

      const key = `${event.message}:${event.filename}:${event.lineno}`;
      // Deduplicate: don't track the same error repeatedly in one session
      if (trackedErrorsRef.current.has(key)) return;
      trackedErrorsRef.current.add(key);

      trackEvent(EVENTS.ERROR_JS, {
        message: event.message?.substring(0, 200),
        filename: event.filename?.split("/").pop(),
        line: event.lineno,
        col: event.colno,
        page: window.location.pathname,
      });
    };

    // ─── Unhandled Promise Rejection Handler ──────────
    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason?.message || event.reason?.toString?.() || "Unknown rejection";
      // Skip known non-critical rejections (fire-and-forget calls, extensions, browser noise)
      if (
        message === "Unknown rejection" ||
        message === "Rejected" ||
        message.includes("has already been declared") ||
        message.includes("Failed to fetch") ||
        message.includes("Load failed") ||
        message.includes("NetworkError") ||
        message.includes("MetaMask") ||
        message.includes("ServiceWorker") ||
        message.includes("service worker") ||
        message.includes("connect to") ||
        message.includes("ethereum")
      ) {
        return;
      }

      const key = `rejection:${message}`;
      if (trackedErrorsRef.current.has(key)) return;
      trackedErrorsRef.current.add(key);

      trackEvent(EVENTS.ERROR_JS, {
        message: message.substring(0, 200),
        type: "unhandled_rejection",
        page: window.location.pathname,
      });
    };

    // ─── Rage Click Detector ──────────────────────────
    // 3+ clicks on the same element within 1 second
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target) return;

      const selector = getElementSelector(target);
      const ref = rageClickRef.current;

      if (ref.target === selector) {
        ref.count++;
        if (ref.count >= 3) {
          trackEvent(EVENTS.RAGE_CLICK, {
            element: selector,
            clicks: ref.count,
            page: window.location.pathname,
          });
          // Reset so we don't flood with events
          ref.count = 0;
          ref.target = "";
          if (ref.timer) clearTimeout(ref.timer);
          ref.timer = null;
        }
      } else {
        // New target — reset counter
        ref.target = selector;
        ref.count = 1;
        if (ref.timer) clearTimeout(ref.timer);
        ref.timer = setTimeout(() => {
          ref.count = 0;
          ref.target = "";
        }, 1000);
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
      document.removeEventListener("click", handleClick, true);
      if (rageClickRef.current.timer) clearTimeout(rageClickRef.current.timer);
    };
  }, []);
};

/**
 * Generate a readable CSS selector for an element.
 * e.g. "button.btn-gradient", "div.surface-card > p", "a[href='/feed']"
 */
function getElementSelector(el: HTMLElement): string {
  const tag = el.tagName?.toLowerCase() || "unknown";
  const id = el.id ? `#${el.id}` : "";
  const classes = el.className && typeof el.className === "string"
    ? "." + el.className.split(" ").filter(Boolean).slice(0, 2).join(".")
    : "";
  const text = el.textContent?.trim().substring(0, 20) || "";
  return `${tag}${id}${classes}${text ? ` "${text}"` : ""}`.substring(0, 100);
}

export default useErrorTracking;
