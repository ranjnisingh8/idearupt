import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProStatus } from "@/hooks/useProStatus";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";

const PaywallOverlay = () => {
  const { user } = useAuth();
  const { isEarlyAdopter, planStatus, hasUsedTrial } = useProStatus();
  const navigate = useNavigate();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);

  return (
    <div className="relative mt-6">
      {/* Frosted glass blur overlay */}
      <div
        className="absolute inset-0 z-10 rounded-2xl flex flex-col items-center justify-center text-center px-6"
        style={{
          background: "linear-gradient(180deg, rgba(12,14,21,0.3) 0%, rgba(12,14,21,0.95) 60%)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{
            background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.1))",
            border: "1px solid rgba(139,92,246,0.25)",
          }}
        >
          <Lock className="w-6 h-6" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
        </div>
        <h3
          className="font-heading text-lg font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Unlock Pro Features
        </h3>
        <p
          className="font-body text-sm mb-5 max-w-sm leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          Pro members get Pain Radar, Sniper Mode Alerts, PDF exports, source threads, idea comparison, and unlimited saves.
        </p>
        <button
          onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=validate")}
          className="px-8 py-3 text-sm font-heading font-semibold inline-flex items-center gap-2 rounded-xl text-white transition-all hover:scale-[1.03]"
          style={{ background: !hasUsedTrial ? "linear-gradient(135deg, #F59E0B, #F97316)" : "linear-gradient(135deg, #7C6AED, #6D5CE7)" }}
        >
          {!hasUsedTrial ? "Start Free Trial" : `Upgrade to Pro — ${priceLabel}`}
        </button>
        <p className="font-body text-[11px] mt-3" style={{ color: "var(--text-tertiary)" }}>
          {!hasUsedTrial ? "7-day full Pro access. Cancel anytime." : "Cancel anytime"}
        </p>
      </div>
    </div>
  );
};

export default PaywallOverlay;
