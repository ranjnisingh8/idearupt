import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProStatus } from "@/hooks/useProStatus";
import { openCheckout, getPlanForUser, resolveCheckoutPlan } from "@/utils/checkout";

interface ProBadgeProps {
  feature?: string;
  size?: "sm" | "md";
  className?: string;
}

const ProBadge = ({ feature, size = "sm", className = "" }: ProBadgeProps) => {
  const { user } = useAuth();
  const { isEarlyAdopter, planStatus, hasUsedTrial } = useProStatus();
  const navigate = useNavigate();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const [showTooltip, setShowTooltip] = useState(false);

  const alreadySeen = feature
    ? (() => {
        try {
          return sessionStorage.getItem(`pro-tooltip-${feature}`) === "1";
        } catch {
          return false;
        }
      })()
    : false;

  const handleInteraction = () => {
    if (alreadySeen) return;
    setShowTooltip(true);
    if (feature) {
      try {
        sessionStorage.setItem(`pro-tooltip-${feature}`, "1");
      } catch {
        // ignore quota errors
      }
    }
  };

  const sizeClasses =
    size === "sm"
      ? "text-[8px] px-1.5 py-[1px] gap-0"
      : "text-[9px] px-2 py-0.5 gap-0.5";

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <motion.span
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`inline-flex items-center rounded-full font-bold uppercase tracking-wider cursor-default select-none ${sizeClasses}`}
        style={{
          background: "rgba(124,106,237,0.1)",
          color: "#9585F2",
          letterSpacing: "0.08em",
        }}
        onMouseEnter={handleInteraction}
        onClick={(e) => {
          e.stopPropagation();
          handleInteraction();
        }}
      >
        PRO
      </motion.span>

      {/* Tooltip — once per feature per session */}
      <AnimatePresence>
        {showTooltip && !alreadySeen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute z-[100] bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 sm:w-64 max-w-[calc(100vw-2rem)] p-3 rounded-xl"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid rgba(124,106,237,0.2)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="font-body text-xs leading-relaxed mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              This is a Pro feature with higher daily limits.
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowTooltip(false);
                if (user) {
                  openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id);
                } else {
                  navigate("/auth?redirect=feed");
                }
              }}
              className="font-heading text-[11px] font-semibold transition-colors"
              style={{ color: !hasUsedTrial ? "#F59E0B" : "#9585F2" }}
            >
              {!hasUsedTrial ? "Start Free Trial →" : "Upgrade to Pro →"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowTooltip(false);
              }}
              className="absolute top-1.5 right-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
};

export default ProBadge;
