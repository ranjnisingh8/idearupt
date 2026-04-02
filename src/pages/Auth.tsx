import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Zap, Mail, Loader2, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getOrCreateFingerprint } from "@/lib/fingerprint";
import { isDisposableEmail } from "@/lib/disposableEmails";
import { PLATFORM_STATS } from "@/lib/config";

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Support URL params: ?redirect=pricing&action=joinwaitlist&mode=login
  // Whitelist allowed redirect paths to prevent open redirect attacks
  const SAFE_REDIRECTS = ["feed", "pricing", "settings", "validate", "onboarding", "use-cases", "signals", "quiz", "changelog", "radar", "alerts"];
  const SAFE_ACTIONS = ["joinwaitlist"];
  const searchParams = new URLSearchParams(location.search);
  const urlRedirect = searchParams.get("redirect");
  const urlAction = searchParams.get("action");
  const urlMode = searchParams.get("mode");

  // Default to login if ?mode=login is in URL, otherwise signup
  const [isLogin, setIsLogin] = useState(urlMode === "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const safeRedirect = urlRedirect && SAFE_REDIRECTS.includes(urlRedirect) ? urlRedirect : null;
  const safeAction = urlAction && SAFE_ACTIONS.includes(urlAction) ? urlAction : null;
  const redirectTo = safeRedirect
    ? `/${safeRedirect}${safeAction ? `?action=${safeAction}` : ""}`
    : (location.state as any)?.from || "/feed";

  // Listen for trial denied events from AuthContext
  useEffect(() => {
    const handler = () => {
      toast({
        title: "Trial not available",
        description: "It looks like you've already used a free trial. Upgrade to Pro for unlimited access.",
      });
    };
    window.addEventListener("ir_trial_denied", handler);
    return () => window.removeEventListener("ir_trial_denied", handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const checkOnboarding = async (attempt = 1): Promise<void> => {
      try {
        // Check BOTH builder_dna and users.onboarding_completed — either means "done"
        const [dnaRes, userRes] = await Promise.all([
          supabase.from("builder_dna").select("id").eq("user_id", user.id).maybeSingle(),
          supabase.from("users").select("onboarding_completed").eq("id", user.id).maybeSingle(),
        ]);

        // If user row doesn't exist yet (ensure_user_row RPC still running), retry
        if (!userRes.data && attempt <= 3) {
          await new Promise((r) => setTimeout(r, attempt * 600));
          if (!cancelled) return checkOnboarding(attempt + 1);
          return;
        }

        if (cancelled) return;
        const hasDna = !!dnaRes.data;
        const hasOnboarded = !!userRes.data?.onboarding_completed;
        navigate((hasDna || hasOnboarded) ? redirectTo : "/onboarding", { replace: true });
      } catch {
        if (!cancelled) navigate(redirectTo, { replace: true });
      }
    };
    checkOnboarding();

    return () => { cancelled = true; };
  }, [user, navigate, redirectTo]);

  const validateEmail = (v: string) => {
    if (!v) { setEmailError("Email is required"); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setEmailError("Please enter a valid email address"); return false; }
    setEmailError(""); return true;
  };

  const validatePassword = (v: string) => {
    if (!v) { setPasswordError("Password is required"); return false; }
    if (v.length < 6) { setPasswordError("Password must be at least 6 characters"); return false; }
    setPasswordError(""); return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const eValid = validateEmail(email);
    const pValid = validatePassword(password);
    if (!eValid || !pValid) return;

    // ─── Disposable email check (signup only) ───
    if (!isLogin && isDisposableEmail(email)) {
      toast({
        title: "Invalid email",
        description: "Please use a permanent email address to sign up.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    // ─── Fingerprint abuse check (signup only) ───
    if (!isLogin) {
      try {
        const fingerprint = await getOrCreateFingerprint();

        // Log signup attempt for rate limiting
        await supabase.from("signup_attempts").insert({
          email,
          fingerprint,
        });

        // Check for abuse
        const { data: abuseCheck } = await supabase.rpc(
          "check_fingerprint_abuse",
          { p_fingerprint: fingerprint }
        );

        if (abuseCheck?.blocked) {
          toast({
            title: "Signup limit reached",
            description: "Too many accounts created. Please try again later or contact support.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Store flags for AuthContext to apply after user row creation
        if (abuseCheck?.trial_used) {
          sessionStorage.setItem("ir_trial_abused", "1");
        }
        if (abuseCheck?.flag_duplicate) {
          sessionStorage.setItem("ir_flag_duplicate", "1");
        }

        // Store fingerprint for AuthContext to save to user row
        sessionStorage.setItem("ir_device_fp", fingerprint);

        // Capture IP for abuse tracking (fire-and-forget with 3s timeout, never blocks signup)
        const ipCtrl = new AbortController();
        const ipTimeout = setTimeout(() => ipCtrl.abort(), 3000);
        fetch("https://api.ipify.org?format=json", { signal: ipCtrl.signal })
          .then((r) => r.json())
          .then((d) => { if (d?.ip) sessionStorage.setItem("ir_signup_ip", d.ip); })
          .catch(() => {})
          .finally(() => clearTimeout(ipTimeout));
      } catch {
        // Fingerprint check failed — allow signup anyway (non-blocking)
      }
    }

    try {
      // Flag that this is a real user-initiated auth flow (not a page-refresh session recovery)
      sessionStorage.setItem("ir_auth_initiated", "1");

      // Helper: retry auth calls on network failures (mobile cold-start / flaky connections)
      const withRetry = async <T,>(fn: () => Promise<{ data: T; error: any }>, maxAttempts = 2): Promise<{ data: T; error: any }> => {
        let lastResult: { data: T; error: any } = { data: null as T, error: new Error("Unknown") };
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          lastResult = await fn();
          if (!lastResult.error) return lastResult;
          // Only retry on network-type errors, not credential errors
          const msg = lastResult.error?.message || "";
          if (!msg.includes("Load failed") && !msg.includes("Failed to fetch") && !msg.includes("NetworkError") && !msg.includes("network")) break;
          if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, 800 + attempt * 400));
        }
        return lastResult;
      };

      if (isLogin) {
        const { error } = await withRetry(() => supabase.auth.signInWithPassword({ email, password }));
        if (error) throw error;
      } else {
        const { data, error } = await withRetry(() => supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        }));
        if (error) throw error;
        // Check if user was actually created or if email confirmation is needed
        if (data?.user?.identities?.length === 0) {
          toast({ title: "Account already exists", description: "Try logging in instead.", variant: "destructive" });
          setIsLogin(true);
        } else if (data?.user && !data?.session) {
          // Email confirmation required
          setSignupSuccess(true);
          toast({ title: "Account created! 🎉", description: "Check your email to confirm, then log in." });
          // Fire-and-forget welcome email — use local `email` as fallback
          const welcomeEmail = data.user.email || email;
          supabase.functions.invoke("send-welcome-email", {
            body: { email: welcomeEmail, name: "" },
          }).catch(() => {});
        } else if (data?.session) {
          // Auto-confirmed, session exists - will redirect via useEffect
          toast({ title: "Account created! 🎉", description: "Let's get you set up." });
          // Fire-and-forget welcome email — use local `email` as fallback
          const welcomeEmail = data.user.email || email;
          supabase.functions.invoke("send-welcome-email", {
            body: { email: welcomeEmail, name: data.user.user_metadata?.name || "" },
          }).catch(() => {});
        } else {
          setSignupSuccess(true);
          toast({ title: "Account created! 🎉", description: "Check your email to confirm, then log in." });
          const welcomeEmail = data?.user?.email || email;
          if (welcomeEmail) {
            supabase.functions.invoke("send-welcome-email", {
              body: { email: welcomeEmail, name: "" },
            }).catch(() => {});
          }
        }
      }
    } catch (err: any) {
      const msg = err?.message || "Something went wrong";
      let friendlyMsg = msg;
      if (msg.includes("Invalid login credentials")) {
        friendlyMsg = "Account not found or wrong password. Try again or sign up.";
      } else if (msg.includes("Load failed") || msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        friendlyMsg = "Network error — please check your connection and try again.";
      } else if (msg.includes("Email not confirmed")) {
        friendlyMsg = "Please confirm your email first. Check your inbox for a verification link.";
      } else if (msg.includes("User already registered") || msg.includes("already been registered")) {
        friendlyMsg = "This email is already registered. Try logging in instead.";
        setIsLogin(true);
      } else if (msg.includes("Password should be")) {
        friendlyMsg = "Password is too weak. Use at least 6 characters.";
      } else if (msg.includes("rate limit") || msg.includes("too many requests")) {
        friendlyMsg = "Too many attempts. Please wait a moment and try again.";
      } else if (msg.includes("invalid") && msg.toLowerCase().includes("email")) {
        friendlyMsg = "Please enter a valid email address.";
      }
      toast({ title: "Error", description: friendlyMsg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      // Flag that this is a real user-initiated auth flow
      sessionStorage.setItem("ir_auth_initiated", "1");
      // Pre-generate fingerprint + capture IP before OAuth redirect
      try {
        const fp = await getOrCreateFingerprint();
        sessionStorage.setItem("ir_device_fp", fp);
        fetch("https://api.ipify.org?format=json")
          .then((r) => r.json())
          .then((d) => { if (d?.ip) sessionStorage.setItem("ir_signup_ip", d.ip); })
          .catch(() => {});
      } catch { /* non-blocking */ }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "OAuth failed", variant: "destructive" });
    }
  };

  if (signupSuccess) {
    return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient glow blobs */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(124,106,237,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <Link to="/" className="absolute top-4 left-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors z-10">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }} className="w-full max-w-sm text-center relative z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 20 }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', boxShadow: 'var(--shadow-lg), 0 0 24px rgba(124,106,237,0.25)' }}
          >
            <Mail className="w-8 h-8 text-white" />
          </motion.div>
          <h2 className="font-heading text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Check your email!</h2>
          <p className="font-body text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            We sent a confirmation link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>. Click it to activate your account, then log in.
          </p>
          <button onClick={() => { setSignupSuccess(false); setIsLogin(true); }} className="btn-gradient px-6 py-3 text-sm rounded-xl">
            Back to Login
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient glow blobs for premium depth */}
      <div className="absolute top-[20%] left-[15%] w-[500px] h-[500px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(124,106,237,0.07) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      <div className="absolute bottom-[15%] right-[10%] w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      <div className="absolute top-[60%] left-[50%] w-[300px] h-[300px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(124,106,237,0.04) 0%, transparent 70%)', filter: 'blur(60px)', transform: 'translateX(-50%)' }} />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }} className="w-full max-w-[400px] relative z-10">
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C6AED)', boxShadow: 'var(--shadow-md), 0 0 20px rgba(124,106,237,0.25)' }}>
            <Zap className="w-5 h-5 text-white" strokeWidth={2} />
          </div>
          <span className="font-heading text-2xl font-bold tracking-tight">Idea<span style={{ color: '#9585F2' }}>rupt</span></span>
        </Link>

        {/* Glass form card — premium frosted surface */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="glass-card p-7 sm:p-8"
          style={{ contain: "none" }}
        >
          <h2 className="font-heading text-xl font-bold text-center mb-1" style={{ color: 'var(--text-primary)' }}>
            {isLogin ? "Welcome back" : "Create your account"}
          </h2>
          <p className="font-body text-sm text-center mb-6" style={{ color: 'var(--text-secondary)' }}>
            {isLogin ? "Log in to your problem feed" : "Start your 7-day free Pro trial"}
          </p>

          {/* Google button — frosted glass style */}
          <button type="button" onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3.5 min-h-[48px] text-sm font-semibold transition-all duration-200 mb-5"
            style={{
              background: 'rgba(255,255,255,0.95)',
              color: '#1f1f1f',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.5)',
            }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }} />
            <span className="font-body text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-body text-[11px] uppercase tracking-[0.08em] font-semibold mb-2 block" style={{ color: 'var(--text-tertiary)' }}>Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value); }}
                  className={`w-full rounded-xl py-3 pl-10 pr-3 text-sm focus:outline-none transition-all duration-200 min-h-[48px] ${emailError ? "ring-1 ring-red-500/40" : ""}`}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${emailError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: 'var(--text-primary)',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)',
                  }}
                  onFocus={(e) => { if (!emailError) e.currentTarget.style.borderColor = 'rgba(124,106,237,0.4)'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.15), 0 0 0 3px rgba(124,106,237,0.08)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = emailError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.15)'; }}
                  placeholder="you@example.com" required autoFocus />
              </div>
              {emailError && <p className="font-body text-xs text-red-400 mt-1.5">{emailError}</p>}
            </div>
            <div>
              <label className="font-body text-[11px] uppercase tracking-[0.08em] font-semibold mb-2 block" style={{ color: 'var(--text-tertiary)' }}>Password</label>
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); if (passwordError) validatePassword(e.target.value); }}
                className={`w-full rounded-xl py-3 px-3.5 text-sm focus:outline-none transition-all duration-200 min-h-[48px] ${passwordError ? "ring-1 ring-red-500/40" : ""}`}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${passwordError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: 'var(--text-primary)',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)',
                }}
                onFocus={(e) => { if (!passwordError) e.currentTarget.style.borderColor = 'rgba(124,106,237,0.4)'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.15), 0 0 0 3px rgba(124,106,237,0.08)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = passwordError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.15)'; }}
                placeholder="••••••••" required />
              {passwordError && <p className="font-body text-xs text-red-400 mt-1.5">{passwordError}</p>}
            </div>
            <button type="submit" disabled={loading}
              className="w-full btn-gradient py-3.5 min-h-[48px] text-sm flex items-center justify-center gap-2 disabled:opacity-50 relative z-10 mt-1">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? (isLogin ? "Signing you in..." : "Creating account...") : (isLogin ? "Log in" : "Create account")}
            </button>
          </form>

          {!isLogin && (
            <div className="mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="font-body text-[11px] text-center leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                7-day Pro trial · Card required · Cancel anytime
              </p>
              <p className="font-body text-[11px] text-center mt-1.5" style={{ color: "rgba(149,133,242,0.7)" }}>
                Instant access to {PLATFORM_STATS.problemsFound}+ validated problems
              </p>
            </div>
          )}
        </motion.div>

        <p className="font-body text-sm text-center mt-5" style={{ color: 'var(--text-secondary)' }}>
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button onClick={() => setIsLogin(!isLogin)} className="font-semibold transition-colors" style={{ color: '#9585F2' }}>
            {isLogin ? "Sign up" : "Log in"}
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;
