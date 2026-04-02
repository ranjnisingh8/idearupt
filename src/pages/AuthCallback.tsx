import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

/**
 * OAuth callback landing page — handles PKCE code exchange.
 * Supabase PKCE flow redirects here with ?code=... after Google auth.
 * We explicitly call exchangeCodeForSession to trade the code for a session,
 * then navigate to /feed. AuthContext.onAuthStateChange fires automatically.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");

    if (code) {
      // PKCE flow: exchange authorization code for session
      supabase.auth.exchangeCodeForSession(code)
        .then(() => navigate("/feed", { replace: true }))
        .catch(() => navigate("/auth?error=callback_failed", { replace: true }));
    } else {
      // No code param — fall back to auth page after a short wait
      // (handles edge cases like direct navigation to this URL)
      const timer = setTimeout(() => navigate("/auth", { replace: true }), 3000);
      return () => clearTimeout(timer);
    }
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-[#7C6AED] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
