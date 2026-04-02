import { motion } from "framer-motion";
import { Zap, X, ArrowRight } from "lucide-react";
import { Idea } from "@/data/ideas";
import ScoreBar from "./ScoreBar";
import { useState } from "react";

interface IdeaOfTheDayProps {
  idea: Idea;
  matchScore?: number | null;
  onClick: () => void;
}

const IdeaOfTheDay = ({ idea, matchScore, onClick }: IdeaOfTheDayProps) => {
  const [dismissed, setDismissed] = useState(() => {
    const stored = localStorage.getItem("iotd_dismissed");
    if (!stored) return false;
    return stored === new Date().toISOString().substring(0, 10);
  });

  if (dismissed) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.setItem("iotd_dismissed", new Date().toISOString().substring(0, 10));
    setDismissed(true);
  };

  const score = idea?.overall_score ?? 0;
  const category = idea?.category || "Other";
  const title = idea?.title || "Untitled";
  const description = idea?.description || idea?.oneLiner || "";
  const scoreColor = score >= 9 ? "#10B981" : score >= 7 ? "#06B6D4" : score >= 5 ? "#F59E0B" : "#565B6E";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      onClick={onClick}
      className="relative mb-6 cursor-pointer rounded-[14px] p-[1px] overflow-hidden"
      style={{
        background: '#7C6AED',
      }}
    >
      {/* Border accent — solid */}

      <div className="relative rounded-[13px] p-5 sm:p-6" style={{ background: 'var(--bg-surface)' }}>
        <button onClick={handleDismiss} className="absolute top-3 right-3 p-1.5 rounded-lg transition-colors z-10" style={{ color: 'var(--text-tertiary)' }}>
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 flex-wrap">
          <span className="inline-flex items-center gap-1 sm:gap-1.5 font-body text-[10px] sm:text-[11px] uppercase tracking-[0.06em] font-semibold px-2 sm:px-3 py-1 rounded-md text-gradient-purple-cyan" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <Zap className="w-3 h-3 text-accent shrink-0" strokeWidth={1.5} /> <span className="hidden sm:inline">Idea of the Day</span><span className="sm:hidden">Top Pick</span>
          </span>
          <span className="font-body text-[10px] sm:text-[11px] uppercase tracking-[0.06em] font-medium px-2 sm:px-2.5 py-1 rounded-md" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>
            {category}
          </span>
          {matchScore != null && matchScore > 0 && (
            <span className={`font-body text-[10px] sm:text-[11px] font-semibold px-2 sm:px-2.5 py-1 rounded-md border ${
              matchScore >= 90 ? "bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.25)] text-[#34D399]" : "bg-[rgba(6,182,212,0.12)] border-[rgba(6,182,212,0.25)] text-[#22D3EE]"
            }`}>
              {matchScore}%
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-lg sm:text-2xl font-semibold mb-1.5 sm:mb-2 tracking-[-0.01em] line-clamp-2 break-words" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            <p className="font-body text-xs sm:text-sm line-clamp-2 mb-3 sm:mb-4 leading-relaxed break-words" style={{ color: 'var(--text-secondary)' }}>{description}</p>
            <div className="space-y-1.5 mb-3 sm:mb-4 max-w-xs">
              <ScoreBar label="Pain" value={idea?.scores?.pain_score ?? 0} />
              <ScoreBar label="Revenue" value={idea?.scores?.revenue_potential ?? 0} />
            </div>
            <button className="inline-flex items-center gap-1.5 sm:gap-2 font-heading text-xs sm:text-sm font-semibold text-[#A78BFA] hover:text-[var(--text-primary)] transition-colors duration-150">
              Explore <span className="hidden sm:inline">This Idea</span> <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} />
            </button>
          </div>
          <div className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0">
            <svg className="w-12 h-12 sm:w-14 sm:h-14 -rotate-90" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
              <circle cx="28" cy="28" r="22" fill="none" stroke={scoreColor} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 - (score / 10) * 2 * Math.PI * 22} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-heading text-sm sm:text-base font-bold tabular-nums" style={{ color: scoreColor }}>
              {score.toFixed(1)}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default IdeaOfTheDay;