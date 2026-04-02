import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

/**
 * ProtectedRoute — guards routes that require authentication.
 * Also forces onboarding: if the user hasn't completed their Builder DNA,
 * they get redirected to /onboarding before seeing the feed.
 */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const toastShown = useRef(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Skip onboarding check if already ON the onboarding page
  const isOnboardingPage = location.pathname === "/onboarding";

  useEffect(() => {
    if (!user || isOnboardingPage) {
      setOnboardingChecked(true);
      return;
    }

    let cancelled = false;

    const check = async (attempt = 1) => {
      try {
        const [dnaRes, userRes] = await Promise.all([
          supabase.from("builder_dna").select("id").eq("user_id", user.id).maybeSingle(),
          supabase.from("users").select("onboarding_completed, is_banned").eq("id", user.id).maybeSingle(),
        ]);

        // If user row doesn't exist yet (race condition on first login), retry
        if (!userRes.data && attempt <= 3) {
          await new Promise((r) => setTimeout(r, attempt * 500));
          if (!cancelled) return check(attempt + 1);
          return;
        }

        if (cancelled) return;

        // Ban check — if user is banned, sign out and redirect
        if (userRes.data?.is_banned) {
          toast.error("Your account has been suspended. Contact support if you believe this is an error.");
          supabase.auth.signOut();
          return;
        }

        const hasDna = !!dnaRes.data;
        const hasOnboarded = !!userRes.data?.onboarding_completed;
        // Also check localStorage fallback
        const localDone = localStorage.getItem(`onboarding_done_${user.id}`) === "true";

        setNeedsOnboarding(!hasDna && !hasOnboarded && !localDone);
        setOnboardingChecked(true);
      } catch {
        if (!cancelled) {
          setOnboardingChecked(true);
        }
      }
    };

    check();
    return () => { cancelled = true; };
  }, [user?.id, isOnboardingPage]);

  if (loading || (!onboardingChecked && !isOnboardingPage)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'rgba(139,92,246,0.3)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!user) {
    if (!toastShown.current) {
      toastShown.current = true;
      toast.info("Please log in to continue");
    }
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  // Force onboarding if not completed (unless already on /onboarding)
  if (needsOnboarding && !isOnboardingPage) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
