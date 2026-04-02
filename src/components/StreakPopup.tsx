import { motion, AnimatePresence } from "framer-motion";
import { X, Flame, Trophy, Zap, Target } from "lucide-react";
import { useGamification, LEVELS } from "@/hooks/useGamification";
import { useDailyChallenge } from "@/hooks/useDailyChallenge";

interface StreakPopupProps {
  open: boolean;
  onClose: () => void;
}

const StreakPopup = ({ open, onClose }: StreakPopupProps) => {
  const {
    currentStreak, longestStreak, xp, level, levelName, levelEmoji, progressPercent, xpToNextLevel,
  } = useGamification();
  const { challenge, progress, isComplete, isClaimed } = useDailyChallenge();

  const nextLevel = LEVELS[level + 1];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] glass-overlay"
            onClick={onClose}
          />
          {/* Popup */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[9999] rounded-t-2xl max-h-[80vh] overflow-y-auto"
            style={{
              background: "linear-gradient(180deg, rgba(26, 27, 36, 0.98) 0%, var(--bg-surface) 100%)",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
              boxShadow: "0 -8px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 16px)",
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-subtle)" }} />
            </div>

            <div className="px-5 pb-4">
              {/* Close */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                  Your Progress
                </h3>
                <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-[rgba(255,255,255,0.04)]" aria-label="Close">
                  <X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                </button>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3.5 rounded-xl" style={{ background: "linear-gradient(180deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.03) 100%)", border: "1px solid rgba(245,158,11,0.15)", boxShadow: "inset 0 1px 0 rgba(245,158,11,0.1), 0 2px 8px rgba(0,0,0,0.15)" }}>
                  <Flame className="w-5 h-5 mb-1.5" style={{ color: "#F59E0B" }} strokeWidth={1.5} />
                  <p className="font-heading text-2xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{currentStreak}</p>
                  <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>Day streak</p>
                </div>
                <div className="p-3.5 rounded-xl" style={{ background: "linear-gradient(180deg, rgba(124,106,237,0.08) 0%, rgba(124,106,237,0.03) 100%)", border: "1px solid rgba(124,106,237,0.15)", boxShadow: "inset 0 1px 0 rgba(124,106,237,0.1), 0 2px 8px rgba(0,0,0,0.15)" }}>
                  <Trophy className="w-5 h-5 mb-1.5" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
                  <p className="font-heading text-2xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{longestStreak}</p>
                  <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>Best streak</p>
                </div>
              </div>

              {/* Level + XP */}
              <div className="p-4 rounded-xl mb-4" style={{ background: "rgba(124,106,237,0.06)", border: "1px solid rgba(124,106,237,0.15)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{levelEmoji}</span>
                    <div>
                      <p className="font-heading text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        Lv {level + 1} {levelName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" style={{ color: "#A78BFA" }} strokeWidth={2} />
                    <span className="font-heading text-sm font-bold tabular-nums" style={{ color: "#A78BFA" }}>
                      {xp.toLocaleString()}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 rounded-full overflow-hidden mb-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #8B5CF6, #06B6D4)" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                {nextLevel && (
                  <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    {xpToNextLevel.toLocaleString()} XP to {nextLevel.emoji} {nextLevel.name}
                  </p>
                )}
              </div>

              {/* Daily challenge */}
              <div className="p-3.5 rounded-xl" style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4" style={{ color: "#F59E0B" }} strokeWidth={1.5} />
                  <p className="font-heading text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {isClaimed ? "\u2705 Challenge Complete" : challenge.title}
                  </p>
                </div>
                {!isClaimed && (
                  <>
                    <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (progress / challenge.target) * 100)}%`, background: isComplete ? "#8B5CF6" : "#F59E0B" }}
                      />
                    </div>
                    <p className="font-body text-[11px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                      {Math.min(progress, challenge.target)}/{challenge.target} — +{challenge.xpReward} XP
                    </p>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default StreakPopup;
