import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Clock } from "lucide-react";
import { Idea } from "@/data/ideas";

const isTouchDevice = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

interface DailyDropProps {
  ideas: Idea[];
  onIdeaClick: (idea: Idea) => void;
  /** Exclude this idea ID from drops (e.g., Idea of the Day) to avoid showing it twice */
  excludeId?: string;
}

const DropCard = ({ idea, onClick, missed }: { idea: Idea; onClick: () => void; missed?: boolean }) => {
  const score = idea?.overall_score ?? 0;
  const scoreColor = score >= 9 ? "#10B981" : score >= 7 ? "#06B6D4" : score >= 5 ? "#F59E0B" : "#565B6E";

  return (
    <motion.div
      {...(!isTouchDevice && { whileHover: { y: -4 } })}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative flex-shrink-0 w-[240px] sm:w-[280px] cursor-pointer rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid transparent',
        opacity: missed ? 0.6 : 1,
      }}
    >
      {/* Animated gradient border */}
      <div className="absolute inset-0 rounded-2xl p-[1px] pointer-events-none" style={{ background: 'conic-gradient(from var(--drop-angle, 0deg), #F97316, #8B5CF6, #06B6D4, #F97316)', animation: 'drop-border-rotate 4s linear infinite', mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', maskComposite: 'exclude', WebkitMaskComposite: 'xor', padding: '1px' }} />
      {/* Inner top shine */}
      <div className="absolute top-0 left-0 right-0 h-1/3 rounded-t-2xl pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)' }} />

      <div className="p-4">
        {/* Top row: MISSED + Category + Score — properly spaced */}
        <div className="flex items-center gap-1.5 mb-2.5">
          {missed && (
            <span className="font-heading text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444' }}>
              MISSED
            </span>
          )}
          <span className="font-body text-[10px] uppercase tracking-[0.06em] font-medium px-2 py-0.5 rounded-md truncate min-w-0"
            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#A78BFA' }}>
            {idea?.category || "Other"}
          </span>
          <span className="font-heading text-base font-bold tabular-nums shrink-0 ml-auto" style={{ color: scoreColor }}>
            {score.toFixed(1)}
          </span>
        </div>

        <h4 className="font-heading text-sm font-semibold mb-1 line-clamp-2 leading-snug break-words" style={{ color: 'var(--text-primary)' }}>
          {idea?.title}
        </h4>
        <p className="font-body text-xs line-clamp-2 leading-relaxed break-words" style={{ color: 'var(--text-secondary)' }}>
          {idea?.oneLiner || (() => { const d = idea?.description || ""; if (d.length <= 100) return d; const c = d.substring(0, 100); const s = c.lastIndexOf(" "); return s > 30 ? c.substring(0, s) + "..." : c + "..."; })()}
        </p>

        <div className="divider-gradient mt-3" />
        <div className="flex items-center gap-3 pt-2">
          <span className="font-body text-[10px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
            🔥 {Number(idea?.scores?.pain_score ?? 0).toFixed(1)} pain
          </span>
          <span className="font-body text-[10px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
            💰 {Number(idea?.scores?.revenue_potential ?? 0) > 0 ? `${Number(idea.scores.revenue_potential).toFixed(1)} rev` : "TBD"}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

const DailyDropSection = ({ ideas, onIdeaClick, excludeId }: DailyDropProps) => {
  const [yesterdayExpanded, setYesterdayExpanded] = useState(false);

  // Date-based filtering
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const todaysIdeas = ideas.filter(idea => {
    if (!idea.created_at) return false;
    if (excludeId && idea.id === excludeId) return false;
    return new Date(idea.created_at) >= todayStart;
  });
  const yesterdaysIdeas = ideas.filter(idea => {
    if (!idea.created_at) return false;
    if (excludeId && idea.id === excludeId) return false;
    const created = new Date(idea.created_at);
    return created >= yesterdayStart && created < todayStart;
  });

  // Fallback: if no ideas today, show 5 most recent as "Latest Drop"
  const isLatestFallback = todaysIdeas.length === 0;
  const filteredIdeas = excludeId ? ideas.filter(i => i.id !== excludeId) : ideas;
  const todaysDrop = isLatestFallback ? filteredIdeas.slice(0, 5) : todaysIdeas.slice(0, 5);
  const yesterdaysDrop = isLatestFallback ? filteredIdeas.slice(5, 10) : yesterdaysIdeas.slice(0, 5);
  const highScoreMissed = yesterdaysDrop.filter(i => (i?.overall_score ?? 0) >= 9).length;

  // Pseudo viewer count seeded by date
  const dateSeed = new Date().toISOString().substring(0, 10).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const viewerCount = 80 + (dateSeed % 120);

  // Hours since 6PM IST today (or yesterday)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const hoursSinceDrop = Math.max(1, Math.floor((istNow.getHours() >= 18 ? istNow.getHours() - 18 : istNow.getHours() + 6)));

  if (todaysDrop.length === 0) return null;

  return (
    <div className="mb-4 sm:mb-6">
      {/* Today's Drop */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-heading text-base sm:text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <span style={{ animation: 'fire-pulse 1.5s ease-in-out infinite' }}>🔥</span>
            {isLatestFallback ? "Latest Drop" : "Today's Drop"}
          </h2>
          <span className="font-body text-[11px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>
            {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
        <p className="font-body text-[11px] mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
          <Clock className="w-3 h-3 shrink-0" strokeWidth={1.5} />
          <span className="truncate">Dropped {hoursSinceDrop}h ago · {viewerCount} builders have seen today's drop</span>
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory">
        {todaysDrop.map((idea) => (
          <div key={idea.id} className="snap-start">
            <DropCard idea={idea} onClick={() => onIdeaClick(idea)} />
          </div>
        ))}
      </div>

      {/* Yesterday's Drop */}
      {yesterdaysDrop.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setYesterdayExpanded(!yesterdayExpanded)}
            className="w-full flex items-center justify-between p-3 rounded-xl transition-colors"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <span className="font-heading text-xs sm:text-sm font-medium text-left min-w-0 mr-2" style={{ color: 'var(--text-secondary)' }}>
              Yesterday's Drop
              {highScoreMissed > 0 && (
                <span className="block sm:inline sm:ml-1" style={{ color: '#F59E0B' }}>
                  — You missed {highScoreMissed} idea{highScoreMissed > 1 ? 's' : ''} scored 9+
                </span>
              )}
            </span>
            <motion.div animate={{ rotate: yesterdayExpanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
            </motion.div>
          </button>

          <AnimatePresence>
            {yesterdayExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="overflow-hidden"
              >
                <div className="flex gap-3 overflow-x-auto pb-3 pt-3 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory">
                  {yesterdaysDrop.map((idea) => (
                    <div key={idea.id} className="snap-start">
                      <DropCard idea={idea} onClick={() => onIdeaClick(idea)} missed />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default DailyDropSection;
