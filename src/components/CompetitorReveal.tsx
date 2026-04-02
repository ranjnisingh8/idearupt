import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Target, Lock, Sparkles, Clock } from "lucide-react";
import { useProStatus } from "@/hooks/useProStatus";
import { useAccess } from "@/hooks/useAccess";
import { useAuth } from "@/contexts/AuthContext";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import { PAYMENTS_ENABLED } from "@/lib/config";

interface Competitor {
  name: string;
  url: string;
  pricing: string;
  weakness: string;
  estimated_revenue: string;
  rating: string;
}

interface CompetitorRevealProps {
  competitors: Competitor[] | null | undefined;
  blurHitCount?: number;
  onBlurHit?: () => void;
}

const getPricingColor = (pricing: string) => {
  const match = pricing.match(/\$(\d+)/g);
  if (!match) return { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", text: "var(--text-tertiary)" };
  const maxPrice = Math.max(...match.map((m) => parseInt(m.replace("$", ""))));
  if (maxPrice < 50) return { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", text: "#34D399" };
  if (maxPrice <= 200) return { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", text: "#FBBF24" };
  return { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", text: "#F87171" };
};

const CompetitorReveal = ({ competitors, blurHitCount = 0, onBlurHit }: CompetitorRevealProps) => {
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
  const [revealedCards, setRevealedCards] = useState<number>(0);

  // ── NULL state: content not yet generated ──
  if (!competitors || competitors.length === 0) {
    if (competitors === null || competitors === undefined) {
      return (
        <div className="surface-card rounded-xl p-5 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center animate-pulse" style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}>
              <Clock className="w-5 h-5" style={{ color: "#22D3EE" }} strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                🔍 Competitor analysis in progress...
              </p>
              <p className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
                Available within a few hours
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null; // Empty array = no competitors found
  }

  // Auto-reveal cards with stagger for full-access users
  useEffect(() => {
    if (!isLocked && competitors.length > 0 && revealedCards === 0) {
      const t = setTimeout(() => {
        let current = 0;
        const interval = setInterval(() => {
          current++;
          setRevealedCards(current);
          if (current >= competitors.length) clearInterval(interval);
        }, 200); // 200ms stagger between cards
        return () => clearInterval(interval);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [isLocked, competitors.length]);

  // For locked users, show first card immediately
  useEffect(() => {
    if (isLocked && competitors.length > 0) {
      setRevealedCards(competitors.length); // Show all (first visible, rest blurred by CSS)
    }
  }, [isLocked, competitors.length]);

  const renderCompetitorCard = (c: Competitor, i: number, showDetails: boolean) => {
    const priceColor = getPricingColor(c.pricing);
    return (
      <motion.div
        key={c.name}
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, delay: i * 0.08, ease: [0.25, 0.1, 0.25, 1] }}
        className="surface-card rounded-xl p-4 min-w-[240px] sm:min-w-0 flex flex-col"
        style={{
          transform: "none",
          boxShadow: "0 0 0 1px rgba(124,106,237,0.08)",
        }}
      >
        {/* Name + link — always visible */}
        <div className="flex items-center gap-1.5 mb-2 min-w-0">
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-heading text-xs sm:text-sm font-semibold hover:underline truncate min-w-0"
            style={{ color: "var(--text-primary)" }}
          >
            {c.name}
          </a>
          <ExternalLink className="w-3 h-3 flex-shrink-0" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
        </div>

        {/* Rating badge — always visible */}
        {c.rating && (
          <span className="font-body text-[11px] px-2 py-0.5 rounded-md w-fit mb-2" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#FBBF24" }}>
            ⭐ {c.rating}
          </span>
        )}

        {showDetails ? (
          <>
            {/* Pricing pill */}
            <span
              className="font-body text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-md w-fit mb-1 truncate max-w-full inline-block"
              style={{ background: priceColor.bg, border: `1px solid ${priceColor.border}`, color: priceColor.text }}
            >
              {c.pricing}
            </span>

            {/* Revenue */}
            <p className="font-body text-[10px] sm:text-[11px] mb-3 truncate" style={{ color: "var(--text-tertiary)" }}>
              {c.estimated_revenue}
            </p>

            {/* Weakness */}
            <div className="rounded-lg p-3 mt-auto" style={{ background: "rgba(239,68,68,0.06)" }}>
              <div className="flex items-center gap-1 mb-1">
                <Target className="w-3 h-3" style={{ color: "#F87171" }} strokeWidth={1.5} />
                <span className="font-body text-[10px] uppercase tracking-[0.04em] font-medium" style={{ color: "#F87171" }}>
                  Their Weakness
                </span>
              </div>
              <p className="font-body text-xs italic leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {c.weakness}
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-3">
            <Lock className="w-4 h-4 mb-1.5" style={{ color: "#A78BFA", opacity: 0.6 }} strokeWidth={1.5} />
            <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              Detailed insights with Pro
            </span>
          </div>
        )}
      </motion.div>
    );
  };

  // ── Hard paywall: no card entered, or trial expired without paying ──
  if (isHardPaywall && competitors && competitors.length > 0) {
    return (
      <section className="mb-4 sm:mb-6">
        {/* Teaser: competitor names visible to build curiosity */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="surface-card rounded-xl p-4 mb-3"
          style={{ transform: "none" }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}>
              <Target className="w-4 h-4" style={{ color: "#22D3EE" }} strokeWidth={1.5} />
            </div>
            <p className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              🔍 {competitors.length} Competitor{competitors.length !== 1 ? "s" : ""} Found
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {competitors.map((c) => (
              <span key={c.name} className="font-body text-[11px] font-medium px-2.5 py-1 rounded-lg"
                style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)", color: "#22D3EE" }}>
                {c.name}
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
          style={{ background: "rgba(6,182,212,0.04)", border: "1px solid rgba(6,182,212,0.15)" }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}>
            <Lock className="w-5 h-5" style={{ color: "#22D3EE" }} strokeWidth={1.5} />
          </div>
          <p className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Competitor analysis is a Pro feature
          </p>
          <p className="font-body text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
            {planStatus === "none"
              ? "Start your 7-day trial to see pricing, revenue, and weaknesses for every competitor."
              : "Upgrade to Pro to unlock competitor pricing, revenue estimates, and their biggest weaknesses."}
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
      </section>
    );
  }

  return (
    <section className="mb-4 sm:mb-6">
      {/* ── Teaser card: always visible ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="surface-card rounded-xl p-4 mb-3"
        style={{ transform: "none" }}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}>
            <Target className="w-4 h-4" style={{ color: "#22D3EE" }} strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              🔍 {competitors.length} Competitor{competitors.length !== 1 ? "s" : ""} Found
            </p>
          </div>
        </div>

        {/* Competitor name pills — always visible (teases free users) */}
        <div className="flex flex-wrap gap-1.5">
          {competitors.map((c) => (
            <span
              key={c.name}
              className="font-body text-[11px] font-medium px-2.5 py-1 rounded-lg"
              style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)", color: "#22D3EE" }}
            >
              {c.name}
            </span>
          ))}
        </div>
        {isLocked && (
          <p className="font-body text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
            See pricing, revenue, and weaknesses →
          </p>
        )}
      </motion.div>

      {/* ── Full access: staggered card reveal ── */}
      {!isLocked && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 overflow-x-auto sm:overflow-visible pb-1">
          <AnimatePresence>
            {competitors.slice(0, revealedCards).map((c, i) =>
              renderCompetitorCard(c, i, true)
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Locked: first card visible, rest blurred ── */}
      {isLocked && (
        <>
          {/* First card: fully visible */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 overflow-x-auto sm:overflow-visible pb-1 mb-2">
            {renderCompetitorCard(competitors[0], 0, true)}
          </div>

          {/* Rest of cards: behind blur */}
          {competitors.length > 1 && (
            <div className="relative overflow-hidden rounded-xl" style={{ maxHeight: "200px" }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-1 select-none">
                {competitors.slice(1).map((c, i) =>
                  renderCompetitorCard(c, i, false)
                )}
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
                <Lock className="w-5 h-5 mb-2" style={{ color: "#22D3EE" }} strokeWidth={1.5} />
                <p className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                  {blurHitCount >= 3
                    ? `You've explored ${blurHitCount} analyses today. Builders who upgrade explore 10+ daily.`
                    : "See what your competitors charge and where they fail"
                  }
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=feed");
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-heading font-semibold text-white transition-all hover:scale-[1.03] mt-2"
                  style={{ background: !hasUsedTrial ? "linear-gradient(135deg, #F59E0B, #F97316)" : "#7C6AED", boxShadow: !hasUsedTrial ? "0 4px 16px -4px rgba(245,158,11,0.3)" : "0 4px 16px -4px rgba(124,106,237,0.3)" }}
                >
                  <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                  {!hasUsedTrial ? "Start Free Trial" : `Upgrade to Pro — ${priceLabel}`}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* "Where they're weak = where you win" section for full access */}
      {!isLocked && revealedCards >= competitors.length && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-3 rounded-xl p-4"
          style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}
        >
          <p className="font-heading text-xs font-semibold mb-2" style={{ color: "#34D399" }}>
            💡 Where they're weak = where you win
          </p>
          <div className="flex flex-wrap gap-2">
            {competitors.map((c) => (
              <span
                key={c.name}
                className="font-body text-[11px] px-2.5 py-1 rounded-lg"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)", color: "#F87171" }}
              >
                {c.name}: {c.weakness.length > 60 ? c.weakness.substring(0, 57) + "..." : c.weakness}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </section>
  );
};

export default CompetitorReveal;
