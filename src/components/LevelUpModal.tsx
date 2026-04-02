import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { LEVELS } from "@/hooks/useGamification";

interface LevelUpModalProps {
  levelUp: { oldLevel: number; newLevel: number } | null;
  onDismiss: () => void;
}

const LevelUpModal = ({ levelUp, onDismiss }: LevelUpModalProps) => {
  // Auto-dismiss after 4s
  useEffect(() => {
    if (!levelUp) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [levelUp, onDismiss]);

  const newLvl = levelUp ? LEVELS[levelUp.newLevel] || LEVELS[0] : null;

  return createPortal(
    <AnimatePresence>
      {levelUp && newLvl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
          onClick={onDismiss}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(10, 11, 16, 0.7)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          />

          {/* Particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  background: i % 3 === 0
                    ? "var(--accent-purple)"
                    : i % 3 === 1
                    ? "var(--accent-purple-light)"
                    : "#F59E0B",
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1.5, 0],
                  y: [0, -100 - Math.random() * 200],
                  x: [0, (Math.random() - 0.5) * 200],
                }}
                transition={{
                  duration: 2 + Math.random(),
                  delay: Math.random() * 0.5,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>

          {/* Card */}
          <motion.div
            initial={{ scale: 0.5, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="relative z-10 flex flex-col items-center gap-4 p-8 rounded-2xl max-w-xs mx-4"
            style={{
              background: "rgba(20, 22, 30, 0.95)",
              border: "1px solid rgba(124, 106, 237, 0.3)",
              boxShadow: "0 0 80px rgba(124, 106, 237, 0.2), 0 20px 60px rgba(0,0,0,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Level emoji */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.2 }}
              className="text-5xl"
            >
              {newLvl.emoji}
            </motion.div>

            {/* Text */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <p
                className="font-heading text-xs font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--accent-purple-light)" }}
              >
                Level Up!
              </p>
              <p
                className="font-heading text-2xl font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {newLvl.name}
              </p>
              <p
                className="font-body text-xs mt-1"
                style={{ color: "var(--text-tertiary)" }}
              >
                Level {levelUp.newLevel}
              </p>
            </motion.div>

            {/* Progress hint */}
            {LEVELS[levelUp.newLevel + 1] && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="font-body text-[11px] text-center"
                style={{ color: "var(--text-tertiary)" }}
              >
                Next: {LEVELS[levelUp.newLevel + 1].emoji} {LEVELS[levelUp.newLevel + 1].name} at{" "}
                {LEVELS[levelUp.newLevel + 1].threshold.toLocaleString()} XP
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default LevelUpModal;
