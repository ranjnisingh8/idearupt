import { X, Clock, Sparkles, Check, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useProStatus } from "@/hooks/useProStatus";
import { useAuth } from "@/contexts/AuthContext";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";

interface LimitReachedModalProps {
  open: boolean;
  onClose: () => void;
  feature: string;
  used: number;
  limit: number;
}

const featureLabels: Record<string, string> = {
  idea_view: "Idea Views",
  signal_view: "Signal Views",
  use_case_view: "Use Case Views",
  save: "Saves",
  validation: "AI Validation",
  blueprint: "Build Blueprint",
  deep_dive: "Deep Dive Analysis",
  competitors: "Competitor Analysis",
  competitor_analysis: "Competitor Analysis",
  remix: "Idea Remix",
};

const LimitReachedModal = ({ open, onClose, feature, used, limit }: LimitReachedModalProps) => {
  const { isTrial, isTrialExpired, trialDaysLeft, isEarlyAdopter, planStatus, hasUsedTrial } = useProStatus();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10001] flex items-center justify-center px-4 glass-overlay"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Daily limit reached"
            className="rounded-2xl p-4 sm:p-6 w-full max-w-sm glass-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)" }}
                >
                  <Clock className="w-4.5 h-4.5" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
                </div>
                <h3 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  Daily Limit Reached
                </h3>
              </div>
              <button onClick={onClose} aria-label="Close" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors" style={{ color: "var(--text-tertiary)" }}>
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Usage info */}
            <div className="rounded-xl p-4 mb-5" style={{ background: "linear-gradient(180deg, rgba(26, 27, 36, 0.8) 0%, var(--bg-elevated) 100%)", border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 2px 8px rgba(0, 0, 0, 0.2)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-body text-sm" style={{ color: "var(--text-secondary)" }}>
                  {featureLabels[feature] || feature}
                </span>
                <span className="font-heading text-sm font-bold tabular-nums" style={{ color: "#A78BFA" }}>
                  {used}/{limit} today
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: "100%", background: "linear-gradient(90deg, #8B5CF6, #A78BFA)" }}
                />
              </div>
              <p className="font-body text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
                Resets at midnight UTC
              </p>
            </div>

            <p className="font-body text-sm mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {!hasUsedTrial
                ? `You've hit your daily free limit for ${featureLabels[feature] || feature}. Start your free trial to unlock higher limits.`
                : isTrial
                  ? `You've hit your daily trial limit for ${featureLabels[feature] || feature}. Upgrade to Pro for higher limits.`
                  : isTrialExpired
                    ? `Your trial has expired. Upgrade to Pro for higher daily limits on ${featureLabels[feature] || feature}.`
                    : `You've hit your daily limit for ${featureLabels[feature] || feature}. Resets at midnight UTC, or upgrade to Pro for higher limits.`}
            </p>

            {/* Pro features preview */}
            <div className="rounded-xl p-4 mb-5" style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(6,182,212,0.05) 100%)",
              border: "1px solid rgba(139,92,246,0.18)",
              boxShadow: "inset 0 1px 0 rgba(139,92,246,0.08), 0 2px 8px rgba(0,0,0,0.15)",
            }}>
              <p className="font-heading text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "#A78BFA" }}>
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} /> Pro Members Get:
              </p>
              <ul className="space-y-1.5 font-body text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {[
                  "8 idea views, 8 signals, 8 use cases/day",
                  "3 validations, 2 deep dives, 2 remixes/day",
                  "Pain Radar — live complaint feed by niche",
                  "Sniper Mode Alerts — email alerts for matching problems",
                  "PDF reports & exports",
                  "Original Reddit/HN source threads",
                  "Compare ideas side by side",
                  "Unlimited saved ideas",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="w-3 h-3 shrink-0" style={{ color: "#9585F2" }} strokeWidth={2} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Upgrade / Start Trial CTA */}
            <button
              onClick={() => {
                onClose();
                if (!user) {
                  navigate("/auth?redirect=feed");
                } else {
                  openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id);
                }
              }}
              className="w-full py-2.5 rounded-[10px] font-heading text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              style={{
                background: !hasUsedTrial ? "linear-gradient(135deg, #F59E0B, #F97316)" : "linear-gradient(180deg, #8F7FF5 0%, #7C6AED 100%)",
                color: "white",
                boxShadow: !hasUsedTrial ? "0 4px 20px -4px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.15)" : "0 4px 20px -4px rgba(124,106,237,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              <Sparkles className="w-4 h-4" strokeWidth={1.5} />
              {!hasUsedTrial ? "Start Free Trial" : `Upgrade to Pro — ${priceLabel}`}
              <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            </button>

            <button
              onClick={onClose}
              className="w-full mt-3 py-2 font-body text-xs text-center transition-colors"
              style={{ color: "var(--text-tertiary)" }}
            >
              I'll wait until tomorrow
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LimitReachedModal;
