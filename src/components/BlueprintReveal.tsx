import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Hammer, Lock, Sparkles, Clock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useProStatus } from "@/hooks/useProStatus";
import { useAccess } from "@/hooks/useAccess";
import { useAuth } from "@/contexts/AuthContext";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import { PAYMENTS_ENABLED } from "@/lib/config";

interface BlueprintRevealProps {
  markdown: string | null | undefined;
  blurHitCount?: number;
  onBlurHit?: () => void;
}

/** Parse quick stats from blueprint markdown */
const parseStats = (md: string) => {
  const stats: { label: string; value: string }[] = [];

  // Extract estimated cost from "Estimated Monthly Costs" table
  const costMatch = md.match(/\|\s*\*?\*?Total\*?\*?\s*\|\s*([^\n|]+)/i)
    || md.match(/total.*?\$[\d,]+/i);
  if (costMatch) {
    const val = costMatch[1]?.trim() || costMatch[0].match(/\$[\d,]+(?:[-–]\$?[\d,]+)?/)?.[0] || "";
    if (val) stats.push({ label: "Est. Cost", value: val });
  }

  // Count tools in tech stack table
  const stackSection = md.match(/## Recommended Tech Stack[\s\S]*?(?=\n## |\n$)/);
  if (stackSection) {
    const toolRows = stackSection[0].match(/\|[^|\n]+\|[^|\n]+\|[^|\n]+\|/g);
    const count = toolRows ? Math.max(0, toolRows.length - 1) : 0; // minus header
    if (count > 0) stats.push({ label: "Tech Stack", value: `${count} tools` });
  }

  // Timeline from week plan
  const weeksMatch = md.match(/Weeks?\s*(\d+)[-–](\d+)/g);
  if (weeksMatch && weeksMatch.length > 0) {
    const lastWeek = weeksMatch[weeksMatch.length - 1];
    const num = lastWeek.match(/(\d+)\s*$/);
    if (num) stats.push({ label: "Timeline", value: `${num[1]} weeks` });
  }

  return stats.length > 0 ? stats : [
    { label: "Timeline", value: "12 weeks" },
    { label: "Tech Stack", value: "5+ tools" },
  ];
};

/** Extract just the executive summary section */
const getExecutiveSummary = (md: string): string => {
  const match = md.match(/## Executive Summary\s*\n([\s\S]*?)(?=\n## )/);
  return match ? match[1].trim() : md.split("\n").slice(0, 5).join("\n");
};

/** Split markdown into sections for staggered reveal */
const splitSections = (md: string): string[] => {
  const sections = md.split(/(?=\n## )/);
  return sections.map((s) => s.trim()).filter(Boolean);
};

const BlueprintReveal = ({ markdown, blurHitCount = 0, onBlurHit }: BlueprintRevealProps) => {
  const { hasFullAccess, isEarlyAdopter, planStatus, hasUsedTrial, isTrialExpired } = useProStatus();
  const navigate = useNavigate();
  const { isContentLocked } = useAccess();
  const { user } = useAuth();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);

  // Hard paywall for users who have never entered a card OR whose trial has expired with no payment
  const isHardPaywall = planStatus === "none" || planStatus === "free" || isTrialExpired;
  // Soft blur (motivational, with daily reset) only during active trial/pro within daily limits
  const isLocked = false;
  const [revealedSections, setRevealedSections] = useState<number>(0);
  const [isRevealing, setIsRevealing] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── NULL state: content not yet generated ──
  if (!markdown) {
    return (
      <div className="surface-card rounded-xl p-5 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center animate-pulse" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
            <Clock className="w-5 h-5" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              📋 Blueprint generating...
            </p>
            <p className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
              Available within a few hours
            </p>
          </div>
        </div>
      </div>
    );
  }

  const stats = parseStats(markdown);
  const sections = splitSections(markdown);
  const execSummary = getExecutiveSummary(markdown);

  // ── Hard paywall: no card entered, or trial expired without paying ──
  if (isHardPaywall) {
    return (
      <div className="mb-4 sm:mb-6">
        {/* Teaser card: stat pills always visible */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="surface-card rounded-xl p-4 mb-3"
          style={{ transform: "none" }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.1))", border: "1px solid rgba(139,92,246,0.25)" }}>
              <Hammer className="w-4 h-4" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
            </div>
            <p className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              🔨 90-Day Build Plan Ready
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.map((s) => (
              <span key={s.label} className="font-body text-[11px] font-medium px-2.5 py-1 rounded-lg"
                style={{ background: "rgba(124,106,237,0.08)", border: "1px solid rgba(124,106,237,0.15)", color: "#9585F2" }}>
                {s.label}: {s.value}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Hard upgrade wall — no daily reset, no workaround */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-xl p-6 flex flex-col items-center text-center"
          style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.15)" }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
            <Lock className="w-5 h-5" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
          </div>
          <p className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            The 90-day build plan is a Pro feature
          </p>
          <p className="font-body text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
            {planStatus === "none"
              ? "Start your 7-day trial to unlock the full tech stack, timeline, costs, and risk analysis."
              : "Upgrade to Pro to access the complete build blueprint — tech stack, week-by-week plan, and cost breakdown."}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              user
                ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id)
                : navigate("/auth?redirect=feed");
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-heading font-semibold text-white transition-all hover:scale-[1.03]"
            style={{ background: "linear-gradient(135deg, #F59E0B, #F97316)", boxShadow: "0 4px 16px -4px rgba(245,158,11,0.35)" }}
          >
            <Sparkles className="w-4 h-4" strokeWidth={1.5} />
            {planStatus === "none"
              ? "Start Free Trial → $0 for 7 days, then $19/mo"
              : `Upgrade to Pro — ${priceLabel}`}
          </button>
        </motion.div>
      </div>
    );
  }

  // Start typewriter-style section reveal for full-access users
  const startReveal = () => {
    if (isRevealing || revealedSections >= sections.length) return;
    setIsRevealing(true);
    setRevealedSections(1); // Show first section immediately

    let current = 1;
    revealTimerRef.current = setInterval(() => {
      current++;
      setRevealedSections(current);
      if (current >= sections.length) {
        if (revealTimerRef.current) clearInterval(revealTimerRef.current);
        setIsRevealing(false);
      }
    }, 400); // 400ms between sections for "thinking" effect
  };

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
    };
  }, []);

  // Auto-start reveal for full access users when they scroll to it
  useEffect(() => {
    if (!isLocked && markdown && revealedSections === 0) {
      // Small delay for UX polish
      const t = setTimeout(() => startReveal(), 300);
      return () => clearTimeout(t);
    }
  }, [isLocked, markdown]);

  const markdownComponents = {
    h2: ({ children }: any) => <h4 className="font-heading text-base font-semibold mt-5 mb-2" style={{ color: "var(--text-primary)" }}>{children}</h4>,
    h3: ({ children }: any) => <h5 className="font-heading text-sm font-semibold mt-4 mb-2" style={{ color: "var(--text-primary)" }}>{children}</h5>,
    strong: ({ children }: any) => <strong style={{ color: "var(--text-primary)" }}>{children}</strong>,
    p: ({ children }: any) => <p className="mb-2">{children}</p>,
    ul: ({ children }: any) => <ul className="space-y-1 mb-3">{children}</ul>,
    ol: ({ children }: any) => <ol className="space-y-1 mb-3">{children}</ol>,
    li: ({ children }: any) => <li className="flex items-start gap-2"><span className="mt-0.5 shrink-0" style={{ color: "#22D3EE" }}>•</span><span>{children}</span></li>,
    table: ({ children }: any) => <div className="overflow-x-auto mt-2 mb-3 rounded-lg" style={{ border: "1px solid var(--border-subtle)" }}><table className="w-full font-body text-sm">{children}</table></div>,
    th: ({ children }: any) => <th className="font-semibold text-left px-2 py-1.5 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }}>{children}</th>,
    td: ({ children }: any) => <td className="px-2 py-1.5 text-sm" style={{ borderBottom: "1px solid var(--border-subtle)" }}>{children}</td>,
  };

  return (
    <div className="mb-4 sm:mb-6">
      {/* ── Teaser card: always visible ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="surface-card rounded-xl p-4 mb-3"
        style={{ transform: "none" }}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.1))", border: "1px solid rgba(139,92,246,0.25)" }}>
            <Hammer className="w-4 h-4" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              🔨 90-Day Build Plan Ready
            </p>
          </div>
        </div>

        {/* Stat pills */}
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => (
            <span
              key={s.label}
              className="font-body text-[11px] font-medium px-2.5 py-1 rounded-lg"
              style={{ background: "rgba(124,106,237,0.08)", border: "1px solid rgba(124,106,237,0.15)", color: "#9585F2" }}
            >
              {s.label}: {s.value}
            </span>
          ))}
        </div>
      </motion.div>

      {/* ── Full access: typewriter reveal ── */}
      {!isLocked && (
        <AnimatePresence>
          {sections.slice(0, revealedSections).map((section, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="surface-card rounded-xl p-4 sm:p-5 mb-2"
              style={{ transform: "none" }}
            >
              <div className="blueprint-markdown font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <ReactMarkdown components={markdownComponents}>{section}</ReactMarkdown>
              </div>
            </motion.div>
          ))}
          {isRevealing && revealedSections < sections.length && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 py-3 px-4"
            >
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>Building your plan...</span>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Locked: exec summary visible, rest blurred ── */}
      {isLocked && (
        <div className="relative">
          {/* Visible: Executive Summary */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="surface-card rounded-xl p-4 sm:p-5 mb-2"
            style={{ transform: "none" }}
          >
            <div className="blueprint-markdown font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              <ReactMarkdown components={markdownComponents}>{`## Executive Summary\n\n${execSummary}`}</ReactMarkdown>
            </div>
          </motion.div>

          {/* Blurred: rest of content */}
          <div className="relative overflow-hidden rounded-xl" style={{ maxHeight: "280px" }}>
            <div className="surface-card p-4 sm:p-5 select-none" style={{ transform: "none" }}>
              <div className="blueprint-markdown font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <ReactMarkdown components={markdownComponents}>
                  {sections.slice(1).join("\n\n")}
                </ReactMarkdown>
              </div>
            </div>

            {/* Frosted blur overlay */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 rounded-xl"
              style={{
                background: "rgba(10, 14, 26, 0.6)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
              onClick={() => onBlurHit?.()}
            >
              <Lock className="w-6 h-6 mb-3" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
              <p className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Your full 90-day build plan is ready
              </p>
              <p className="font-body text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
                {blurHitCount >= 3
                  ? `You've explored ${blurHitCount} blueprints today. Builders who upgrade explore 10+ daily.`
                  : "Unlock the complete tech stack, timeline, costs, and risk analysis"
                }
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=feed");
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-heading font-semibold text-white transition-all hover:scale-[1.03]"
                style={{ background: !hasUsedTrial ? "linear-gradient(135deg, #F59E0B, #F97316)" : "#7C6AED", boxShadow: !hasUsedTrial ? "0 4px 16px -4px rgba(245,158,11,0.3)" : "0 4px 16px -4px rgba(124,106,237,0.3)" }}
              >
                <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                {!hasUsedTrial ? "Start Free Trial" : `Upgrade to Pro — ${priceLabel}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlueprintReveal;
