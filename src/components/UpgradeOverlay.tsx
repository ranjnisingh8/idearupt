import { Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProStatus } from "@/hooks/useProStatus";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";

interface UpgradeOverlayProps {
  title?: string;
  subtitle?: string;
}

const UpgradeOverlay = ({
  title = "Upgrade to Pro to see more",
  subtitle = "Unlock all daily content & insights",
}: UpgradeOverlayProps) => {
  const { user } = useAuth();
  const { isEarlyAdopter, planStatus, hasUsedTrial } = useProStatus();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);
  const navigate = useNavigate();

  // User who hasn't started trial yet — show "Start Free Trial" instead of "Upgrade"
  const isNoPlan = !hasUsedTrial && !!user;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate("/auth?redirect=feed");
    } else {
      openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id);
    }
  };

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center z-10 rounded-2xl"
      style={{
        background: "rgba(10, 11, 16, 0.6)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="flex flex-col items-center gap-3">
        <Lock className="w-6 h-6" style={{ color: "var(--accent-lavender)" }} strokeWidth={1.5} />
        <div className="text-center">
          <p className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            {isNoPlan ? "Start your free trial to unlock this" : title}
          </p>
          <p className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
            {isNoPlan ? "7-day full Pro access. Cancel anytime." : subtitle}
          </p>
        </div>
        <button
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-heading font-semibold text-white transition-all duration-200 hover:scale-[1.03]"
          style={{ background: isNoPlan ? "linear-gradient(135deg, #F59E0B, #F97316)" : "var(--accent-purple)" }}
        >
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
          {isNoPlan ? "Start Free Trial" : `Upgrade to Pro \u2014 ${priceLabel}`}
        </button>
      </div>
    </div>
  );
};

export default UpgradeOverlay;
