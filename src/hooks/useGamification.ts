import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export interface LevelDef {
  name: string;
  emoji: string;
  threshold: number;
}

export const LEVELS: LevelDef[] = [
  { name: "Curious", emoji: "\u{1F331}", threshold: 0 },
  { name: "Explorer", emoji: "\u{1F50D}", threshold: 50 },
  { name: "Tinkerer", emoji: "\u{1F527}", threshold: 150 },
  { name: "Builder", emoji: "\u{1F3D7}", threshold: 400 },
  { name: "Strategist", emoji: "\u{1F9E0}", threshold: 800 },
  { name: "Visionary", emoji: "\u{1F52D}", threshold: 1500 },
  { name: "Architect", emoji: "\u{1F3AF}", threshold: 3000 },
  { name: "Mogul", emoji: "\u{1F451}", threshold: 5000 },
  { name: "Legend", emoji: "\u{1F525}", threshold: 8000 },
  { name: "Top 1%", emoji: "\u{1F48E}", threshold: 12000 },
];

export interface GamificationState {
  currentStreak: number;
  longestStreak: number;
  xp: number;
  level: number;
  levelName: string;
  levelEmoji: string;
  progressPercent: number;
  xpToNextLevel: number;
  streakAtRisk: boolean;
  dailyChallengeCompletedAt: string | null;
  loading: boolean;
}

export interface ActivityResult {
  xp_gained: number;
  streak_bonus: number;
  streak_broken: boolean;
  level_up: boolean;
  old_level: number;
  current_streak: number;
  longest_streak: number;
  xp: number;
  level: number;
}

interface XPEvent {
  amount: number;
  id: number;
}

interface LevelUpEvent {
  oldLevel: number;
  newLevel: number;
}

let xpEventCounter = 0;

export const useGamification = () => {
  const { user } = useAuth();
  const [state, setState] = useState<GamificationState>({
    currentStreak: 0,
    longestStreak: 0,
    xp: 0,
    level: 0,
    levelName: LEVELS[0].name,
    levelEmoji: LEVELS[0].emoji,
    progressPercent: 0,
    xpToNextLevel: LEVELS[1].threshold,
    streakAtRisk: false,
    dailyChallengeCompletedAt: null,
    loading: true,
  });

  const [xpEvents, setXpEvents] = useState<XPEvent[]>([]);
  const [levelUpEvent, setLevelUpEvent] = useState<LevelUpEvent | null>(null);
  const [streakBroken, setStreakBroken] = useState(false);
  const initialLoadDone = useRef(false);

  const computeDerived = useCallback((xp: number, level: number) => {
    const lvl = LEVELS[level] || LEVELS[0];
    const nextLvl = LEVELS[level + 1];
    let progressPercent = 100;
    let xpToNextLevel = 0;

    if (nextLvl) {
      const currentThreshold = lvl.threshold;
      const nextThreshold = nextLvl.threshold;
      const range = nextThreshold - currentThreshold;
      const progress = xp - currentThreshold;
      progressPercent = Math.min(100, Math.round((progress / range) * 100));
      xpToNextLevel = nextThreshold - xp;
    }

    return {
      levelName: lvl.name,
      levelEmoji: lvl.emoji,
      progressPercent,
      xpToNextLevel,
    };
  }, []);

  // Fetch gamification state on mount
  useEffect(() => {
    if (!user) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    const fetchState = async () => {
      try {
        const { data, error } = await supabase.rpc("get_gamification_state");

        if (error || !data || data.error) {
          setState((s) => ({ ...s, loading: false }));
          return;
        }

      const derived = computeDerived(data.xp || 0, data.level || 0);

      setState({
        currentStreak: data.current_streak || 0,
        longestStreak: data.longest_streak || 0,
        xp: data.xp || 0,
        level: data.level || 0,
        ...derived,
        streakAtRisk: !!data.streak_at_risk,
        dailyChallengeCompletedAt: data.daily_challenge_completed_at || null,
        loading: false,
      });

      initialLoadDone.current = true;
      } catch {
        // RPC may not exist yet — silently fail
        setState((s) => ({ ...s, loading: false }));
      }
    };

    fetchState();
  }, [user, computeDerived]);

  // Record an activity and get XP
  const recordActivity = useCallback(
    async (action: string, xpAmount: number): Promise<ActivityResult | null> => {
      if (!user) return null;

      try {
        const { data, error } = await supabase.rpc("record_activity", {
          p_action: action,
          p_xp_amount: xpAmount,
        });

        if (error || !data) return null;

      const result = data as ActivityResult;
      const derived = computeDerived(result.xp, result.level);

      // Update state
      setState((prev) => ({
        ...prev,
        currentStreak: result.current_streak,
        longestStreak: result.longest_streak,
        xp: result.xp,
        level: result.level,
        ...derived,
        streakAtRisk: false,
      }));

      // Fire XP toast event
      if (result.xp_gained > 0) {
        const event: XPEvent = { amount: result.xp_gained, id: ++xpEventCounter };
        setXpEvents((prev) => [...prev, event]);
        // Auto-remove after animation
        setTimeout(() => {
          setXpEvents((prev) => prev.filter((e) => e.id !== event.id));
        }, 2000);
      }

      // Fire level up event
      if (result.level_up) {
        setLevelUpEvent({ oldLevel: result.old_level, newLevel: result.level });
      }

      // Streak broken notification
      if (result.streak_broken && initialLoadDone.current) {
        setStreakBroken(true);
      }

      return result;
      } catch {
        // RPC may not exist yet — silently fail
        return null;
      }
    },
    [user, computeDerived]
  );

  const dismissLevelUp = useCallback(() => setLevelUpEvent(null), []);
  const dismissStreakBroken = useCallback(() => setStreakBroken(false), []);

  const removeXpEvent = useCallback((id: number) => {
    setXpEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return {
    ...state,
    xpEvents,
    levelUpEvent,
    streakBroken,
    recordActivity,
    dismissLevelUp,
    dismissStreakBroken,
    removeXpEvent,
  };
};
