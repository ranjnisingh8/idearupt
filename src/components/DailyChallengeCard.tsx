import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Sparkles } from "lucide-react";
import { useDailyChallenge } from "@/hooks/useDailyChallenge";
import { useAuth } from "@/contexts/AuthContext";

const DailyChallengeCard = () => {
  const { user } = useAuth();
  const { challenge, progress, isComplete, isClaimed, loading, claimReward } = useDailyChallenge();
  const [claiming, setClaiming] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    const today = new Date().toISOString().substring(0, 10);
    return localStorage.getItem("daily_challenge_dismissed") === today;
  });

  if (!user || loading || dismissed) return null;

  const handleDismiss = () => {
    const today = new Date().toISOString().substring(0, 10);
    localStorage.setItem("daily_challenge_dismissed", today);
    setDismissed(true);
  };

  const handleClaim = async () => {
    if (claiming) return;
    setClaiming(true);
    await claimReward();
    setClaiming(false);
  };

  const progressPercent = Math.min(100, (progress / challenge.target) * 100);

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          className="mb-3 sm:mb-5"
        >
          <div
            className="surface-card p-3.5 sm:p-4 relative overflow-hidden"
            style={{ transform: "none" }}
          >
            {/* Dismiss button */}
            {isClaimed && (
              <button
                onClick={handleDismiss}
                className="absolute top-1 right-1 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                style={{ color: "var(--text-tertiary)" }}
                aria-label="Dismiss challenge"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )}

            <div className="flex items-start gap-3">
              {/* Emoji */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
                style={{
                  background: isClaimed
                    ? "rgba(16,185,129,0.1)"
                    : isComplete
                    ? "rgba(124,106,237,0.15)"
                    : "rgba(245,158,11,0.08)",
                  border: isClaimed
                    ? "1px solid rgba(16,185,129,0.2)"
                    : isComplete
                    ? "1px solid rgba(124,106,237,0.3)"
                    : "1px solid rgba(245,158,11,0.2)",
                }}
              >
                {isClaimed ? <Check className="w-5 h-5 text-[#10B981]" strokeWidth={2} /> : challenge.emoji}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p
                    className="font-heading text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "var(--accent-purple-light)" }}
                  >
                    Daily Challenge
                  </p>
                  <span
                    className="font-heading text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: "rgba(124,106,237,0.1)",
                      color: "var(--accent-purple-light)",
                    }}
                  >
                    +{challenge.xpReward} XP
                  </span>
                </div>
                <p
                  className="font-heading text-sm font-semibold mb-0.5"
                  style={{ color: "var(--text-primary)" }}
                >
                  {challenge.title}
                </p>
                <p
                  className="font-body text-xs mb-2"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {challenge.description}
                </p>

                {/* Progress bar */}
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: isClaimed
                          ? "#10B981"
                          : isComplete
                          ? "var(--accent-purple)"
                          : "#F59E0B",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                  <span
                    className="font-heading text-[11px] font-bold tabular-nums shrink-0"
                    style={{
                      color: isClaimed
                        ? "#10B981"
                        : isComplete
                        ? "var(--accent-purple-light)"
                        : "var(--text-tertiary)",
                    }}
                  >
                    {Math.min(progress, challenge.target)}/{challenge.target}
                  </span>
                </div>

                {/* Claim button */}
                {isComplete && !isClaimed && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={handleClaim}
                    disabled={claiming}
                    className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-heading font-semibold text-white transition-all hover:scale-[1.03] disabled:opacity-50"
                    style={{
                      background: "var(--accent-purple)",
                      animation: "pulse 2s ease-in-out infinite",
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                    {claiming ? "Claiming..." : `Claim +${challenge.xpReward} XP`}
                  </motion.button>
                )}

                {isClaimed && (
                  <p
                    className="font-body text-[11px] mt-1.5"
                    style={{ color: "#10B981" }}
                  >
                    {"\u2705"} Challenge complete! Come back tomorrow for a new one.
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DailyChallengeCard;
