// Thin wrapper around useGamification for backward compatibility
import { useGamification } from "./useGamification";

export const useStreakSystem = () => {
  const g = useGamification();
  return {
    currentStreak: g.currentStreak,
    longestStreak: g.longestStreak,
    builderScore: g.xp,
    ideasViewed: 0, // deprecated — use interaction counts directly
    ideasSaved: 0,
    ideasShared: 0,
    checkIn: () => Promise.resolve(),
  };
};
