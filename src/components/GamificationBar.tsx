import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Star, Flame } from "lucide-react";
import { useGamification, LEVELS } from "@/hooks/useGamification";

const GamificationBar = () => {
  const { user } = useAuth();
  const {
    currentStreak, xp, level, levelName, levelEmoji,
    progressPercent, xpToNextLevel, loading,
  } = useGamification();

  if (!user || loading) return null;

  const nextLevel = LEVELS[level + 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card p-3 sm:p-4 mb-3 sm:mb-5 overflow-hidden relative"
      style={{ transform: 'none' }}
    >
      {/* Ambient glow */}
      <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)' }} />

      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base sm:text-lg shrink-0">{levelEmoji}</span>
          <div className="min-w-0">
            <p className="font-heading text-[11px] sm:text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              Lv {level + 1} — {levelName}
            </p>
            <p className="font-body text-[9px] sm:text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
              {nextLevel ? `${xpToNextLevel} XP to ${nextLevel.name}` : "Max level!"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {currentStreak > 0 && (
            <div className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#F59E0B]" strokeWidth={1.5} />
              <span className="font-heading text-[11px] sm:text-xs font-bold tabular-nums" style={{ color: '#F59E0B' }}>{currentStreak}</span>
            </div>
          )}
          <div className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg"
            style={{ background: 'rgba(124,106,237,0.08)', border: '1px solid rgba(124,106,237,0.2)' }}>
            <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: 'var(--accent-purple-light)' }} strokeWidth={1.5} />
            <span className="font-heading text-[11px] sm:text-xs font-bold tabular-nums" style={{ color: 'var(--accent-purple-light)' }}>{xp.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* XP Progress bar */}
      <div className="xp-bar">
        <motion.div
          className="xp-bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progressPercent, 100)}%` }}
          transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1], delay: 0.3 }}
        />
      </div>
    </motion.div>
  );
};

export default GamificationBar;
