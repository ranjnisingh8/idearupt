import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, Clock, Sparkles, CheckCircle2, AlertTriangle, CreditCard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProStatus } from "@/hooks/useProStatus";
import { motion, AnimatePresence } from "framer-motion";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";

const DISMISSED_KEY = "trial-banner-dismissed";
const HIDDEN_ROUTES = ["/auth", "/onboarding", "/quiz"];

const isDismissed = (): boolean => {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    if (!stored) return false;
    return Date.now() - parseInt(stored) < 24 * 60 * 60 * 1000; // 24 hours
  } catch {
    return false;
  }
};

const TrialBanner = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const {
    isTrial, isTrialExpired, isPro, trialDaysLeft, loading,
    subscriptionStatus, planStatus, currentPeriodEnd, cancelAtPeriodEnd,
    isEarlyAdopter, lsCustomerId, hasUsedTrial,
  } = useProStatus();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);
  const navigate = useNavigate();
  const manageUrl = lsCustomerId ? `https://idearupt.lemonsqueezy.com/billing?customer_id=${lsCustomerId}` : null;
  const [dismissed, setDismissed] = useState(isDismissed);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {}
  };

  // Hide on auth/onboarding pages
  if (HIDDEN_ROUTES.includes(pathname)) return null;
  if (dismissed) return null;
  if (loading) return null;
  // Pro or paid users don't need the banner at all
  if (isPro || subscriptionStatus === "pro" || subscriptionStatus === "paid") return null;
  // Active subscribers (plan_status='active') don't need the banner
  if (planStatus === "active") return null;

  // Determine banner state based on plan_status first, then legacy
  const isNoPlan = user && !hasUsedTrial && subscriptionStatus !== "pro" && subscriptionStatus !== "paid";
  const isPastDue = planStatus === "past_due";
  const isCancelledWithAccess = planStatus === "cancelled" && currentPeriodEnd && currentPeriodEnd > new Date();
  const isCancelledExpired = planStatus === "cancelled" && (!currentPeriodEnd || currentPeriodEnd <= new Date());

  // Legacy states
  const isActive = isTrial && trialDaysLeft > 0;
  const isExpired = isTrialExpired;
  const isLastDay = isActive && trialDaysLeft === 1;
  const isUrgent = isActive && trialDaysLeft <= 3 && trialDaysLeft > 1;

  // Format date for cancelled banner
  const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="relative z-20 w-full">
      <div
        className="w-full py-2.5 px-4 sm:px-6"
        style={{
          background: isPastDue || isExpired || isLastDay || isCancelledExpired
            ? "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, #1a1a2e 40%, #1a1a2e 60%, rgba(245,158,11,0.08) 100%)"
            : isNoPlan || isCancelledWithAccess || isUrgent
              ? "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, #1a1a2e 40%, #1a1a2e 60%, rgba(239,68,68,0.08) 100%)"
              : "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, #1a1a2e 40%, #1a1a2e 60%, rgba(6,182,212,0.08) 100%)",
          borderBottom: isPastDue || isExpired || isLastDay || isCancelledExpired
            ? "1px solid rgba(239,68,68,0.12)"
            : isNoPlan || isCancelledWithAccess || isUrgent
              ? "1px solid rgba(245,158,11,0.12)"
              : "1px solid rgba(139,92,246,0.12)",
        }}
      >
        <div className="container mx-auto flex items-center justify-center gap-2 sm:gap-4 relative">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-all"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>

          <AnimatePresence mode="wait">
            {isPastDue ? (
              /* Payment failed — update payment */
              <motion.div
                key="past-due"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 sm:gap-3 pr-8 sm:pr-10"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#F87171" }} strokeWidth={1.5} />
                <p className="font-body text-xs sm:text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>
                  <span className="hidden sm:inline">
                    <span className="font-semibold" style={{ color: "#F87171" }}>Payment failed</span>
                    {" "}— Update your payment method to keep Pro access
                  </span>
                  <span className="sm:hidden">
                    <span className="font-semibold" style={{ color: "#F87171" }}>Payment failed</span>
                    {" "}— Update payment
                  </span>
                </p>
                <button
                  onClick={() => navigate("/settings")}
                  className="shrink-0 h-8 px-3 sm:px-4 text-xs sm:text-sm font-heading font-semibold rounded-lg text-white transition-all duration-200 hover:shadow-lg"
                  style={{
                    background: "#EF4444",
                    boxShadow: "0 0 12px rgba(239,68,68,0.2)",
                  }}
                >
                  <span className="hidden sm:inline">Update Payment</span>
                  <span className="sm:hidden">Update</span>
                </button>
              </motion.div>
            ) : isCancelledWithAccess ? (
              /* Cancelled but still in billing period */
              <motion.div
                key="cancelled-active"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 sm:gap-3 pr-8 sm:pr-10"
              >
                <Clock className="w-4 h-4 shrink-0" style={{ color: "#FBBF24" }} strokeWidth={1.5} />
                <p className="font-body text-xs sm:text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>
                  <span className="hidden sm:inline">
                    <span className="font-semibold" style={{ color: "#FBBF24" }}>
                      Pro access ends {formatDate(currentPeriodEnd!)}
                    </span>
                    {" "}— Resubscribe to keep access
                  </span>
                  <span className="sm:hidden">
                    <span className="font-semibold" style={{ color: "#FBBF24" }}>
                      Ends {formatDate(currentPeriodEnd!)}
                    </span>
                    {" "}— Resubscribe
                  </span>
                </p>
                <button
                  onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=feed")}
                  className="shrink-0 h-8 px-3 sm:px-4 text-xs sm:text-sm font-heading font-semibold rounded-lg text-white transition-all duration-200 hover:shadow-lg"
                  style={{
                    background: "#F59E0B",
                    boxShadow: "0 0 12px rgba(245,158,11,0.2)",
                  }}
                >
                  <span className="hidden sm:inline">Resubscribe</span>
                  <span className="sm:hidden">Resubscribe</span>
                </button>
              </motion.div>
            ) : isNoPlan ? (
              /* plan_status='none' — user signed up but hasn't started trial */
              <motion.div
                key="no-plan"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 sm:gap-3 pr-8 sm:pr-10"
              >
                <CreditCard className="w-4 h-4 shrink-0" style={{ color: "#FB923C" }} strokeWidth={1.5} />
                <p className="font-body text-xs sm:text-sm leading-snug whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  <span className="hidden sm:inline">
                    <span className="font-semibold" style={{ color: "#FB923C" }}>
                      Start your free trial
                    </span>
                    {" "}— Unlock Pain Radar, Sniper Alerts, PDF exports & more
                  </span>
                  <span className="sm:hidden">
                    <span className="font-semibold" style={{ color: "#FB923C" }}>
                      7-day free trial
                    </span>
                    {" "}— Unlock all Pro features
                  </span>
                </p>
                <button
                  onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=feed")}
                  className="shrink-0 h-8 px-3 sm:px-4 text-xs sm:text-sm font-heading font-semibold rounded-lg text-white transition-all duration-200 hover:shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, #F59E0B, #F97316)",
                    boxShadow: "0 0 12px rgba(249,115,22,0.2)",
                  }}
                >
                  <span className="hidden sm:inline">Start Free Trial</span>
                  <span className="sm:hidden">Start Trial</span>
                </button>
              </motion.div>
            ) : isExpired || isCancelledExpired ? (
              /* Trial expired or cancelled+expired — upgrade CTA */
              <motion.div
                key="expired"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 sm:gap-3 pr-8 sm:pr-10"
              >
                <Clock className="w-4 h-4 shrink-0" style={{ color: "#F87171" }} strokeWidth={1.5} />
                <p className="font-body text-xs sm:text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>
                  <span className="hidden sm:inline">
                    {"\u{1F513}"} <span className="font-semibold" style={{ color: "#F87171" }}>Your trial ended</span>
                    {" "}— Upgrade for Pain Radar, Sniper Alerts, PDF exports & more
                  </span>
                  <span className="sm:hidden">
                    {"\u{1F513}"} <span className="font-semibold" style={{ color: "#F87171" }}>Trial ended</span>
                    {" "}— Upgrade now
                  </span>
                </p>
                <button
                  onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=feed")}
                  className="shrink-0 h-8 px-3 sm:px-4 text-xs sm:text-sm font-heading font-semibold rounded-lg text-white transition-all duration-200 hover:shadow-lg"
                  style={{
                    background: "#7C6AED",
                    boxShadow: "0 0 12px rgba(124,106,237,0.2)",
                  }}
                >
                  <span className="hidden sm:inline">Upgrade — {priceLabel}</span>
                  <span className="sm:hidden">Upgrade</span>
                </button>
              </motion.div>
            ) : isActive ? (
              /* Active trial — show days left */
              <motion.div
                key="active"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 sm:gap-3 pr-8 sm:pr-10"
              >
                {isLastDay ? (
                  <Clock className="w-4 h-4 shrink-0" style={{ color: "#F87171" }} strokeWidth={1.5} />
                ) : isUrgent ? (
                  <Clock className="w-4 h-4 shrink-0" style={{ color: "#FBBF24" }} strokeWidth={1.5} />
                ) : (
                  <Sparkles className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.5} />
                )}
                <p className="font-body text-xs sm:text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>
                  <span className="hidden sm:inline">
                    {isLastDay ? (
                      <>
                        <span className="font-semibold" style={{ color: "#F87171" }}>
                          {"\u26A1"} Pro Trial — Last day!
                        </span>
                        {planStatus === "trial"
                          ? ` — Your card will be charged ${priceLabel} tomorrow`
                          : " — Upgrade now to keep access"}
                      </>
                    ) : isUrgent ? (
                      <>
                        <span className="font-semibold" style={{ color: "#FBBF24" }}>
                          {"\u26A1"} Pro Trial — {trialDaysLeft} days left
                        </span>
                        {planStatus === "trial"
                          ? ` — Your card will be charged ${priceLabel}`
                          : " — Upgrade now to keep access"}
                      </>
                    ) : (
                      <>
                        <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          {"\u26A1"} Free trial: {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining
                        </span>
                      </>
                    )}
                  </span>
                  <span className="sm:hidden">
                    {isLastDay ? (
                      <>
                        <span className="font-semibold" style={{ color: "#F87171" }}>
                          Last day!
                        </span>
                        {planStatus === "trial" ? ` — Charged ${priceLabel} tomorrow` : " — Upgrade now"}
                      </>
                    ) : isUrgent ? (
                      <>
                        <span className="font-semibold" style={{ color: "#FBBF24" }}>
                          {trialDaysLeft}d left
                        </span>
                        {planStatus === "trial" ? ` — Charged ${priceLabel}` : " — Upgrade now"}
                      </>
                    ) : (
                      <>
                        Trial: {trialDaysLeft}d left
                      </>
                    )}
                  </span>
                </p>
                {/* Card-required trial users already have a subscription — show Manage link, not Upgrade */}
                {planStatus === "trial" && manageUrl && !isLastDay && !isUrgent ? (
                  <a
                    href={manageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 h-8 px-3 sm:px-4 text-xs sm:text-sm font-heading font-semibold rounded-lg text-white transition-all duration-200 hover:shadow-lg inline-flex items-center"
                    style={{
                      background: "#7C6AED",
                      boxShadow: "0 0 12px rgba(124,106,237,0.2)",
                    }}
                  >
                    <span className="hidden sm:inline">Manage Subscription</span>
                    <span className="sm:hidden">Manage</span>
                  </a>
                ) : (
                  <button
                    onClick={() => planStatus === "trial" && manageUrl
                      ? window.open(manageUrl, "_blank")
                      : user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=feed")
                    }
                    className="shrink-0 h-8 px-3 sm:px-4 text-xs sm:text-sm font-heading font-semibold rounded-lg text-white transition-all duration-200 hover:shadow-lg"
                    style={{
                      background: isLastDay ? "#EF4444" : isUrgent ? "#F59E0B" : "#7C6AED",
                      boxShadow: isLastDay
                        ? "0 0 12px rgba(239,68,68,0.2)"
                        : isUrgent
                          ? "0 0 12px rgba(245,158,11,0.2)"
                          : "0 0 12px rgba(124,106,237,0.2)",
                    }}
                  >
                    <span className="hidden sm:inline">{isLastDay || isUrgent ? "Manage Subscription" : `Upgrade — ${priceLabel}`}</span>
                    <span className="sm:hidden">{isLastDay || isUrgent ? "Manage" : "Upgrade"}</span>
                  </button>
                )}
              </motion.div>
            ) : (
              /* Not logged in or free with no trial */
              <motion.div
                key="default"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 sm:gap-3 pr-8 sm:pr-10"
              >
                <Sparkles className="w-4 h-4 text-primary shrink-0 hidden sm:block" strokeWidth={1.5} />
                <p className="font-body text-xs sm:text-sm text-[var(--text-secondary)] leading-snug">
                  <span className="hidden sm:inline">
                    <span className="text-[var(--text-primary)] font-semibold">Start your 7-day free trial</span>
                    {" "}— Full access to all Pro features
                  </span>
                  <span className="sm:hidden">
                    7-day free trial —{" "}
                    <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                      Try Pro free
                    </span>
                  </span>
                </p>
                <button
                  onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=pricing")}
                  className="shrink-0 h-8 px-3 sm:px-4 text-xs sm:text-sm font-heading font-semibold rounded-lg text-white transition-all duration-200 hover:shadow-lg"
                  style={{
                    background: "#7C6AED",
                    boxShadow: "0 0 12px rgba(124,106,237,0.2)",
                  }}
                >
                  <span className="hidden sm:inline">Start Free Trial</span>
                  <span className="sm:hidden">Try Free</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default TrialBanner;
