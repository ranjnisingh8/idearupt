import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useProStatus } from "@/hooks/useProStatus";
import { FREE_LIMITS, TRIAL_LIMITS } from "@/lib/config";

export interface UsageInfo {
  used: number;
  limit: number;
  remaining: number;
  canUse: boolean;
}

export const useUsage = () => {
  const { user } = useAuth();
  const { isPro, isTrial } = useProStatus();
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Fetch all usage for today in a single RPC call
  const fetchUsage = useCallback(async () => {
    if (!user) {
      setUsage({});
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("get_daily_usage", {
        check_user_id: user.id,
      });

      if (error) {
        // Fallback: direct query
        const today = new Date().toISOString().split("T")[0];
        const { data: rows } = await supabase
          .from("usage_tracking")
          .select("feature, count")
          .eq("user_id", user.id)
          .eq("used_at", today);

        const usageMap: Record<string, number> = {};
        rows?.forEach((row: any) => {
          usageMap[row.feature] = row.count;
        });
        setUsage(usageMap);
      } else {
        // RPC returns { feature: count, ... } or null
        setUsage(data || {});
      }
    } catch {
      // Silently fail — usage will default to 0 (allows action)
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  /**
   * Get the effective limit for a feature based on user status.
   * Pro → Infinity, Trial → TRIAL_LIMITS, Free → FREE_LIMITS
   */
  const getEffectiveLimit = useCallback(
    (feature: string): number => {
      if (isPro) return Infinity;
      if (isTrial) return TRIAL_LIMITS[feature] || FREE_LIMITS[feature] || 1;
      return FREE_LIMITS[feature] || 1;
    },
    [isPro, isTrial]
  );

  /**
   * Get usage info for a specific feature.
   */
  const getUsage = useCallback(
    (feature: string): UsageInfo => {
      // Pro users have unlimited access
      if (isPro) {
        return { used: 0, limit: Infinity, remaining: Infinity, canUse: true };
      }
      const used = usage[feature] || 0;
      const limit = getEffectiveLimit(feature);
      const remaining = Math.max(0, limit - used);
      return {
        used,
        limit,
        remaining,
        canUse: used < limit,
      };
    },
    [usage, isPro, getEffectiveLimit]
  );

  /**
   * Increment usage for a feature.
   * Returns true if the action was allowed, false if limit reached.
   * Rolls back optimistic update on DB failure.
   */
  const incrementUsage = useCallback(
    async (feature: string): Promise<boolean> => {
      if (!user) return true; // Allow anonymous users (no tracking)
      if (isPro) return true; // Pro users bypass all limits

      const current = usage[feature] || 0;
      const limit = getEffectiveLimit(feature);

      if (current >= limit) {
        return false; // Limit reached
      }

      // Optimistically update local state
      setUsage((prev) => ({
        ...prev,
        [feature]: (prev[feature] || 0) + 1,
      }));

      // Persist to database
      try {
        await supabase.rpc("increment_usage", {
          inc_user_id: user.id,
          inc_feature: feature,
        });
      } catch {
        // Rollback optimistic update on DB failure
        setUsage((prev) => ({
          ...prev,
          [feature]: Math.max(0, (prev[feature] || 0) - 1),
        }));
        return false; // Block the action if DB write fails
      }

      return true;
    },
    [user, usage, isPro, getEffectiveLimit]
  );

  return { getUsage, incrementUsage, loading, refetch: fetchUsage };
};
