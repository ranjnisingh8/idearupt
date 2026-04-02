import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Sparkles, ArrowRight, ChevronDown, Crown, Zap, Users, Shield, Bell, BarChart3, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { useProStatus } from "@/hooks/useProStatus";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import { PLATFORM_STATS } from "@/lib/config";

const faqItems = [
  {
    q: "What happens after the trial?",
    a: "After 7 days, you're automatically charged $19/mo. Cancel anytime before and you won't be charged. You'll drop to the free plan with lower limits but you'll still see full idea details.",
  },
  {
    q: "Can I cancel during the trial?",
    a: "Yes. Cancel anytime from your account settings. You won't be charged and you'll keep Pro access until the trial ends.",
  },
  {
    q: "What's on the free plan?",
    a: "You get 3 idea views, 3 signals, and 3 use cases per day with full idea details — nothing is hidden or blurred. You also get 1 validation, 1 deep dive, and 1 remix per day. Pro features like Pain Radar, Sniper Mode Alerts, PDF export, source thread links, and idea comparison are exclusive to Pro.",
  },
  {
    q: "Why is a credit card required?",
    a: "To prevent spam signups and ensure serious builders get the best experience. You're not charged during the 7-day trial. Cancel anytime.",
  },
  {
    q: "What are source threads?",
    a: "Every idea on Idearupt is sourced from real complaints on Reddit and Hacker News. Source threads are direct links to the original posts so you can read the raw user complaints yourself — the actual words people use to describe their pain. Pro users get these links on every idea.",
  },
  {
    q: "What is the comparison feature?",
    a: "Compare 2-3 ideas side by side — pain score, market size, revenue potential, competition, difficulty, and build time. Helps you decide which problem to solve.",
  },
  {
    q: "How often are new ideas added?",
    a: "New problems are scraped and scored daily. All users see new ideas immediately — no delays.",
  },
  {
    q: "What is Pro+?",
    a: "Pro+ is our upcoming team-focused plan with API access, white-label reports, team collaboration, and priority support. Join the waitlist to be the first to know when it launches.",
  },
];

// Comparison rows: feature | free | pro | proPlus
const comparisonRows: { feature: string; free: string | boolean; pro: string | boolean; proPlus: string | boolean; highlight?: boolean }[] = [
  { feature: "Idea views / day", free: "3", pro: "8", proPlus: "Unlimited" },
  { feature: "Signal views / day", free: "3", pro: "8", proPlus: "Unlimited" },
  { feature: "Use case views / day", free: "3", pro: "8", proPlus: "Unlimited" },
  { feature: "Saves / day", free: "2", pro: "5", proPlus: "Unlimited" },
  { feature: "Total saved ideas", free: "10 max", pro: "Unlimited", proPlus: "Unlimited" },
  { feature: "Validations / day", free: "1", pro: "3", proPlus: "Unlimited" },
  { feature: "Deep dives / day", free: "1", pro: "2", proPlus: "Unlimited" },
  { feature: "Remixes / day", free: "1", pro: "2", proPlus: "Unlimited" },
  { feature: "Full idea details", free: true, pro: true, proPlus: true },
  { feature: "PDF reports & exports", free: false, pro: true, proPlus: true, highlight: true },
  { feature: "Reddit/HN source threads", free: false, pro: true, proPlus: true, highlight: true },
  { feature: "Compare ideas side by side", free: false, pro: true, proPlus: true, highlight: true },
  { feature: "Pain Radar (live complaints)", free: "3 cards", pro: "Unlimited", proPlus: "Unlimited", highlight: true },
  { feature: "Idea Alerts (Sniper Mode)", free: false, pro: "Up to 5", proPlus: "Unlimited", highlight: true },
  { feature: "Problem Size Filter", free: true, pro: true, proPlus: true },
  { feature: "API access & webhooks", free: false, pro: false, proPlus: true, highlight: true },
  { feature: "White-label reports", free: false, pro: false, proPlus: true, highlight: true },
  { feature: "Team collaboration", free: false, pro: false, proPlus: true, highlight: true },
  { feature: "Priority support (24h SLA)", free: false, pro: false, proPlus: true, highlight: true },
  { feature: "Advanced analytics dashboard", free: false, pro: false, proPlus: true, highlight: true },
  { feature: "AI niche recommendations", free: false, pro: false, proPlus: true, highlight: true },
];

const Pricing = () => {
  const { user } = useAuth();
  const { isTrial, isPro, planStatus, trialDaysLeft, isEarlyAdopter, hasUsedTrial, lsCustomerId } = useProStatus();
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const plan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);
  const manageUrl = lsCustomerId ? `https://idearupt.lemonsqueezy.com/billing?customer_id=${lsCustomerId}` : null;

  const handleUpgrade = () => {
    if (!user) {
      navigate("/auth?redirect=pricing");
      return;
    }
    openCheckout(resolveCheckoutPlan(plan, hasUsedTrial), user.email || undefined, user.id);
  };

  const isActivePro = isPro || planStatus === "active";
  const isOnTrial = isTrial || planStatus === "trial";

  const ProCtaButton = () => {
    if (isActivePro) {
      return (
        <div className="rounded-xl p-3.5 text-center" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <Check className="w-4 h-4 mx-auto mb-1" style={{ color: "#34D399" }} strokeWidth={2} />
          <p className="font-heading text-sm font-semibold" style={{ color: "#34D399" }}>
            You're on Pro
          </p>
          {manageUrl && (
            <a href={manageUrl} target="_blank" rel="noopener noreferrer" className="font-body text-[11px] mt-1.5 inline-block hover:underline" style={{ color: "var(--text-tertiary)" }}>
              Manage Subscription →
            </a>
          )}
        </div>
      );
    }
    if (isOnTrial) {
      return (
        <div className="space-y-2">
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(88,60,180,0.1)", border: "1px solid rgba(88,60,180,0.2)" }}>
            <p className="font-body text-xs" style={{ color: "#8B72D6" }}>
              Trial active — {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left
            </p>
          </div>
          {manageUrl && (
            <a href={manageUrl} target="_blank" rel="noopener noreferrer" className="block font-body text-[11px] text-center hover:underline" style={{ color: "var(--text-tertiary)" }}>
              Manage Subscription →
            </a>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-2.5">
        <button
          onClick={handleUpgrade}
          className="w-full py-3.5 rounded-xl font-heading font-semibold text-[14px] flex items-center justify-center gap-2 transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #5530A8, #3D2480)",
            color: "white",
            boxShadow: "0 4px 16px -4px rgba(88,60,180,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <Sparkles className="w-4 h-4" strokeWidth={1.5} />
          {user && planStatus === "cancelled" ? "Resubscribe" : user && hasUsedTrial ? `Upgrade — ${priceLabel}` : "Start Free Trial"}
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
        <p className="font-body text-[11px] text-center" style={{ color: "var(--text-tertiary)" }}>
          No charge for 7 days · Cancel anytime
        </p>
      </div>
    );
  };

  const CellValue = ({ value, colType }: { value: string | boolean; colType: "free" | "pro" | "proPlus" }) => {
    if (typeof value === "boolean") {
      return value ? (
        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: colType === "proPlus" ? "rgba(37,99,235,0.12)" : colType === "pro" ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.08)" }}>
          <Check className="w-3 h-3" style={{ color: colType === "proPlus" ? "#4B8BF5" : "#34D399" }} strokeWidth={2.5} />
        </div>
      ) : (
        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)" }}>
          <X className="w-3 h-3" style={{ color: "var(--text-tertiary)", opacity: 0.4 }} strokeWidth={2} />
        </div>
      );
    }
    return (
      <span className="font-body text-[12px] sm:text-[13px] font-medium" style={{ color: colType === "proPlus" ? "#4B8BF5" : colType === "pro" ? "var(--text-primary)" : "var(--text-tertiary)" }}>
        {value}
      </span>
    );
  };

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <div className="container mx-auto px-4 py-8 sm:py-12 max-w-5xl">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10 sm:mb-14"
        >
          <p
            className="font-heading text-[11px] uppercase tracking-[0.14em] font-bold mb-3"
            style={{ color: "#7C6AED" }}
          >
            PRICING
          </p>
          <h1
            className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold tracking-[-0.03em] mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Find your next{" "}
            <span style={{ color: "#7C6AED" }}>startup idea</span>
          </h1>
          <p
            className="font-body text-base sm:text-lg max-w-lg mx-auto leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {PLATFORM_STATS.problemsFound}+ validated problems. Real pain from real users. Pick a plan that fits.
          </p>
        </motion.div>

        {/* ── Three plan cards ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative mb-12 sm:mb-16"
        >
          {/* Subtle ambient glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] pointer-events-none" style={{ filter: "blur(120px)" }}>
            <div className="absolute top-0 left-[20%] w-[200px] h-[200px] rounded-full" style={{ background: "rgba(88, 60, 180, 0.06)" }} />
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 items-start">

            {/* ─── Free Plan Card ─── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl p-5 sm:p-6 relative md:mt-4"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 40%), #0D0D12",
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            >
              <p className="font-heading text-xs uppercase tracking-[0.08em] font-bold mb-3" style={{ color: "var(--text-tertiary)" }}>
                Free
              </p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-mono text-3xl font-bold" style={{ color: "var(--text-primary)" }}>$0</span>
                <span className="font-body text-sm" style={{ color: "var(--text-tertiary)" }}>/mo</span>
              </div>
              <p className="font-body text-xs mb-5" style={{ color: "var(--text-tertiary)" }}>
                Explore and get started
              </p>

              {(isActivePro || isOnTrial) ? (
                <div
                  className="rounded-xl py-2.5 text-center font-heading text-sm font-medium"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}
                >
                  Current plan
                </div>
              ) : !user ? (
                <button
                  onClick={() => navigate("/auth")}
                  className="w-full py-2.5 rounded-xl font-heading text-sm font-medium transition-all hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
                >
                  Sign Up Free
                </button>
              ) : (
                <div
                  className="rounded-xl py-2.5 text-center font-heading text-sm font-medium"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}
                >
                  Current plan
                </div>
              )}

              <ul className="mt-5 space-y-2.5">
                {[
                  "3 idea views / day",
                  "3 signals / day",
                  "3 use cases / day",
                  "1 validation / day",
                  "10 saved ideas max",
                  "Full idea details",
                  "3 Pain Radar cards",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 font-body text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                    <Check className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-tertiary)", opacity: 0.5 }} strokeWidth={2} />
                    {f}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* ─── Pro Plan Card (HERO) ─── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl p-5 sm:p-6 relative md:scale-[1.04] md:z-10"
              style={{
                background: "linear-gradient(180deg, rgba(88,60,180,0.05) 0%, transparent 40%), #0D0D12",
                border: "1px solid rgba(88,60,180,0.2)",
                boxShadow: "0 4px 24px rgba(88,60,180,0.08), 0 2px 8px rgba(0,0,0,0.4)",
              }}
            >
              {/* Badge */}
              <span
                className="absolute -top-3 left-1/2 -translate-x-1/2 font-body text-[10px] uppercase tracking-[0.1em] font-bold px-3.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap"
                style={{ background: "linear-gradient(135deg, #5530A8, #3D2480)", color: "white", boxShadow: "0 2px 8px rgba(88,60,180,0.2)" }}
              >
                <Sparkles className="w-3 h-3" strokeWidth={2} />
                MOST POPULAR
              </span>

              <div className="flex items-center gap-2 mb-3 mt-1">
                <p className="font-heading text-xs uppercase tracking-[0.08em] font-bold" style={{ color: "#8B72D6" }}>
                  Pro
                </p>
                <Crown className="w-3.5 h-3.5" style={{ color: "#8B72D6" }} strokeWidth={2} />
              </div>
              <div className="flex items-baseline gap-1 mb-0.5">
                <span className="font-mono text-3xl font-bold" style={{ color: "#7C6AED" }}>$0</span>
                <span className="font-body text-sm" style={{ color: "var(--text-secondary)" }}>for 7 days</span>
              </div>
              <p className="font-body text-xs mb-5" style={{ color: "var(--text-tertiary)" }}>
                then {priceLabel} · Cancel anytime
              </p>

              <ProCtaButton />

              <ul className="mt-5 space-y-2.5">
                {[
                  "8 idea views / day",
                  "8 signals / day",
                  "8 use cases / day",
                  "3 validations / day",
                  "Unlimited saved ideas",
                  "Full idea details",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 font-body text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(16,185,129,0.12)" }}>
                      <Check className="w-2.5 h-2.5" style={{ color: "#34D399" }} strokeWidth={2.5} />
                    </div>
                    {f}
                  </li>
                ))}
                {[
                  "Pain Radar (live complaints)",
                  "Sniper Mode Alerts (up to 5)",
                  "PDF reports & exports",
                  "Reddit/HN source threads",
                  "Compare ideas side by side",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 font-body text-[13px] font-medium" style={{ color: "#8B72D6" }}>
                    <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(88,60,180,0.15)" }}>
                      <Sparkles className="w-2.5 h-2.5" style={{ color: "#8B72D6" }} strokeWidth={2.5} />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* ─── Pro+ Card (Launching Soon) ─── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-2xl p-5 sm:p-6 relative md:mt-4"
              style={{
                background: "linear-gradient(180deg, rgba(37,99,235,0.03) 0%, transparent 40%), #0D0D12",
                border: "1px solid rgba(37,99,235,0.15)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            >
              {/* Badge */}
              <span
                className="absolute -top-3 left-1/2 -translate-x-1/2 font-body text-[10px] uppercase tracking-[0.1em] font-bold px-3.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap"
                style={{ background: "linear-gradient(135deg, #1E40AF, #312E81)", color: "rgba(255,255,255,0.9)", boxShadow: "0 2px 8px rgba(37,99,235,0.15)" }}
              >
                <Zap className="w-3 h-3" strokeWidth={2} />
                COMING SOON
              </span>

              <div className="flex items-center gap-2 mb-3 mt-1">
                <p className="font-heading text-xs uppercase tracking-[0.08em] font-bold" style={{ color: "#4B8BF5" }}>
                  Pro+
                </p>
                <Shield className="w-3.5 h-3.5" style={{ color: "#4B8BF5" }} strokeWidth={2} />
              </div>
              <div className="flex items-baseline gap-1 mb-0.5">
                <span className="font-mono text-2xl font-bold" style={{ color: "#4B8BF5" }}>TBA</span>
              </div>
              <p className="font-body text-xs mb-5" style={{ color: "var(--text-tertiary)" }}>
                For teams & power users
              </p>

              {/* Get Notified CTA */}
              <a
                href="mailto:garagefitness4@gmail.com?subject=Idearupt%20Pro%2B%20Waitlist&body=Hey%2C%20I%27m%20interested%20in%20Idearupt%20Pro%2B!%20Please%20notify%20me%20when%20it%20launches."
                className="w-full py-3 rounded-xl font-heading font-semibold text-[14px] flex items-center justify-center gap-2 transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #1E40AF, #312E81)",
                  color: "rgba(255,255,255,0.9)",
                  boxShadow: "0 4px 12px -4px rgba(37,99,235,0.2)",
                }}
              >
                <Bell className="w-4 h-4" strokeWidth={1.5} />
                Get Notified
              </a>

              <ul className="mt-5 space-y-2.5">
                <li className="font-body text-[12px] font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
                  Everything in Pro, plus:
                </li>
                {[
                  { icon: Users, text: "Team workspaces" },
                  { icon: Zap, text: "API access & webhooks" },
                  { icon: FileText, text: "White-label PDF reports" },
                  { icon: Shield, text: "Priority support (24h SLA)" },
                  { icon: BarChart3, text: "Unlimited everything" },
                  { icon: Bell, text: "Custom alert integrations" },
                  { icon: Crown, text: "Advanced analytics dashboard" },
                  { icon: Sparkles, text: "AI-powered niche recommendations" },
                ].map((f) => (
                  <li key={f.text} className="flex items-center gap-2 font-body text-[13px] font-medium" style={{ color: "#4B8BF5" }}>
                    <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(37,99,235,0.12)" }}>
                      <f.icon className="w-2.5 h-2.5" style={{ color: "#4B8BF5" }} strokeWidth={2.5} />
                    </div>
                    {f.text}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </motion.div>

        {/* ── Feature Comparison Table ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl overflow-hidden mb-12 sm:mb-14"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.015) 0%, transparent 30%), #0D0D12",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <h2 className="font-heading text-base font-semibold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>
              Compare plans
            </h2>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_60px_60px_60px] sm:grid-cols-[1fr_90px_90px_90px] px-4 sm:px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
            <span className="font-heading text-[11px] uppercase tracking-[0.06em] font-bold" style={{ color: "var(--text-tertiary)" }}>Feature</span>
            <span className="font-heading text-[11px] uppercase tracking-[0.06em] font-bold text-center" style={{ color: "var(--text-tertiary)" }}>Free</span>
            <span className="font-heading text-[11px] uppercase tracking-[0.06em] font-bold text-center" style={{ color: "#8B72D6" }}>Pro</span>
            <span className="font-heading text-[11px] uppercase tracking-[0.06em] font-bold text-center flex items-center justify-center gap-1" style={{ color: "#4B8BF5" }}>
              Pro+
              <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: "rgba(37,99,235,0.12)", color: "#4B8BF5" }}>SOON</span>
            </span>
          </div>

          {/* Table rows */}
          {comparisonRows.map((row, i) => (
            <div
              key={row.feature}
              className="grid grid-cols-[1fr_60px_60px_60px] sm:grid-cols-[1fr_90px_90px_90px] px-4 sm:px-5 py-3 items-center"
              style={{
                borderBottom: i < comparisonRows.length - 1 ? "1px solid var(--border-subtle)" : "none",
                background: row.highlight ? "rgba(88,60,180,0.03)" : "transparent",
              }}
            >
              <span className={`font-body text-[12px] sm:text-[13px] ${row.highlight ? "font-medium" : ""}`} style={{ color: row.highlight ? "#8B72D6" : "var(--text-secondary)" }}>
                {row.feature}
              </span>
              <div className="flex justify-center">
                <CellValue value={row.free} colType="free" />
              </div>
              <div className="flex justify-center">
                <CellValue value={row.pro} colType="pro" />
              </div>
              <div className="flex justify-center">
                <CellValue value={row.proPlus} colType="proPlus" />
              </div>
            </div>
          ))}
        </motion.div>

        {/* ── Bottom CTA ── */}
        {!isActivePro && !isOnTrial && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="text-center mb-12"
          >
            <button
              onClick={handleUpgrade}
              className="px-8 py-4 rounded-xl font-heading font-semibold text-[15px] inline-flex items-center gap-2 transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #5530A8, #3D2480)",
                color: "white",
                boxShadow: "0 4px 16px -4px rgba(88,60,180,0.25)",
              }}
            >
              <Sparkles className="w-4 h-4" strokeWidth={1.5} />
              {user && hasUsedTrial ? `Upgrade to Pro — ${priceLabel}` : "Start 7-Day Free Trial"}
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
            <p className="font-body text-[11px] mt-3" style={{ color: "var(--text-tertiary)" }}>
              No charge for 7 days · Cancel anytime
            </p>
          </motion.div>
        )}

        {/* ── Social Proof ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-3 sm:gap-5 mb-10 sm:mb-14"
        >
          {[
            { label: `${PLATFORM_STATS.buildersActive}+ builders`, icon: Users },
            { label: `${PLATFORM_STATS.problemsFound}+ problems`, icon: Zap },
            { label: "Updated daily", icon: BarChart3 },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-2 px-3.5 py-2 rounded-full"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)" }}
            >
              <stat.icon className="w-3.5 h-3.5" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
              <span className="font-body text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                {stat.label}
              </span>
            </div>
          ))}
        </motion.div>

        {/* ── FAQ ── */}
        <div className="max-w-lg mx-auto">
          <h2 className="font-heading text-2xl font-bold text-center mb-6 sm:mb-8 tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
            Frequently Asked Questions
          </h2>
          <div className="space-y-2">
            {faqItems.map((item, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%), var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full text-left p-4 flex items-center justify-between">
                  <span className="font-heading text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.q}</span>
                  <ChevronDown className="w-4 h-4 shrink-0 ml-4 transition-transform duration-200" style={{ color: "var(--text-tertiary)", transform: openFaq === i ? "rotate(180deg)" : "none" }} strokeWidth={1.5} />
                </button>
                {openFaq === i && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="px-4 pb-4">
                    <p className="font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.a}</p>
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Pricing;
