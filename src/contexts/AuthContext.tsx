import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { identifyUser, resetAnalytics, trackEvent, EVENTS } from "@/lib/analytics";
import { getStoredRefCode, getStoredUtmParams, getStoredLandingReferrer, clearReferralData } from "@/lib/referral";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const upsertedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    // Helper to safely upsert user row via SECURITY DEFINER RPC
    // (bypasses RLS — fixes "permission denied for table users")
    // Returns a promise so callers can await if needed.
    const ensureUserRow = (currentUser: User): Promise<void> => {
      if (upsertedRef.current.has(currentUser.id)) return Promise.resolve();
      upsertedRef.current.add(currentUser.id);
      // Wrap in Promise.resolve() because Supabase .rpc() returns a thenable, not a full Promise
      return Promise.resolve(
        supabase.rpc("ensure_user_row", {
          p_email: currentUser.email || "",
        })
      ).then(() => {
        // Save device fingerprint + IP if stored during signup
        const fp = sessionStorage.getItem("ir_device_fp");
        if (!fp) return;

        const flagged = sessionStorage.getItem("ir_flag_duplicate") === "1";
        const trialAbused = sessionStorage.getItem("ir_trial_abused") === "1";
        const signupIp = sessionStorage.getItem("ir_signup_ip");

        // Save fingerprint + IP to user row
        Promise.resolve(supabase.rpc("save_user_fingerprint", {
          p_fingerprint: fp,
          p_flagged: flagged,
          p_ip: signupIp || null,
        })).catch(() => {});

        // If trial was abused on this device, skip trial
        if (trialAbused) {
          supabase.from("users")
            .update({ subscription_status: "free", trial_ends_at: null })
            .eq("id", currentUser.id)
            .then(() => {
              // Notify UI after short delay
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("ir_trial_denied"));
              }, 1500);
            })
            .catch(() => {
              // Still notify UI even if DB update fails — block trial access
              window.dispatchEvent(new CustomEvent("ir_trial_denied"));
            });
        }

        // Cleanup session flags
        sessionStorage.removeItem("ir_device_fp");
        sessionStorage.removeItem("ir_trial_abused");
        sessionStorage.removeItem("ir_flag_duplicate");
        sessionStorage.removeItem("ir_signup_ip");

        // Save UTM + referral + landing referrer data (fire-and-forget)
        const refCode = getStoredRefCode();
        const utm = getStoredUtmParams();
        const landingReferrer = getStoredLandingReferrer();
        if (refCode || utm?.source || landingReferrer) {
          Promise.resolve(supabase.rpc("save_user_signup_meta", {
            p_utm_source: utm?.source || null,
            p_utm_medium: utm?.medium || null,
            p_utm_campaign: utm?.campaign || null,
            p_referred_by: refCode || null,
            p_landing_referrer: landingReferrer || null,
          })).then(() => clearReferralData()).catch(() => {});
        }
      }).catch(() => {
        // Non-blocking — user row already exists or RPC not yet deployed
      });
    };

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        initializedRef.current = true;

        if (currentSession?.user) {
          // Fire-and-forget: create user row in background, don't block loading
          ensureUserRow(currentSession.user);
          identifyUser(currentSession.user.id, currentSession.user.email);
        }
        setLoading(false);

        // Only track signup/login on actual SIGNED_IN events — NOT on
        // INITIAL_SESSION or TOKEN_REFRESHED which fire on every page load
        if (event === "SIGNED_IN" && currentSession?.user) {
          const createdAt = new Date(currentSession.user.created_at).getTime();
          const isNewUser = Date.now() - createdAt < 60_000;
          const method = currentSession.user.app_metadata?.provider || "email";

          // Guard: skip if this is just a page refresh / session recovery.
          // Supabase v2 fires SIGNED_IN on page load when recovering a session.
          // We only want to track on actual user-initiated sign-in flows.
          // A real sign-in sets a flag; session recovery does not.
          const isRealSignIn = sessionStorage.getItem("ir_auth_initiated");

          if (isNewUser && !sessionStorage.getItem("ir_signup_tracked")) {
            // Brand-new user — track signup only once per session
            trackEvent(EVENTS.SIGNUP_COMPLETED, { method });
            sessionStorage.setItem("ir_signup_tracked", "1");

            // Send welcome email for OAuth users
            const isOAuth = method !== "email";
            if (isOAuth && currentSession.user.email) {
              supabase.functions.invoke("send-welcome-email", {
                body: {
                  email: currentSession.user.email,
                  name: currentSession.user.user_metadata?.full_name || currentSession.user.user_metadata?.name || "",
                },
              }).then((res) => {
                if (res.error) console.warn("Welcome email failed:", res.error.message);
              }).catch(() => {});
            }
          } else if (!isNewUser && isRealSignIn) {
            // Returning user — track login only on actual sign-in, not page refresh
            if (!sessionStorage.getItem("ir_login_tracked")) {
              trackEvent(EVENTS.LOGIN_COMPLETED, { method });
              sessionStorage.setItem("ir_login_tracked", "1");
            }
          }
          // Clear the auth-initiated flag after handling
          sessionStorage.removeItem("ir_auth_initiated");
        }
        if (event === "SIGNED_OUT") {
          resetAnalytics();
        }
      }
    );

    // Get initial session — only set state if onAuthStateChange hasn't fired yet
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (initialSession?.user) {
        ensureUserRow(initialSession.user);
      }
      if (!initializedRef.current) {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setLoading(false);
      }
    }).catch(() => {
      // Session fetch failed (e.g. network issue) — set loading false immediately
      if (!initializedRef.current) {
        initializedRef.current = true;
        setLoading(false);
      }
    });
    // Safety net — never let loading stay true for more than 3 seconds
    const safetyTimeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) initializedRef.current = true;
        return false;
      });
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Force clear local state even if signOut API fails
      setSession(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
