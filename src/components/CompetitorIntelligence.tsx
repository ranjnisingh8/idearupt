import { ExternalLink, Target, Lock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { PAYMENTS_ENABLED } from "@/lib/config";
import { useProStatus } from "@/hooks/useProStatus";
import { useAuth } from "@/contexts/AuthContext";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";

interface Competitor {
  name: string;
  url: string;
  pricing: string;
  weakness: string;
  estimated_revenue: string;
  rating: string;
}

const getPricingColor = (pricing: string) => {
  const match = pricing.match(/\$(\d+)/g);
  if (!match) return { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", text: "var(--text-tertiary)" };
  const maxPrice = Math.max(...match.map((m) => parseInt(m.replace("$", ""))));
  if (maxPrice < 50) return { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", text: "#34D399" };
  if (maxPrice <= 200) return { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", text: "#FBBF24" };
  return { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", text: "#F87171" };
};

interface Props {
  competitors: Competitor[];
}

const CompetitorIntelligence = ({ competitors }: Props) => {
  const { hasFullAccess, isEarlyAdopter, hasUsedTrial } = useProStatus();
  const { user } = useAuth();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);

  // Gate detailed insights for users without full access (free tier after trial)
  const isGated = PAYMENTS_ENABLED && !hasFullAccess;

  if (!competitors || competitors.length === 0) return null;

  return (
    <section data-premium="true" className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          🏢 Competitor Landscape
        </h4>
        <span
          className="font-body text-[11px] px-2 py-0.5 rounded-md"
          style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#A78BFA" }}
        >
          {competitors.length} competitor{competitors.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 overflow-x-auto sm:overflow-visible pb-1">
        {competitors.map((c, i) => {
          const priceColor = getPricingColor(c.pricing);
          return (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              className="surface-card rounded-xl p-4 min-w-[240px] sm:min-w-0 flex flex-col"
              style={{ transform: "none" }}
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

              {/* Gated content: pricing, revenue, weakness */}
              {isGated ? (
                <div className="flex-1 flex flex-col items-center justify-center py-3">
                  <Lock className="w-4 h-4 mb-1.5" style={{ color: "#A78BFA", opacity: 0.6 }} strokeWidth={1.5} />
                  <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    Detailed insights with Pro
                  </span>
                </div>
              ) : (
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
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Single upgrade CTA below all cards */}
      {isGated && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="mt-3 flex items-center justify-center"
        >
          <button
            onClick={() => openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user?.email || undefined, user?.id)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-heading font-semibold text-white transition-all hover:scale-[1.03]"
            style={{ background: "#7C6AED" }}
          >
            <Sparkles className="w-3 h-3" strokeWidth={2} />
            Upgrade to Pro — {priceLabel}
          </button>
        </motion.div>
      )}
    </section>
  );
};

export default CompetitorIntelligence;
