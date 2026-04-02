import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export type SubscriptionStatus = "free" | "trial" | "pro" | "paid" | "churned";
export type PlanStatus = "none" | "trial" | "active" | "free" | "cancelled" | "past_due";

export interface ProStatus {
  /** User is an active Pro subscriber */
  isPro: boolean;
  /** User is on an active 7-day trial */
  isTrial: boolean;
  /** Trial has expired (was trial, now past trial_ends_at) */
  isTrialExpired: boolean;
  /** User has used a trial before (active, expired, or cancelled) — used to pick no-trial checkout variant */
  hasUsedTrial: boolean;
  /** Has full access (Pro OR active trial OR cancelled but still in period) */
  hasFullAccess: boolean;
  /** Days remaining in trial (0 if expired or not on trial) */
  trialDaysLeft: number;
  /** Raw subscription status (legacy) */
  subscriptionStatus: SubscriptionStatus;
  /** New plan status from Lemon Squeezy flow */
  planStatus: PlanStatus;
  /** Trial end date */
  trialEndsAt: Date | null;
  /** Current billing period end (from Lemon Squeezy) */
  currentPeriodEnd: Date | null;
  /** Whether subscription is set to cancel at period end */
  cancelAtPeriodEnd: boolean;
  /** Lemon Squeezy customer ID (for manage subscription link) */
  lsCustomerId: string | null;
  /** User is on pro waitlist */
  isOnWaitlist: boolean;
  /** User was flagged as an early adopter ($9/mo forever) */
  isEarlyAdopter: boolean;
  /** Loading state */
  loading: boolean;
  /** Refetch trial status */
  refetch: () => void;
}

/**
 * Determine if user has Pro access.
 * Checks new plan_status first, then falls back to legacy subscription_status.
 */
function computeHasProAccess(
  planStatus: PlanStatus,
  subscriptionStatus: SubscriptionStatus,
  currentPeriodEnd: Date | null,
  trialEndsAt: Date | null,
): boolean {
  const now = new Date();

  // New plan_status system (card-required trial via Lemon Squeezy)
  if (planStatus === "active") return true;
  // Trial users: only grant access if trial hasn't expired yet
  if (planStatus === "trial") {
    return !trialEndsAt || trialEndsAt > now;
  }
  if (planStatus === "cancelled" && currentPeriodEnd && currentPeriodEnd > now) return true;

  // Legacy subscription_status system (existing users from before card-required)
  if (planStatus === "none" || !planStatus) {
    if (subscriptionStatus === "pro" || subscriptionStatus === "paid") return true;
    if (subscriptionStatus === "trial" && trialEndsAt && trialEndsAt > now) return true;
  }

  return false;
}

export const useProStatus = (): ProStatus => {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus>("free");
  const [planStatus, setPlanStatus] = useState<PlanStatus>("none");
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<Date | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [lsCustomerId, setLsCustomerId] = useState<string | null>(null);
  const [rpcDaysLeft, setRpcDaysLeft] = useState<number | null>(null);
  const [isOnWaitlist, setIsOnWaitlist] = useState(false);
  const [earlyAdopter, setEarlyAdopter] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setStatus("free");
      setPlanStatus("none");
      setTrialEndsAt(null);
      setCurrentPeriodEnd(null);
      setCancelAtPeriodEnd(false);
      setLsCustomerId(null);
      setRpcDaysLeft(null);
      setIsOnWaitlist(false);
      setEarlyAdopter(false);
      setLoading(false);
      return;
    }

    try {
      // Fetch plan status via new RPC (includes all fields)
      const { data: planData } = await Promise.resolve(
        supabase.rpc("get_user_plan_status", {
          p_user_id: user.id,
        })
      );

      if (planData) {
        setPlanStatus((planData.plan_status as PlanStatus) || "none");
        setStatus((planData.subscription_status as SubscriptionStatus) || "free");
        setTrialEndsAt(planData.trial_ends_at ? new Date(planData.trial_ends_at) : null);
        setCurrentPeriodEnd(planData.current_period_end ? new Date(planData.current_period_end) : null);
        setCancelAtPeriodEnd(!!planData.cancel_at_period_end);
        setLsCustomerId(planData.ls_customer_id || null);
        setEarlyAdopter(!!planData.is_early_adopter);
      } else {
        // Fallback: try legacy RPC
        const { data: trialData } = await Promise.resolve(
          supabase.rpc("get_user_trial_status", {
            p_user_id: user.id,
          })
        );

        if (trialData) {
          setStatus(trialData.subscription_status || "free");
          setTrialEndsAt(trialData.trial_ends_at ? new Date(trialData.trial_ends_at) : null);
          setRpcDaysLeft(typeof trialData.trial_days_left === "number" ? trialData.trial_days_left : null);
        } else {
          // Final fallback: direct query
          const { data: userData } = await supabase
            .from("users")
            .select("subscription_status, trial_ends_at, is_early_adopter, plan_status, current_period_end, cancel_at_period_end, ls_customer_id")
            .eq("id", user.id)
            .maybeSingle();

          if (userData) {
            setStatus((userData.subscription_status as SubscriptionStatus) || "free");
            setPlanStatus((userData.plan_status as PlanStatus) || "none");
            setTrialEndsAt(userData.trial_ends_at ? new Date(userData.trial_ends_at) : null);
            setCurrentPeriodEnd(userData.current_period_end ? new Date(userData.current_period_end) : null);
            setCancelAtPeriodEnd(!!userData.cancel_at_period_end);
            setLsCustomerId(userData.ls_customer_id || null);
            setEarlyAdopter(!!userData.is_early_adopter);
          }
        }
      }

      // Always fetch early adopter flag if not already set
      if (!earlyAdopter) {
        const { data: eaData } = await supabase
          .from("users")
          .select("is_early_adopter")
          .eq("id", user.id)
          .maybeSingle();
        if (eaData) setEarlyAdopter(!!eaData.is_early_adopter);
      }

      // Check waitlist status
      const { data: waitlistData } = await supabase
        .from("pro_waitlist")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setIsOnWaitlist(!!waitlistData);
    } catch {
      // Silently fail — default to free
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-expire trial the instant trial_ends_at passes — refetch to flip UI immediately
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    if (!trialEndsAt) return;
    const msLeft = trialEndsAt.getTime() - Date.now();
    if (msLeft <= 0) return; // Already expired — no timer needed
    // Schedule refetch for the exact expiry moment (+ 500ms buffer for clock drift)
    expiryTimerRef.current = setTimeout(() => fetchStatus(), msLeft + 500);
    return () => { if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current); };
  }, [trialEndsAt, fetchStatus]);

  // Compute derived states
  const now = new Date();
  const isPro = status === "pro" || status === "paid" || planStatus === "active";
  const isTrial =
    (planStatus === "trial" && (!trialEndsAt || trialEndsAt > now)) ||
    (planStatus === "none" && status === "trial" && trialEndsAt !== null && trialEndsAt > now);
  const isTrialExpired =
    !isPro && !isTrial &&
    trialEndsAt !== null &&
    trialEndsAt <= now;
  const hasFullAccess = computeHasProAccess(planStatus, status, currentPeriodEnd, trialEndsAt);

  // User has used a trial only if they have a Lemon Squeezy customer ID.
  // ls_customer_id is ONLY set by the LS webhook when a user actually goes through checkout.
  // NOTE: Do NOT use trialEndsAt — the auto_start_trial trigger sets trial_ends_at for
  // ALL new users on signup (legacy behavior), so it's not a reliable signal.
  const hasUsedTrial = lsCustomerId !== null;

  // Use server-computed days if available, otherwise calculate client-side with Math.ceil
  const trialDaysLeft =
    isTrial && trialEndsAt
      ? rpcDaysLeft !== null
        ? Math.max(0, rpcDaysLeft)
        : Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

  return {
    isPro,
    isTrial,
    isTrialExpired,
    hasUsedTrial,
    hasFullAccess,
    trialDaysLeft,
    subscriptionStatus: status,
    planStatus,
    trialEndsAt,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    lsCustomerId,
    isOnWaitlist,
    isEarlyAdopter: earlyAdopter,
    loading,
    refetch: fetchStatus,
  };
};
