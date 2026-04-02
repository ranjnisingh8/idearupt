import { Heart, Share2, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { Idea } from "@/data/ideas";
import ShareModal from "./ShareModal";
import ProBadge from "./ProBadge";
import LimitReachedModal from "./LimitReachedModal";
import { useState, useEffect, useRef, memo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useUsage } from "@/hooks/useUsage";
import { useAccess } from "@/hooks/useAccess";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { FREE_SAVE_LIMIT } from "@/lib/config";
import { getCategoryStyle, formatCategory, getSourceBadge, getMatchBadgeStyle, getScoreColor, safeScore, smartTruncate, getProblemSizeStyle } from "@/lib/theme";

const isTouchDevice = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

interface IdeaCardProps {
  idea: Idea;
  index: number;
  matchScore?: number | null;
  onClick: () => void;
  isNew?: boolean;
  refreshSaveKey?: number;
  isMostExplored?: boolean;
}


const IdeaCard = ({ idea, index, matchScore, onClick, isNew, refreshSaveKey, isMostExplored }: IdeaCardProps) => {
  const [saved, setSaved] = useState(false);
  const [saveCount, setSaveCount] = useState(idea?.save_count ?? 0);
  const [heartPulse, setHeartPulse] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [limitModal, setLimitModal] = useState<{ open: boolean; feature: string; used: number; limit: number }>({ open: false, feature: "", used: 0, limit: 0 });
  const heartTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const { user } = useAuth();
  const { getUsage, incrementUsage } = useUsage();
  const { maxSavedTotal } = useAccess();
  const navigate = useNavigate();

  const overallScore = safeScore(idea?.overall_score);
  const title = idea?.title || "Untitled Idea";
  const oneLiner = idea?.oneLiner || smartTruncate(idea?.description || "", 140) || "";
  const category = idea?.category || "Other";
  const isTrending = idea?.is_trending ?? false;
  const painScore = safeScore(idea?.scores?.pain_score);

  const catStyle = getCategoryStyle(category);
  const isHighMatch = matchScore != null && matchScore >= 80;
  const sourceBadge = getSourceBadge(idea);
  const sizeStyle = getProblemSizeStyle(idea?.problem_size);

  useEffect(() => {
    if (!user || !idea?.id) return;
    supabase.from("user_interactions").select("id")
      .eq("user_id", user.id).eq("idea_id", idea.id).eq("action", "saved")
      .maybeSingle().then(({ data }) => setSaved(!!data));
  }, [user?.id, idea?.id, refreshSaveKey]);

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { navigate("/auth"); return; }
    try {
      if (saved) {
        const { error } = await supabase.from("user_interactions").delete().eq("user_id", user.id).eq("idea_id", idea.id).eq("action", "saved");
        if (error) throw error;
        setSaved(false);
        setSaveCount((prev) => Math.max(0, prev - 1));
        toast({ title: "Unsaved" });
      } else {
        // Check total saved cap (10 for free, unlimited for Pro)
        if (maxSavedTotal !== Infinity) {
          try {
            const { count, error: countErr } = await supabase.from("user_interactions").select("id", { count: "exact", head: true })
              .eq("user_id", user.id).eq("action", "saved");
            if (countErr) throw countErr;
            if ((count || 0) >= maxSavedTotal) {
              toast({ title: `You've reached the free plan limit of ${maxSavedTotal} saved ideas`, description: "Delete a saved idea or upgrade to Pro for unlimited saves." });
              return;
            }
          } catch {
            // If count query fails (RLS/permissions), skip the cap check and allow the save
            // The insert will still be validated server-side
          }
        }

        const saveUsage = getUsage("save");
        if (!saveUsage.canUse) {
          setLimitModal({ open: true, feature: "save", used: saveUsage.used, limit: saveUsage.limit });
          return;
        }

        setHeartPulse(true);
        if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
        heartTimerRef.current = setTimeout(() => setHeartPulse(false), 600);
        const { error } = await supabase.from("user_interactions").insert({ user_id: user.id, idea_id: idea.id, action: "saved" });
        if (error) {
          if (error.code === "23505") {
            await supabase.from("user_interactions").delete().eq("user_id", user.id).eq("idea_id", idea.id).eq("action", "saved");
            setSaved(false);
            setSaveCount((prev) => Math.max(0, prev - 1));
            return;
          }
          throw error;
        }
        setSaved(true);
        setSaveCount((prev) => prev + 1);
        await incrementUsage("save");
        toast({ title: "Saved!" });
      }
    } catch (err: any) {
      const msg = err?.message || err?.code || "";
      if (msg.includes("permission") || msg.includes("policy") || msg.includes("RLS")) {
        toast({ title: "Unable to save", description: "Please sign out and sign back in, then try again.", variant: "destructive" });
      } else {
        toast({ title: "Unable to save", description: "Please try again.", variant: "destructive" });
      }
    }
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowShare(true);
  };

  // Score colors
  const scoreColor = getScoreColor(overallScore);
  const circumference = 2 * Math.PI * 14;
  const strokeDashoffset = circumference - (overallScore / 10) * circumference;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: index * 0.05, ease: [0.25, 0.1, 0.25, 1] }}
        className={`surface-card p-3.5 sm:p-5 cursor-pointer group relative flex flex-col h-full active:ring-1 active:ring-purple-500/30 ${isHighMatch ? "glow-neon-purple" : ""} ${isNew ? "ring-2 ring-[rgba(16,185,129,0.5)] animate-pulse-once" : ""} ${isMostExplored ? "border-l-2 border-l-[rgba(239,68,68,0.4)]" : ""}`}
        onClick={onClick}
        {...(!isTouchDevice && { whileHover: { y: -3 } })}
        whileTap={{ scale: 0.97 }}
      >
        {/* Top row: category + source + match */}
        <div className="flex items-center justify-between mb-2.5 gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0 overflow-hidden">
            <span className={`font-body text-[11px] uppercase tracking-[0.06em] font-medium px-2.5 py-1 rounded-md border whitespace-nowrap ${catStyle}`}>
              {formatCategory(category)}
            </span>
            {sourceBadge && (
              <span
                className="font-body text-[10px] font-medium uppercase tracking-[0.04em] px-1.5 py-0.5 rounded-md"
                style={{ background: sourceBadge.bg, border: `1px solid ${sourceBadge.border}`, color: sourceBadge.color }}
              >
                {sourceBadge.label}
              </span>
            )}
            <span
              className="font-body text-[10px] font-medium tracking-[0.02em] px-1.5 py-0.5 rounded-md whitespace-nowrap"
              style={{ background: sizeStyle.bg, border: `1px solid ${sizeStyle.border}`, color: sizeStyle.color }}
            >
              {sizeStyle.emoji} {sizeStyle.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {matchScore != null && (
              <div className="flex items-center gap-1">
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.06 + 0.3, type: "spring", stiffness: 500 }}
                  className={`font-body text-[11px] font-semibold px-2 py-0.5 rounded-md border ${getMatchBadgeStyle(matchScore)}`}
                >
                  {matchScore}%
                </motion.span>
                <ProBadge feature="dna_match" size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="font-heading text-base sm:text-lg font-semibold tracking-[-0.01em] leading-snug line-clamp-2 break-words mb-1.5" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>

        {/* One-liner description — max 2 lines */}
        <p className="text-[13px] sm:text-sm mb-3 line-clamp-2 leading-[1.6] break-words" style={{ color: 'var(--text-secondary)' }}>
          {oneLiner}
        </p>

        {/* Bottom row: score + actions — pinned to bottom */}
        <div className="mt-auto" />
        <div className="divider-gradient" />
        <div className="flex items-center justify-between pt-2.5 gap-2">
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Circular score ring */}
            <div className="relative w-9 h-9 shrink-0" style={{
              ...(overallScore >= 9 ? { animation: 'score-pulse 2s ease-in-out infinite' } : {}),
              ...(overallScore >= 7 ? { filter: `drop-shadow(0 0 6px ${scoreColor}44)` } : {}),
            }}>
              <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
                <motion.circle
                  cx="18" cy="18" r="14" fill="none"
                  stroke={scoreColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  whileInView={{ strokeDashoffset }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1], delay: 0.3 }}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-heading text-xs font-bold tabular-nums" style={{ color: scoreColor }}>
                {overallScore.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-0">
              <button onClick={handleSave}
                className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-all duration-150 haptic-press ${saved ? "text-red-400" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
                style={{
                  ...(heartPulse ? { animation: "heart-pulse 0.3s ease-out" } : {}),
                  ...(saved ? { filter: 'drop-shadow(0 0 6px rgba(248,113,113,0.4))' } : {}),
                }}>
                <Heart className="w-4 h-4 sm:w-5 sm:h-5" fill={saved ? "currentColor" : "none"} strokeWidth={1.5} />
              </button>
              <button onClick={handleShare}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-150 haptic-press">
                <Share2 className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={1.5} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-hidden min-w-0">
            {/* Pre-limit save warning badge */}
            {user && !saved && getUsage("save").remaining === 1 && (
              <span className="font-body text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
                style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#FBBF24" }}>
                1 save left today
              </span>
            )}
            {/* Source link */}
            {(idea?.source_url || idea?.validation_data?.source_url) && (
              <a href={idea.source_url || idea.validation_data?.source_url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hidden sm:flex text-[11px] items-center gap-1 font-medium transition-colors hover:underline shrink-0"
                style={{ color: "var(--text-tertiary)" }}>
                Source <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
              </a>
            )}
            {/* Save count */}
            {saveCount > 0 && (
              <span className="text-[10px] sm:text-[11px] flex items-center gap-1 tabular-nums whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                💾 {saveCount}
              </span>
            )}
          </div>
        </div>
      </motion.div>

      <ShareModal
        open={showShare}
        onClose={() => setShowShare(false)}
        ideaId={idea?.id || ""}
        ideaTitle={title}
        score={overallScore}
        oneLiner={oneLiner}
        painScore={painScore}
        trendScore={idea?.scores?.trend_score}
      />

      <LimitReachedModal
        open={limitModal.open}
        onClose={() => setLimitModal((prev) => ({ ...prev, open: false }))}
        feature={limitModal.feature}
        used={limitModal.used}
        limit={limitModal.limit}
      />
    </>
  );
};

export default memo(IdeaCard);
