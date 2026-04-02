import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getTodaysChallenge, Challenge } from "@/data/challenges";
import { useGamification } from "./useGamification";

interface DailyChallengeState {
  challenge: Challenge;
  progress: number;
  isComplete: boolean;
  isClaimed: boolean;
  loading: boolean;
}

export const useDailyChallenge = () => {
  const { user } = useAuth();
  const { dailyChallengeCompletedAt } = useGamification();
  const challenge = getTodaysChallenge();
  const todayStr = new Date().toISOString().substring(0, 10);

  const [state, setState] = useState<DailyChallengeState>({
    challenge,
    progress: 0,
    isComplete: false,
    isClaimed: dailyChallengeCompletedAt === todayStr,
    loading: true,
  });

  // Fetch today's progress from user_interactions
  useEffect(() => {
    if (!user) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    const fetchProgress = async () => {
      try {
        const todayStart = `${todayStr}T00:00:00`;
        const todayEnd = `${todayStr}T23:59:59`;

        const { data } = await supabase
          .from("user_interactions")
          .select("id")
          .eq("user_id", user.id)
          .eq("action", challenge.action)
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd);

        const progress = data?.length ?? 0;
        const isComplete = progress >= challenge.target;

        setState((s) => ({
          ...s,
          progress,
          isComplete,
          isClaimed: dailyChallengeCompletedAt === todayStr,
          loading: false,
        }));
      } catch {
        setState((s) => ({ ...s, loading: false }));
      }
    };

    fetchProgress();

    // Also subscribe to realtime changes to update progress
    const channel = supabase
      .channel("daily-challenge-progress")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_interactions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const action = (payload.new as any)?.action;
          if (action === challenge.action) {
            setState((prev) => {
              const newProgress = prev.progress + 1;
              return {
                ...prev,
                progress: newProgress,
                isComplete: newProgress >= challenge.target,
              };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, challenge.action, challenge.target, todayStr, dailyChallengeCompletedAt]);

  // Claim reward
  const claimReward = useCallback(async () => {
    if (!user || state.isClaimed || !state.isComplete) return null;

    try {
      const { data, error } = await supabase.rpc("complete_daily_challenge", {
        p_user_id: user.id,
      });

      if (error || !data) return null;

      if (data.already_claimed) {
        setState((s) => ({ ...s, isClaimed: true }));
        return null;
      }

      setState((s) => ({ ...s, isClaimed: true }));
      return data;
    } catch {
      return null;
    }
  }, [user, state.isClaimed, state.isComplete]);

  return {
    ...state,
    claimReward,
  };
};
