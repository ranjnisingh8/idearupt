import { useProStatus } from "@/hooks/useProStatus";
import { useUsage, UsageInfo } from "@/hooks/useUsage";

/**
 * Centralized access control hook.
 * Determines what the user can see/do based on trial/pro/free status.
 *
 * Free plan model:
 *   - 3 daily views for ideas, signals, use cases, pain radar
 *   - Within those 3 views, ALL content is fully unlocked (competitors, revenue, quotes)
 *   - After 3 views: locked previews (title + score visible, rest blurred)
 *   - PDF reports: LOCKED
 *   - Pro-exclusive: Alerts, comparison, unlimited saves
 *
 * Usage:
 *   const { canUseFeature, canExportPDF, isContentLocked, ... } = useAccess();
 */

export interface AccessInfo {
  /** Check if a daily-limited feature can be used right now */
  canUseFeature: (feature: string) => UsageInfo;
  /** Increment usage for a feature (call after successful API call) */
  incrementUsage: (feature: string) => Promise<boolean>;
  /** Check if premium content should be locked (DEPRECATED — always false) */
  isContentLocked: (contentType: "competitors" | "revenue" | "dna_match" | "remix") => boolean;
  /** User has full access (Pro or active trial) */
  hasFullAccess: boolean;
  /** User is on active trial */
  isTrial: boolean;
  /** User is Pro subscriber */
  isPro: boolean;
  /** Trial has expired */
  isTrialExpired: boolean;
  /** Days left in trial */
  trialDaysLeft: number;
  /** Loading state */
  loading: boolean;
  /** Pro-exclusive feature flags */
  canExportPDF: boolean;
  canSeeSourceThreads: boolean;
  canCompare: boolean;
  canUsePainRadar: boolean;
  canUseAlerts: boolean;
  /** Max total saved ideas (Infinity for Pro) */
  maxSavedTotal: number;
  /** Hours delay for new ideas (0 for all — free users gated by daily view limit instead) */
  ideaDelayHours: number;
}

export const useAccess = (): AccessInfo => {
  const {
    isPro,
    isTrial,
    isTrialExpired,
    hasFullAccess,
    trialDaysLeft,
    loading: proLoading,
  } = useProStatus();
  const { getUsage, incrementUsage, loading: usageLoading } = useUsage();

  /**
   * Content is never individually locked — free users get full access
   * within their 3 daily views. Gating is at the view-count level.
   */
  const isContentLocked = (_contentType: "competitors" | "revenue" | "dna_match" | "remix"): boolean => {
    return false;
  };

  // Pro-exclusive feature flags
  const canExportPDF = hasFullAccess;
  const canSeeSourceThreads = hasFullAccess;
  const canCompare = hasFullAccess;
  const canUsePainRadar = hasFullAccess;
  const canUseAlerts = hasFullAccess;
  const maxSavedTotal = hasFullAccess ? Infinity : 10;
  // No delay — free users browse all ideas but are gated by 3 daily views + locked cards
  const ideaDelayHours = 0;

  return {
    canUseFeature: getUsage,
    incrementUsage,
    isContentLocked,
    hasFullAccess,
    isTrial,
    isPro,
    isTrialExpired,
    trialDaysLeft,
    loading: proLoading || usageLoading,
    canExportPDF,
    canSeeSourceThreads,
    canCompare,
    canUsePainRadar,
    canUseAlerts,
    maxSavedTotal,
    ideaDelayHours,
  };
};
