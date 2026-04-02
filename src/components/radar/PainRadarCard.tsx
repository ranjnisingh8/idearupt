import { Heart, ArrowRight, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { Idea } from "@/data/ideas";
import { getCategoryStyle, formatCategory, getSourceBadge, safeScore, smartTruncate, getProblemSizeStyle } from "@/lib/theme";

interface PainRadarCardProps {
  idea: Idea;
  index: number;
  onView: () => void;
  onSave?: () => void;
  saved?: boolean;
  timeAgo?: string;
  isNew?: boolean;
}

const PainRadarCard = ({ idea, index, onView, onSave, saved, timeAgo, isNew }: PainRadarCardProps) => {
  const painScore = safeScore(idea?.scores?.pain_score);
  const trendScore = safeScore(idea?.scores?.trend_score);
  const catStyle = getCategoryStyle(idea?.category);
  const sourceBadge = getSourceBadge(idea);
  const sizeStyle = getProblemSizeStyle(idea?.problem_size);
  const isHot = painScore >= 8;
  const oneLiner = idea?.oneLiner || smartTruncate(idea?.description || "", 140) || "";

  // Pain bar color — the primary metric on this page
  const painColor = painScore >= 8 ? "#EF4444" : painScore >= 6 ? "#F59E0B" : "#6B7280";
  const painWidth = Math.min(100, (painScore / 10) * 100);

  // Trend bar
  const trendColor = trendScore >= 7 ? "#34D399" : trendScore >= 5 ? "#22D3EE" : "#6B7280";
  const trendWidth = Math.min(100, (trendScore / 10) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.05, ease: [0.25, 0.1, 0.25, 1] }}
      className={`surface-card p-4 cursor-pointer group relative ${isHot ? "ring-1 ring-[rgba(239,68,68,0.25)]" : ""}`}
      onClick={onView}
      style={isHot ? { boxShadow: "0 0 24px rgba(239,68,68,0.1), inset 0 0 0 0.5px rgba(239,68,68,0.08)" } : undefined}
    >
      {/* Top row: badges + PAIN SCORE (hero) */}
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {/* NEW badge — flashes on drip */}
          {isNew && (
            <motion.span
              initial={{ opacity: 1, scale: 1.1 }}
              animate={{ opacity: [1, 0.6, 1], scale: 1 }}
              transition={{ duration: 1.5, repeat: 2 }}
              className="font-body text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md"
              style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#F87171" }}
            >
              NEW
            </motion.span>
          )}
          <span className={`font-body text-[10px] uppercase tracking-[0.06em] font-medium px-2 py-0.5 rounded-md border ${catStyle}`}>
            {formatCategory(idea?.category || "Other")}
          </span>
          {sourceBadge && (
            <span
              className="font-body text-[10px] font-medium px-1.5 py-0.5 rounded-md"
              style={{ background: sourceBadge.bg, border: `1px solid ${sourceBadge.border}`, color: sourceBadge.color }}
            >
              {sourceBadge.label}
            </span>
          )}
          <span
            className="font-body text-[10px] font-medium px-1.5 py-0.5 rounded-md"
            style={{ background: sizeStyle.bg, border: `1px solid ${sizeStyle.border}`, color: sizeStyle.color }}
          >
            {sizeStyle.emoji} {sizeStyle.label}
          </span>
        </div>
        {/* Pain score is the HERO number on this page */}
        <div className="flex items-center gap-1.5 shrink-0">
          {timeAgo && (
            <span className="font-body text-[10px] flex items-center gap-0.5" style={{ color: "var(--text-tertiary)" }}>
              <Clock className="w-3 h-3" strokeWidth={1.5} />
              {timeAgo}
            </span>
          )}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ background: `${painColor}18`, border: `1px solid ${painColor}35` }}>
            <span className="font-body text-[9px] uppercase font-semibold tracking-wider" style={{ color: painColor }}>Pain</span>
            <span className="font-heading text-sm font-bold tabular-nums" style={{ color: painColor }}>
              {painScore.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Title */}
      <h3 className="font-heading text-base font-semibold tracking-[-0.01em] leading-snug line-clamp-2 mb-1.5" style={{ color: "var(--text-primary)" }}>
        {idea?.title || "Untitled"}
      </h3>

      {/* One-liner */}
      <p className="font-body text-[13px] mb-3 line-clamp-2 leading-[1.6]" style={{ color: "var(--text-secondary)" }}>
        {oneLiner}
      </p>

      {/* Dual score bars: Pain + Trend */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="font-body text-[10px] uppercase tracking-wider font-medium shrink-0 w-10" style={{ color: "var(--text-tertiary)" }}>Pain</span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: painColor }}
              initial={{ width: 0 }}
              animate={{ width: `${painWidth}%` }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            />
          </div>
          <span className="font-heading text-[11px] font-bold tabular-nums shrink-0 w-6 text-right" style={{ color: painColor }}>
            {painScore.toFixed(1)}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-body text-[10px] uppercase tracking-wider font-medium shrink-0 w-10" style={{ color: "var(--text-tertiary)" }}>Trend</span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: trendColor }}
              initial={{ width: 0 }}
              animate={{ width: `${trendWidth}%` }}
              transition={{ duration: 0.8, delay: 0.35, ease: "easeOut" }}
            />
          </div>
          <span className="font-heading text-[11px] font-bold tabular-nums shrink-0 w-6 text-right" style={{ color: trendColor }}>
            {trendScore.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Bottom row: tags + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
          {(idea?.tags || []).slice(0, 3).map((tag) => (
            <span key={tag} className="font-body text-[10px] px-1.5 py-0.5 rounded-md whitespace-nowrap" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-tertiary)" }}>
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onSave && (
            <button
              onClick={(e) => { e.stopPropagation(); onSave(); }}
              className={`p-1.5 rounded-lg transition-colors ${saved ? "text-red-400" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
            >
              <Heart className="w-4 h-4" fill={saved ? "currentColor" : "none"} strokeWidth={1.5} />
            </button>
          )}
          <span className="font-body text-[11px] font-medium flex items-center gap-1 group-hover:text-[#9585F2] transition-colors" style={{ color: "var(--text-tertiary)" }}>
            View <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default PainRadarCard;
