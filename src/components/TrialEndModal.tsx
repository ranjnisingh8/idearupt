import { X, Clock, Sparkles, Check, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import { useProStatus } from "@/hooks/useProStatus";

interface TrialEndModalProps {
  open: boolean;
  onClose: () => void;
  trialDaysLeft: number;
}

const TrialEndModal = ({ open, onClose, trialDaysLeft }: TrialEndModalProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isEarlyAdopter, hasUsedTrial } = useProStatus();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);
  const priceNum = isEarlyAdopter ? 9 : 19;
  const isExpired = trialDaysLeft <= 0;

  const proFeatures = [
    "8 idea views, 8 signals, 8 use cases/day",
    "3 validations, 2 deep dives, 2 remixes/day",
    "Pain Radar — live complaint feed by niche",
    "Sniper Mode Alerts — email alerts for matching problems",
    "PDF reports & exports",
    "Original Reddit/HN source threads",
    "Compare ideas side by side",
    "Unlimited saved ideas",
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10001] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={isExpired ? "Trial expired" : "Trial ending soon"}
            className="rounded-2xl p-5 sm:p-6 w-full max-w-sm"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    background: isExpired ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                    border: isExpired ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(245,158,11,0.25)",
                  }}
                >
                  <Clock
                    className="w-4.5 h-4.5"
                    style={{ color: isExpired ? "#F87171" : "#FBBF24" }}
                    strokeWidth={1.5}
                  />
                </div>
                <h3
                  className="font-heading text-base font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {isExpired ? "Trial Ended" : "Trial Ending Soon"}
                </h3>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors"
                style={{ color: "var(--text-tertiary)" }}
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Message */}
            <p
              className="font-body text-sm mb-5 leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {isExpired
                ? "Your Pro trial has ended. Upgrade to keep Pain Radar, Sniper Alerts, PDF exports, source threads, idea comparison, and unlimited saves."
                : `You have ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left in your free trial. Upgrade now to keep uninterrupted access to all Pro features.`}
            </p>

            {/* What you'll lose / keep */}
            <div
              className="rounded-xl p-4 mb-5"
              style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(6,182,212,0.04))",
                border: "1px solid rgba(139,92,246,0.15)",
              }}
            >
              <p
                className="font-heading text-xs font-semibold mb-2 flex items-center gap-1.5"
                style={{ color: "#A78BFA" }}
              >
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                {isExpired ? "Upgrade to unlock:" : "Keep access to:"}
              </p>
              <ul className="space-y-1.5 font-body text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {proFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="w-3 h-3 shrink-0" style={{ color: "#9585F2" }} strokeWidth={2} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pricing */}
            <div
              className="rounded-xl p-4 mb-5 text-center"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="font-mono text-3xl font-bold" style={{ color: "#9585F2" }}>
                  ${priceNum}
                </span>
                <span className="font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
                  /mo
                </span>
              </div>
              <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                Cancel anytime
              </p>
            </div>

            {/* CTA buttons */}
            <button
              onClick={() => {
                onClose();
                if (user) {
                  openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id);
                } else {
                  navigate("/auth?redirect=feed");
                }
              }}
              className="w-full py-3 rounded-[12px] font-heading font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              style={{
                background: "#7C6AED",
                color: "white",
                boxShadow: "0 4px 16px -4px rgba(124,106,237,0.3)",
              }}
            >
              <Sparkles className="w-4 h-4" strokeWidth={1.5} />
              Upgrade to Pro — {priceLabel}
              <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            </button>

            <button
              onClick={onClose}
              className="w-full mt-3 py-2 font-body text-xs text-center transition-colors"
              style={{ color: "var(--text-tertiary)" }}
            >
              {isExpired ? "Continue with free tier" : "I'll decide later"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TrialEndModal;
