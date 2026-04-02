import { useEffect, useState } from "react";

import { User, Bell, ArrowRight, RefreshCw, Clock, Rocket, Heart, LogOut, Trash2, Shield } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import IdeaAlerts from "@/components/IdeaAlerts";
import { useProStatus } from "@/hooks/useProStatus";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import { useGamification, LEVELS } from "@/hooks/useGamification";
import ProfileBadges, { getBadgeCount } from "@/components/ProfileBadges";

interface BuilderDna {
  tech_level: string | null;
  budget_range: string | null;
  time_commitment: string | null;
  industries: string[];
}

interface NotificationPrefs {
  daily_digest: boolean;
  weekly_roundup: boolean;
  trending_alerts: boolean;
  digest_time: string;
}

interface SavedIdea {
  id: string;
  title: string;
  overall_score: number;
  category: string;
}

const defaultPrefs: NotificationPrefs = { daily_digest: true, weekly_roundup: true, trending_alerts: false, digest_time: "08:00" };

const formatLabel = (val: string | null) => {
  if (!val) return "Not set";
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const digestTimeOptions = ["06:00", "08:00", "10:00", "12:00"];
const formatTime = (t: string) => {
  const [h] = t.split(":");
  const hour = parseInt(h);
  return hour === 0 ? "12:00 AM" : hour <= 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
};

const Settings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { isPro, isTrial, isTrialExpired, trialDaysLeft, isEarlyAdopter, planStatus, currentPeriodEnd, cancelAtPeriodEnd, lsCustomerId, hasUsedTrial } = useProStatus();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);

  // Lemon Squeezy customer portal URL
  const manageUrl = lsCustomerId ? `https://idearupt.lemonsqueezy.com/billing?customer_id=${lsCustomerId}` : null;

  // Format date helper
  const fmtDate = (d: Date | null) => d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  // Gamification — from DB
  const { currentStreak, longestStreak, xp, level, levelName, levelEmoji } = useGamification();

  const [dna, setDna] = useState<BuilderDna | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [interactionCounts, setInteractionCounts] = useState({ viewed: 0, saved: 0, shared: 0 });

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    // Display name
    setDisplayName(user.user_metadata?.display_name || user.email?.split("@")[0] || "");

    supabase.from("builder_dna").select("tech_level, budget_range, time_commitment, industries").eq("user_id", user.id).maybeSingle()
      .then(({ data, error }) => { if (isMounted && !error && data) setDna(data as BuilderDna); });
    supabase.from("users").select("notification_preferences").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (isMounted && data?.notification_preferences) setPrefs({ ...defaultPrefs, ...data.notification_preferences }); });

    // Fetch interaction counts for badges
    supabase.from("user_interactions").select("action").eq("user_id", user.id)
      .then(({ data }) => {
        if (!isMounted || !data) return;
        setInteractionCounts({
          viewed: data.filter(d => d.action === "viewed").length,
          saved: data.filter(d => d.action === "saved").length,
          shared: data.filter(d => d.action === "shared").length,
        });
      });

    // Fetch saved ideas
    supabase.from("user_interactions")
      .select("idea_id")
      .eq("user_id", user.id)
      .eq("action", "saved")
      .then(async ({ data }) => {
        if (!isMounted) return;
        if (!data || data.length === 0) { setSavedIdeas([]); return; }
        const ids = data.map((d) => d.idea_id);
        const { data: ideas } = await supabase.from("ideas").select("id, title, overall_score, category").in("id", ids);
        if (isMounted) setSavedIdeas((ideas || []) as SavedIdea[]);
      });

    return () => { isMounted = false; };
  }, [user]);

  const updatePref = async (key: keyof NotificationPrefs, value: boolean | string) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      const { error } = await supabase.from("users").update({ notification_preferences: updated }).eq("id", user!.id);
      if (error) throw error;
      toast({ title: "Preferences saved" });
      trackEvent(EVENTS.SETTINGS_NOTIFICATION_TOGGLED, { key, value });
    } catch {
      toast({ title: "Error saving preferences", variant: "destructive" });
    }
  };

  const handleSaveProfile = async () => {
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
      if (error) throw error;
      await supabase.from("users").update({ display_name: displayName }).eq("id", user!.id);
      toast({ title: "Profile saved" });
      trackEvent(EVENTS.SETTINGS_PROFILE_UPDATED, { display_name: displayName });
    } catch {
      toast({ title: "Error saving profile", variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  const handleLogout = async () => {
    trackEvent(EVENTS.SETTINGS_SIGNOUT);
    await signOut();
    navigate("/");
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: "Session expired. Please sign in again.", variant: "destructive" });
        setDeleting(false);
        return;
      }
      const res = await supabase.functions.invoke("delete-account", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || res.error?.message || "Deletion failed");
      }
      await signOut();
      navigate("/");
      toast({ title: "Account deleted. We're sorry to see you go." });
    } catch (err: any) {
      toast({ title: err?.message || "Failed to delete account. Contact support.", variant: "destructive" });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      role="switch"
      aria-checked={checked}
      className="relative shrink-0 p-2"
      aria-label={checked ? "Enabled" : "Disabled"}>
      <div
        className="w-11 h-6 rounded-full relative transition-all duration-200"
        style={{ background: checked ? '#7C6AED' : 'rgba(255,255,255,0.1)' }}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-200 ${checked ? "right-1" : "left-1"}`} />
      </div>
    </button>
  );

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 className="font-heading text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{children}</h2>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="font-body text-[13px] font-medium uppercase tracking-[0.04em]" style={{ color: 'var(--text-secondary)' }}>{children}</p>
  );

  const scoreColor = (s: number) => s >= 8 ? "#10B981" : s >= 6 ? "#06B6D4" : "#F59E0B";

  const badgeCount = getBadgeCount({
    ideasViewed: interactionCounts.viewed,
    ideasSaved: interactionCounts.saved,
    ideasShared: interactionCounts.shared,
    currentStreak,
    longestStreak,
  });

  return (
    <div className="min-h-screen pb-20 md:pb-0">

      <div className="mx-auto px-4 py-6 max-w-2xl w-full">
        <h1 className="font-heading text-[28px] font-bold mb-6 tracking-[-0.02em]" style={{ color: 'var(--text-primary)' }}>Settings</h1>

        {/* Streak + Level + XP */}
        <div className="surface-card rounded-xl p-5 mb-6" style={{ transform: 'none' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-heading text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {currentStreak > 0 ? `${currentStreak} day streak` : "Start your streak!"}
              </p>
              <p className="font-body text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {longestStreak > currentStreak ? `Longest: ${longestStreak} days` : currentStreak > 0 ? "Personal best!" : "Start exploring to build your streak!"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl">{levelEmoji}</p>
              <p className="font-heading text-xs font-semibold" style={{ color: 'var(--accent-purple-light)' }}>
                Lv {level + 1}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="text-center">
              <p className="font-heading text-lg font-bold tabular-nums" style={{ color: 'var(--accent-purple-light)' }}>{xp.toLocaleString()}</p>
              <p className="font-body text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>XP</p>
            </div>
            <div className="text-center">
              <p className="font-heading text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{levelName}</p>
              <p className="font-body text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Level</p>
            </div>
            <div className="text-center">
              <p className="font-heading text-lg font-bold tabular-nums" style={{ color: '#F59E0B' }}>{longestStreak}</p>
              <p className="font-body text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Best Streak</p>
            </div>
          </div>
        </div>

        {/* Badges */}
        <section className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <SectionTitle>Badges</SectionTitle>
          <div className="surface-card rounded-xl p-4" style={{ transform: 'none' }}>
            <ProfileBadges
              ideasViewed={interactionCounts.viewed}
              ideasSaved={interactionCounts.saved}
              ideasShared={interactionCounts.shared}
              currentStreak={currentStreak}
              longestStreak={longestStreak}
            />
          </div>
        </section>

        {/* Profile */}
        <section className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <SectionTitle>Profile</SectionTitle>
          <div className="surface-card rounded-xl overflow-hidden" style={{ transform: 'none' }}>
            <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <User className="w-[18px] h-[18px]" style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
              <div>
                <SectionLabel>Email</SectionLabel>
                <p className="font-body text-sm" style={{ color: 'var(--text-primary)' }}>{user?.email || "Not logged in"}</p>
              </div>
            </div>
            <div className="p-4">
              <SectionLabel>Display Name</SectionLabel>
              <div className="flex gap-2 mt-1.5">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="flex-1 font-body text-sm rounded-lg px-3 py-2"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  placeholder="Your name"
                />
                <button onClick={handleSaveProfile} disabled={savingName}
                  className="btn-gradient px-4 py-2 text-xs font-semibold disabled:opacity-50">
                  Save
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Quick link to Saved page */}
        <section className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <Link to="/saved" className="surface-card rounded-xl p-4 flex items-center justify-between" style={{ transform: 'none' }}>
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5" style={{ color: '#A78BFA' }} strokeWidth={1.5} />
              <div>
                <p className="font-heading text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Saved Ideas</p>
                <p className="font-body text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {savedIdeas.length > 0 ? `${savedIdeas.length} idea${savedIdeas.length !== 1 ? 's' : ''} saved` : 'Browse and save ideas from the feed'}
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
          </Link>
        </section>

        {/* Builder DNA */}
        <section className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <SectionTitle>Builder DNA</SectionTitle>
          <div className="surface-card rounded-xl overflow-hidden" style={{ transform: 'none' }}>
            {[
              { label: "Tech Level", value: dna?.tech_level },
              { label: "Budget", value: dna?.budget_range },
              { label: "Time", value: dna?.time_commitment },
              { label: "Industries", value: dna?.industries?.join(", ") },
            ].map(({ label, value }, i, arr) => (
              <div key={label} className="flex items-center justify-between p-4" style={i < arr.length - 1 ? { borderBottom: '1px solid var(--border-subtle)' } : {}}>
                <div>
                  <SectionLabel>{label}</SectionLabel>
                  <p className="font-body text-sm" style={{ color: 'var(--text-primary)' }}>{formatLabel(value || null)}</p>
                </div>
              </div>
            ))}
          </div>
          <Link to="/onboarding"
            className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 surface-card rounded-xl font-heading text-sm font-medium transition-all duration-150"
            style={{ color: 'var(--text-secondary)' }}>
            <RefreshCw className="w-4 h-4" strokeWidth={1.5} /> Retake Quiz
          </Link>
        </section>

        {/* Pro Plan */}
        <section className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <SectionTitle>Pro Plan</SectionTitle>
          <div className="surface-card rounded-xl p-4" style={{ transform: 'none' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Rocket className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />
                <span className="font-heading text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Current Plan</span>
              </div>
              <span className="font-body text-xs px-2 py-1 rounded-md" style={{
                background: planStatus === 'active' || isPro ? 'rgba(16,185,129,0.1)'
                  : planStatus === 'trial' || isTrial ? 'rgba(139,92,246,0.1)'
                  : planStatus === 'past_due' ? 'rgba(239,68,68,0.1)'
                  : planStatus === 'cancelled' ? 'rgba(245,158,11,0.1)'
                  : 'var(--bg-elevated)',
                color: planStatus === 'active' || isPro ? '#34D399'
                  : planStatus === 'trial' || isTrial ? '#A78BFA'
                  : planStatus === 'past_due' ? '#F87171'
                  : planStatus === 'cancelled' ? '#FBBF24'
                  : 'var(--text-tertiary)',
                border: planStatus === 'active' || isPro ? '1px solid rgba(16,185,129,0.2)'
                  : planStatus === 'trial' || isTrial ? '1px solid rgba(139,92,246,0.2)'
                  : planStatus === 'past_due' ? '1px solid rgba(239,68,68,0.2)'
                  : planStatus === 'cancelled' ? '1px solid rgba(245,158,11,0.2)'
                  : undefined,
              }}>
                {planStatus === 'active' || isPro ? "Pro"
                  : planStatus === 'trial' ? `Trial (${trialDaysLeft}d left)`
                  : isTrial ? `Trial (${trialDaysLeft}d left)`
                  : planStatus === 'past_due' ? "Payment Failed"
                  : planStatus === 'cancelled' ? "Cancelled"
                  : isTrialExpired ? "Trial Ended"
                  : planStatus === 'none' && user ? "No Plan"
                  : "Free"}
              </span>
            </div>

            {/* Active Pro subscriber */}
            {(planStatus === 'active' || isPro) && planStatus !== 'trial' ? (
              <>
                <p className="font-body text-xs" style={{ color: '#34D399' }}>
                  Idearupt Pro {"\u2014"} {priceLabel}
                </p>
                {currentPeriodEnd && (
                  <p className="font-body text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Next billing: {fmtDate(currentPeriodEnd)}
                  </p>
                )}
                {manageUrl && (
                  <>
                    <a href={manageUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full mt-3 py-2.5 rounded-xl font-heading text-sm font-medium transition-all"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      Manage Subscription <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                    </a>
                    {!cancelAtPeriodEnd && (
                      <a href={manageUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center w-full mt-2 py-1.5 font-body text-xs transition-all hover:opacity-80"
                        style={{ color: 'var(--text-tertiary)' }}>
                        Cancel Subscription
                      </a>
                    )}
                  </>
                )}
              </>
            ) : planStatus === 'trial' || isTrial ? (
              /* Active trial */
              <>
                <p className="font-body text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  Idearupt Pro {"\u2014"} Trial
                </p>
                <p className="font-body text-xs mb-3" style={{ color: '#A78BFA' }}>
                  {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining
                </p>
                {manageUrl && (
                  <>
                    <a href={manageUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-heading text-sm font-medium transition-all"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      Manage Subscription <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                    </a>
                    <a href={manageUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center w-full mt-2 py-1.5 font-body text-xs transition-all hover:opacity-80"
                      style={{ color: 'var(--text-tertiary)' }}>
                      Cancel Subscription
                    </a>
                  </>
                )}
              </>
            ) : planStatus === 'past_due' ? (
              /* Payment failed */
              <>
                <p className="font-body text-xs mb-3" style={{ color: '#F87171' }}>
                  Your payment failed. Update your payment method to keep Pro access.
                </p>
                {manageUrl ? (
                  <a href={manageUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-heading text-sm font-semibold text-white transition-all"
                    style={{ background: '#EF4444' }}>
                    Update Payment Method <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                  </a>
                ) : (
                  <button onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate('/auth?redirect=settings')} className="flex items-center justify-center gap-2 w-full btn-gradient py-2.5 font-heading text-sm font-semibold">
                    Update Payment <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                )}
              </>
            ) : planStatus === 'cancelled' ? (
              /* Cancelled */
              <>
                <p className="font-body text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                  {currentPeriodEnd && currentPeriodEnd > new Date()
                    ? `Cancelled \u2014 Pro access until ${fmtDate(currentPeriodEnd)}`
                    : 'Your subscription has been cancelled.'}
                </p>
                <button onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate('/auth?redirect=settings')} className="flex items-center justify-center gap-2 w-full btn-gradient py-2.5 font-heading text-sm font-semibold">
                  Resubscribe {"\u2014"} {priceLabel} <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </>
            ) : planStatus === 'none' && user ? (
              /* No plan — new user who hasn't started trial */
              <>
                <p className="font-body text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  Start your 7-day free trial to unlock Pro features:
                </p>
                <p className="font-body text-[11px] mb-3" style={{ color: 'var(--text-tertiary)' }}>
                  PDF exports • Source threads • Pain Radar • Compare ideas • Unlimited saves
                </p>
                <button onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate('/auth?redirect=settings')} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-heading text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)' }}>
                  Start Free Trial <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </>
            ) : (
              /* Legacy free / expired */
              <>
                <p className="font-body text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  {isTrialExpired ? 'Your trial has ended.' : 'Current plan: Free'}
                </p>
                <p className="font-body text-[11px] mb-3" style={{ color: 'var(--text-tertiary)' }}>
                  3 ideas/day • 10 saved ideas max • No PDF export • No source threads
                </p>
                <button onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate('/auth?redirect=settings')} className="flex items-center justify-center gap-2 w-full btn-gradient py-2.5 font-heading text-sm font-semibold">
                  Upgrade to Pro {"\u2014"} {priceLabel} <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>
        </section>

        {/* Idea Alerts */}
        <IdeaAlerts />

        {/* Notifications */}
        <section className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <SectionTitle>Notifications</SectionTitle>
          <div className="surface-card rounded-xl overflow-hidden" style={{ transform: 'none' }}>
            {[
              { key: "daily_digest" as const, icon: Bell, label: "Daily Idea Digest", desc: "Get your top 3 matched ideas every morning" },
              { key: "weekly_roundup" as const, icon: Bell, label: "Weekly Roundup", desc: "Best ideas of the week + trending categories" },
              { key: "trending_alerts" as const, icon: Bell, label: "Trending Alerts", desc: "Instant alert when an idea starts trending" },
            ].map(({ key, icon: Icon, label, desc }, i) => (
              <div key={key} className="flex items-center justify-between p-4" style={i < 2 ? { borderBottom: '1px solid var(--border-subtle)' } : {}}>
                <div className="flex items-center gap-3">
                  <Icon className="w-[18px] h-[18px]" style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
                  <div>
                    <span className="font-heading text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
                    <p className="font-body text-xs" style={{ color: 'var(--text-tertiary)' }}>{desc}</p>
                  </div>
                </div>
                <Toggle checked={prefs[key]} onChange={(v) => updatePref(key, v)} />
              </div>
            ))}
            <div className="flex items-center justify-between p-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-3">
                <Clock className="w-[18px] h-[18px]" style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
                <div>
                  <span className="font-heading text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Digest Time</span>
                  <p className="font-body text-xs" style={{ color: 'var(--text-tertiary)' }}>When to receive your daily digest</p>
                </div>
              </div>
              <select value={prefs.digest_time} onChange={(e) => updatePref("digest_time", e.target.value)}
                className="font-body text-xs rounded-[8px] px-2 py-1.5"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                {digestTimeOptions.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="mb-6">
          <SectionTitle>Account</SectionTitle>
          <div className="space-y-2">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLogout(); }}
              className="w-full surface-card rounded-xl p-4 flex items-center gap-3 text-left transition-all duration-150 min-h-[52px] relative z-10"
              style={{ transform: 'none' }}>
              <LogOut className="w-[18px] h-[18px]" style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
              <span className="font-heading text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Sign Out</span>
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full surface-card rounded-xl p-4 flex items-center gap-3 text-left transition-all duration-150"
              style={{ transform: 'none' }}>
              <Trash2 className="w-[18px] h-[18px] text-destructive" strokeWidth={1.5} />
              <span className="font-heading text-sm font-medium text-destructive">Delete Account</span>
            </button>
          </div>
        </section>
      </div>

      {/* Delete Account Confirmation — Loss-Aversion Design */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-overlay">
          <div className="w-full max-w-sm glass-modal p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/10">
                <Trash2 className="w-5 h-5 text-red-400" strokeWidth={1.5} />
              </div>
              <h3 className="font-heading text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Delete Account</h3>
            </div>

            <p className="font-body text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              You'll permanently lose everything you've built:
            </p>

            {/* Loss aversion stats */}
            <div className="rounded-xl p-3 mb-4 space-y-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              {currentStreak > 0 && (
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm" style={{ color: 'var(--text-secondary)' }}>{"\u{1F525}"} Streak</span>
                  <span className="font-heading text-sm font-bold" style={{ color: '#F59E0B' }}>{currentStreak} days</span>
                </div>
              )}
              {xp > 0 && (
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm" style={{ color: 'var(--text-secondary)' }}>{"\u26A1"} XP Earned</span>
                  <span className="font-heading text-sm font-bold" style={{ color: 'var(--accent-purple-light)' }}>{xp.toLocaleString()}</span>
                </div>
              )}
              {level > 0 && (
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm" style={{ color: 'var(--text-secondary)' }}>{levelEmoji} Level</span>
                  <span className="font-heading text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{levelName}</span>
                </div>
              )}
              {savedIdeas.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm" style={{ color: 'var(--text-secondary)' }}>{"\u{1F4BE}"} Saved Ideas</span>
                  <span className="font-heading text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{savedIdeas.length}</span>
                </div>
              )}
              {badgeCount > 1 && (
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm" style={{ color: 'var(--text-secondary)' }}>{"\u{1F3C5}"} Badges</span>
                  <span className="font-heading text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{badgeCount}/10</span>
                </div>
              )}
            </div>

            <p className="font-body text-xs font-semibold mb-5 text-red-400">
              This cannot be undone.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="w-full py-2.5 rounded-xl font-heading text-sm font-semibold text-white transition-all"
                style={{ background: 'var(--accent-purple)' }}>
                <Shield className="w-4 h-4 inline mr-1.5" strokeWidth={1.5} />
                Keep My Account
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="w-full py-2 rounded-xl font-heading text-xs font-medium transition-all disabled:opacity-50"
                style={{ color: 'rgba(239,68,68,0.7)' }}>
                {deleting ? "Deleting..." : "Delete Everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
