import { X, Heart, Share2, Shuffle, ArrowRight, Users, ExternalLink, ArrowUp, MessageSquare, Radio, Lock, Sparkles, Clock, Map, Swords, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { Idea } from "@/data/ideas";
import ScoreBar from "./ScoreBar";
import RealFeedback from "./RealFeedback";
import ShareModal from "./ShareModal";
import LimitReachedModal from "./LimitReachedModal";
import ProofStack from "./ProofStack";
import BuilderActivity from "./BuilderActivity";
import BlueprintReveal from "./BlueprintReveal";
import CompetitorReveal from "./CompetitorReveal";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useUsage } from "@/hooks/useUsage";
import { useAccess } from "@/hooks/useAccess";
import { useProStatus } from "@/hooks/useProStatus";
import { useGamification } from "@/hooks/useGamification";
import ProBadge from "./ProBadge";
import SectionErrorBoundary from "./SectionErrorBoundary";
import { FREE_SAVE_LIMIT } from "@/lib/config";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import { getProblemSizeStyle } from "@/lib/theme";

const haptic = (ms = 10) => {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
};

interface IdeaDetailProps {
  idea: Idea;
  onClose: () => void;
  limitReached?: boolean;
}

// Deterministic pseudo-random from idea ID
const getViewingNow = (ideaId: string) => {
  let hash = 0;
  for (let i = 0; i < ideaId.length; i++) {
    hash = ((hash << 5) - hash) + ideaId.charCodeAt(i);
    hash |= 0;
  }
  return 5 + Math.abs(hash % 76);
};

// Session-level blur hit counter (persists across idea modals in same session)
let sessionBlurHits = 0;

const IdeaDetail = ({ idea, onClose, limitReached = false }: IdeaDetailProps) => {
  const [saved, setSaved] = useState(false);
  const [localSaveCount, setLocalSaveCount] = useState(idea?.save_count ?? 0);
  const [viewCount, setViewCount] = useState(idea?.view_count ?? 0);
  const [showShare, setShowShare] = useState(false);
  const [limitModal, setLimitModal] = useState<{ open: boolean; feature: string; used: number; limit: number }>({ open: false, feature: "", used: 0, limit: 0 });
  const { user } = useAuth();
  const { getUsage, incrementUsage } = useUsage();
  const { isContentLocked, canSeeSourceThreads, canExportPDF } = useAccess();
  const { hasFullAccess: isFull, isEarlyAdopter, planStatus, hasUsedTrial } = useProStatus();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);
  const navigate = useNavigate();
  const viewTracked = useRef(false);
  const { recordActivity } = useGamification();

  // Blur hit tracking for upgrade CTA escalation
  const [blurHitCount, setBlurHitCount] = useState(sessionBlurHits);
  const handleBlurHit = () => {
    sessionBlurHits++;
    setBlurHitCount(sessionBlurHits);
  };

  // Refs for smooth scroll targeting
  const blueprintRef = useRef<HTMLDivElement>(null);
  const competitorRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Native share handler for mobile
  const handleNativeShare = async () => {
    haptic();
    const shareUrl = `${window.location.origin}/feed?idea=${idea?.id}`;
    const shareData = {
      title: idea?.title || "Check this idea",
      text: idea?.oneLiner || idea?.description?.substring(0, 120) || "",
      url: shareUrl,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        recordActivity("share", 20);
        return;
      } catch {
        // User cancelled or share failed — fall through to share modal
      }
    }
    setShowShare(true);
  };

  // Pre-generated content from DB
  const preBlueprint = idea?.blueprint_markdown || null;
  const preCompetitors = idea?.competitor_analysis_pregenerated || null;

  // Related pain signals
  const [relatedSignals, setRelatedSignals] = useState<{ id: string; title: string; body: string | null; source_platform: string; subreddit: string | null; upvotes: number; comments: number; sentiment: string | null }[]>([]);

  // Lock body scroll when modal is open + Escape key + cleanup
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  // Scroll modal to top whenever a new idea opens
  useEffect(() => {
    if (!idea?.id) return;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    // Schedule a second scroll-to-top after the spring animation renders content
    const raf = requestAnimationFrame(() => {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(raf);
  }, [idea?.id]);

  // Fetch related pain signals for this idea
  useEffect(() => {
    if (!idea?.id) return;
    supabase
      .from("pain_signals")
      .select("id, title, body, source_platform, subreddit, upvotes, comments, sentiment")
      .eq("linked_idea_id", idea.id)
      .order("upvotes", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data && data.length > 0) setRelatedSignals(data);
      });
  }, [idea?.id]);

  // Increment view count on modal open — DB trigger auto-updates ideas.view_count
  useEffect(() => {
    if (!idea?.id || viewTracked.current) return;
    viewTracked.current = true;
    const currentCount = idea?.view_count ?? 0;
    setViewCount(currentCount + 1);
    // Insert interaction — DB trigger handles incrementing ideas.view_count
    if (user) {
      supabase.from("user_interactions")
        .insert({ user_id: user.id, idea_id: idea.id, action: "viewed" })
        .then(() => { recordActivity("view", 5); });
    }
  }, [idea?.id]);

  useEffect(() => {
    if (!user || !idea?.id) return;
    supabase.from("user_interactions").select("id")
      .eq("user_id", user.id).eq("idea_id", idea.id).eq("action", "saved")
      .maybeSingle().then(({ data }) => setSaved(!!data));
  }, [user?.id, idea?.id]);

  const handleSave = async () => {
    if (!user) { toast({ title: "Sign up to save ideas", description: "Create a free account to bookmark your favorite ideas." }); navigate("/auth"); return; }
    try {
      if (saved) {
        await supabase.from("user_interactions").delete().eq("user_id", user.id).eq("idea_id", idea.id).eq("action", "saved");
        setSaved(false);
        setLocalSaveCount((p) => Math.max(0, p - 1));
        toast({ title: "Unsaved" });
      } else {
        // Check daily save limit
        const saveUsage = getUsage("save");
        if (!saveUsage.canUse) {
          setLimitModal({ open: true, feature: "save", used: saveUsage.used, limit: saveUsage.limit });
          return;
        }

        const { error } = await supabase.from("user_interactions").insert({ user_id: user.id, idea_id: idea.id, action: "saved" });
        if (error && error.code === "23505") {
          // Already saved (duplicate) — toggle it off
          await supabase.from("user_interactions").delete().eq("user_id", user.id).eq("idea_id", idea.id).eq("action", "saved");
          setSaved(false);
          return;
        }
        if (error) throw error;
        setSaved(true);
        setLocalSaveCount((p) => p + 1);
        await incrementUsage("save");
        recordActivity("save", 10);
        toast({ title: "Saved!" });
      }
    } catch {
      toast({ title: "Error saving", description: "Something went wrong. Please try again.", variant: "destructive" });
    }
  };

  const handleRemix = async () => {
    if (user) {
      const usage = getUsage("remix");
      if (!usage.canUse) {
        setLimitModal({ open: true, feature: "remix", used: usage.used, limit: usage.limit });
        return;
      }
      await incrementUsage("remix");
    }
    navigate("/validate", { state: { remixIdea: idea, fromIdeaId: idea.id } });
  };

  const handleDeepDive = async () => {
    if (user) {
      const usage = getUsage("deep_dive");
      if (!usage.canUse) {
        setLimitModal({ open: true, feature: "deep_dive", used: usage.used, limit: usage.limit });
        return;
      }
      await incrementUsage("deep_dive");
    }
    navigate("/validate", { state: { deepDiveIdea: idea, fromIdeaId: idea.id } });
  };

  const safeNum = (v: unknown) => { const n = Number(v); return isNaN(n) || !isFinite(n) ? 0 : n; };
  const overallScore = safeNum(idea?.overall_score);
  const title = idea?.title || "Untitled Idea";
  const oneLiner = idea?.oneLiner || (() => {
    const d = idea?.description || "";
    if (d.length <= 140) return d;
    const cut = d.substring(0, 140);
    const lastPeriod = cut.lastIndexOf(". ");
    if (lastPeriod > 50) return cut.substring(0, lastPeriod + 1);
    const lastSpace = cut.lastIndexOf(" ");
    return lastSpace > 40 ? cut.substring(0, lastSpace) + "..." : cut + "...";
  })();
  const description = idea?.description || idea?.oneLiner || "No description available";
  const problemStatement = idea?.problem_statement || null;
  const category = idea?.category || "Other";
  const targetAudience = idea?.targetAudience || "Entrepreneurs";
  const revenueScore = safeNum(idea?.scores?.revenue_potential);
  const estimatedMRR = idea?.estimated_mrr_range || idea?.estimatedMRR || null;
  const mrrFallback = revenueScore >= 10 ? "$100K+/mo" : revenueScore >= 8 ? "$20K-$100K/mo" : revenueScore >= 6 ? "$5K-$20K/mo" : revenueScore >= 4 ? "$1K-$5K/mo" : "$0-$1K/mo";
  const mrrDisplay = estimatedMRR || mrrFallback;
  const tags = Array.isArray(idea?.tags) && idea.tags.length > 0 ? idea.tags.filter(Boolean) : [];
  const scores = idea?.scores ?? {
    pain_score: 0, trend_score: 0, competition_score: 0,
    revenue_potential: 0, build_difficulty: 0,
  };
  const competitionLabel = (scores.competition_score ?? 0) <= 4 ? "Low Competition ✅" : (scores.competition_score ?? 0) <= 7 ? "Moderate Competition" : "High Competition ⚠️";
  const buildLabel = (scores.build_difficulty ?? 0) <= 4 ? "Easy Build 🟢" : (scores.build_difficulty ?? 0) <= 7 ? "Moderate Build" : "Complex Build 🔴";

  const scoreColor = overallScore >= 9 ? "#10B981" : overallScore >= 7 ? "#06B6D4" : overallScore >= 5 ? "#F59E0B" : "#565B6E";
  const circumference = 2 * Math.PI * 20;
  const strokeDashoffset = circumference - (overallScore / 10) * circumference;

  // FOMO banners
  const viewingNow = getViewingNow(idea?.id || "0");
  const fomoLevel = localSaveCount > 75 ? "high" : localSaveCount > 30 ? "medium" : null;

  // Proof data
  const hasProof = (idea?.distinct_posters ?? 0) > 0 || (idea?.distinct_communities ?? 0) > 0;
  const painTypeStyle = (() => {
    switch (idea?.pain_type) {
      case "paid": return { label: "Paid Pain", color: "#34D399", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)" };
      case "latent": return { label: "Latent Pain", color: "#9CA3AF", bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.25)" };
      default: return { label: "Vocal Pain", color: "#FB923C", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.25)" };
    }
  })();

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="idea-detail-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed inset-0 z-[9999] backdrop-blur-md"
        style={{ background: 'rgba(0, 0, 0, 0.7)' }}
        onClick={onClose}
      />
      {/* Modal panel */}
      <motion.div
        key="idea-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={scrollContainerRef}
        initial={{ opacity: 0, scale: 0.88, y: 60, filter: 'blur(8px)' }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 0.95, y: 30, filter: 'blur(4px)' }}
        transition={{ type: "spring", damping: 26, stiffness: 350, mass: 0.7 }}
        className="fixed inset-0 z-[9999] m-auto overflow-y-auto overflow-x-hidden w-full h-full sm:w-[90vw] sm:max-w-[700px] sm:h-auto sm:max-h-[85vh] sm:rounded-2xl sm:border"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-xl)',
          WebkitOverflowScrolling: 'touch',
        }}
        onClick={(e) => e.stopPropagation()}
      >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between p-4" style={{ background: 'var(--bg-surface)' }}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-body text-[11px] uppercase tracking-[0.06em] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(124,106,237,0.1)", border: "1px solid rgba(124,106,237,0.2)", color: "#9585F2" }}>{category}</span>
              <span className="font-body text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: painTypeStyle.bg, border: `1px solid ${painTypeStyle.border}`, color: painTypeStyle.color }}>{painTypeStyle.label}</span>
              {(() => {
                const src = (idea?.source || idea?.validation_data?.source_platform || "").toLowerCase();
                const subreddit = idea?.validation_data?.subreddit;
                if (src.includes("reddit")) return <span className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(255,69,0,0.12)", border: "1px solid rgba(255,69,0,0.25)", color: "#FF6B35" }}>{subreddit ? `r/${subreddit}` : "Reddit"}</span>;
                if (src.includes("hacker") || src === "hackernews") return <span className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(255,102,0,0.12)", border: "1px solid rgba(255,102,0,0.25)", color: "#FF6600" }}>HN</span>;
                if (src.includes("github")) return <span className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-secondary)" }}>GitHub</span>;
                if (src.includes("producthunt") || src.includes("product hunt")) return <span className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(218,85,47,0.12)", border: "1px solid rgba(218,85,47,0.25)", color: "#DA552F" }}>Product Hunt</span>;
                if (src.includes("indiehacker") || src.includes("indie hacker")) return <span className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.25)", color: "#4285F4" }}>Indie Hackers</span>;
                if (src.includes("stackoverflow") || src.includes("stack overflow")) return <span className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(244,128,36,0.12)", border: "1px solid rgba(244,128,36,0.25)", color: "#F48024" }}>Stack Overflow</span>;
                if (src.includes("lobste")) return <span className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(139,0,0,0.12)", border: "1px solid rgba(139,0,0,0.25)", color: "#C0392B" }}>Lobsters</span>;
                if (src.includes("dev.to")) return <span className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(59,73,223,0.12)", border: "1px solid rgba(59,73,223,0.25)", color: "#3B49DF" }}>Dev.to</span>;
                return (src && !src.includes("ai_generated") && !src.includes("ai-generated") && !src.includes("generated")) ? <span className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-secondary)" }}>{src}</span> : null;
              })()}
              {(() => {
                const sz = getProblemSizeStyle(idea?.problem_size);
                return (
                  <span className="font-body text-[10px] font-medium tracking-[0.02em] px-1.5 py-0.5 rounded-md whitespace-nowrap" style={{ background: sz.bg, border: `1px solid ${sz.border}`, color: sz.color }}>
                    {sz.emoji} {sz.label}
                  </span>
                );
              })()}
            </div>
            <button onClick={onClose} aria-label="Close idea detail" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--bg-elevated)] rounded-lg transition-colors">
              <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
            </button>
          </div>

          <div className="px-3.5 py-3.5 sm:p-6 sm:pb-8">
            {/* FOMO banner */}
            <div className="flex items-center gap-3 mb-4 font-body text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <span>👀 {viewingNow} builders viewing</span>
              <span>·</span>
              <span>💾 {localSaveCount} saved</span>
            </div>

            {fomoLevel === "high" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-3 mb-4 flex items-center gap-2"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <span className="text-sm">🚨</span>
                <p className="font-body text-xs font-medium" style={{ color: '#EF4444' }}>
                  High competition — {localSaveCount} builders exploring this
                </p>
              </motion.div>
            )}
            {fomoLevel === "medium" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-3 mb-4 flex items-center gap-2"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                <span className="text-sm">⚠️</span>
                <p className="font-body text-xs font-medium" style={{ color: '#F59E0B' }}>
                  This idea is gaining traction. {localSaveCount} builders saved it.
                </p>
              </motion.div>
            )}

            <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-[-0.02em] mb-2 break-words" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            {oneLiner && <p className="text-[13px] sm:text-sm italic mb-3 leading-relaxed break-words" style={{ color: 'var(--text-secondary)' }}>{oneLiner}</p>}

            {/* Proof line — always visible with fallback */}
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg" style={{ background: "rgba(124,106,237,0.06)", border: "1px solid rgba(124,106,237,0.12)" }}>
              <span className="font-body text-[12px] sm:text-[13px]" style={{ color: "var(--text-secondary)" }}>
                {hasProof ? (
                  <>
                    📊 <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{idea.distinct_posters}</span> people
                    {(idea.distinct_communities ?? 0) > 0 && <> · <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{idea.distinct_communities}</span> communities</>}
                    {(idea.recurrence_weeks ?? 0) > 0 && <> · <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{idea.recurrence_weeks}</span> weeks recurring</>}
                  </>
                ) : (
                  <>📊 10+ complaints tracked</>
                )}
              </span>
            </div>

            {/* Daily limit overlay — shows when user has hit idea_view limit */}
            {limitReached && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center mb-6"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(6,182,212,0.03))",
                  border: "1px solid rgba(139,92,246,0.15)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)" }}>
                  <Clock className="w-5 h-5" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
                </div>
                <h3 className="font-heading text-base font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
                  Daily limit reached
                </h3>
                <p className="font-body text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
                  You've used all your idea views for today.
                </p>
                <p className="font-body text-[11px] mb-5" style={{ color: "var(--text-tertiary)" }}>
                  Resets at midnight UTC
                </p>
                <button
                  onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=feed")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-heading font-semibold text-white transition-all hover:scale-[1.03]"
                  style={{ background: !hasUsedTrial ? "linear-gradient(135deg, #F59E0B, #F97316)" : "#7C6AED", boxShadow: !hasUsedTrial ? "0 4px 16px -4px rgba(245,158,11,0.3)" : "0 4px 16px -4px rgba(124,106,237,0.3)" }}
                >
                  <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                  {!hasUsedTrial ? "Start Free Trial" : `Upgrade to Pro — ${priceLabel}`}
                </button>
                <button onClick={onClose} className="font-body text-xs mt-3 transition-colors" style={{ color: "var(--text-tertiary)" }}>
                  I'll come back tomorrow
                </button>
              </motion.div>
            )}

            {!limitReached && <>
            {/* Action buttons — single row with all actions including blueprint */}
            <div className="flex flex-wrap gap-1 sm:gap-2 mb-3 sm:mb-6">
              <button onClick={handleSave}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[34px] sm:min-h-[40px] rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 surface-card ${saved ? "text-red-400" : ""}`}
                style={{ transform: 'none' }}>
                <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill={saved ? "currentColor" : "none"} strokeWidth={1.5} /> Save
                {!isFull && <ProBadge feature="save" size="sm" />}
              </button>
              <button onClick={() => setShowShare(true)}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[34px] sm:min-h-[40px] rounded-xl surface-card text-xs sm:text-sm font-medium transition-all duration-150"
                style={{ transform: 'none', color: 'var(--text-secondary)' }}>
                <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} /> Share
              </button>
              <button onClick={handleRemix}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[34px] sm:min-h-[40px] rounded-xl surface-card text-xs sm:text-sm font-medium transition-all duration-150"
                style={{ transform: 'none', color: 'var(--text-secondary)' }}>
                <Shuffle className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} /> Remix
                {!isFull && <ProBadge feature="remix" size="sm" />}
              </button>
              <button onClick={handleDeepDive}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[34px] sm:min-h-[40px] rounded-xl text-xs sm:text-sm font-medium transition-all duration-150"
                style={{ background: 'linear-gradient(135deg, rgba(124,106,237,0.15), rgba(6,182,212,0.15))', border: '1px solid rgba(124,106,237,0.3)', color: '#9585F2' }}>
                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} /> Deep Dive
                {!isFull && <ProBadge feature="deep_dive" size="sm" />}
              </button>

            </div>

            {/* Target Audience */}
            <div className="surface-card rounded-xl p-4 mb-4" style={{ transform: 'none' }}>
              <p className="font-body text-[11px] uppercase tracking-[0.04em] font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Target Audience</p>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{targetAudience}</p>
            </div>

            {/* Problem Statement */}
            {problemStatement && (
              <div className="surface-card rounded-xl p-4 mb-4" style={{ transform: 'none', background: 'var(--bg-elevated)' }}>
                <p className="font-body text-[11px] uppercase tracking-[0.04em] font-medium mb-1" style={{ color: '#F97316' }}>The Problem</p>
                <p className="text-sm leading-[1.7] select-text cursor-text" style={{ color: 'var(--text-secondary)' }}>{problemStatement}</p>
              </div>
            )}

            {/* Description */}
            <p className="font-body text-[15px] mb-4 sm:mb-6 leading-[1.7] select-text cursor-text" style={{ color: 'var(--text-secondary)' }}>{description}</p>

            {/* Source section — shows where this idea was discovered */}
            {(() => {
              const sourceUrl = idea?.source_url || idea?.validation_data?.source_url;
              if (!sourceUrl) return null;
              const sourcePlatform = (idea?.validation_data?.source_platform || idea?.source || "").toLowerCase();
              const subreddit = idea?.validation_data?.subreddit;
              const upvotes = idea?.validation_data?.upvotes || 0;
              const comments = idea?.validation_data?.comments || 0;

              // Platform badge config
              let platformLabel = "Source";
              let platformStyle = { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", color: "var(--text-secondary)" };
              if (sourcePlatform.includes("reddit")) {
                platformLabel = subreddit ? `r/${subreddit}` : "Reddit";
                platformStyle = { bg: "rgba(255,69,0,0.12)", border: "rgba(255,69,0,0.25)", color: "#FF6B35" };
              } else if (sourcePlatform.includes("hacker") || sourcePlatform === "hackernews") {
                platformLabel = "Hacker News";
                platformStyle = { bg: "rgba(255,102,0,0.12)", border: "rgba(255,102,0,0.25)", color: "#FF6600" };
              } else if (sourcePlatform.includes("github")) {
                platformLabel = "GitHub";
                platformStyle = { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", color: "var(--text-secondary)" };
              } else if (sourcePlatform.includes("lobste")) {
                platformLabel = "Lobsters";
                platformStyle = { bg: "rgba(139,0,0,0.12)", border: "rgba(139,0,0,0.25)", color: "#C0392B" };
              } else if (sourcePlatform.includes("dev.to")) {
                platformLabel = "Dev.to";
                platformStyle = { bg: "rgba(59,73,223,0.12)", border: "rgba(59,73,223,0.25)", color: "#3B49DF" };
              } else if (sourcePlatform.includes("producthunt") || sourcePlatform.includes("product hunt")) {
                platformLabel = "Product Hunt";
                platformStyle = { bg: "rgba(218,85,47,0.12)", border: "rgba(218,85,47,0.25)", color: "#DA552F" };
              } else if (sourcePlatform.includes("indiehacker") || sourcePlatform.includes("indie hacker")) {
                platformLabel = "Indie Hackers";
                platformStyle = { bg: "rgba(66,133,244,0.12)", border: "rgba(66,133,244,0.25)", color: "#4285F4" };
              } else if (sourcePlatform.includes("stackoverflow") || sourcePlatform.includes("stack overflow")) {
                platformLabel = "Stack Overflow";
                platformStyle = { bg: "rgba(244,128,36,0.12)", border: "rgba(244,128,36,0.25)", color: "#F48024" };
              }

              return (
                <div className="surface-card rounded-xl p-4 mb-4 sm:mb-6" style={{ transform: "none" }}>
                  <p className="font-body text-[11px] uppercase tracking-[0.04em] font-medium mb-2.5" style={{ color: "var(--text-tertiary)" }}>
                    🔗 Source
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mb-2.5">
                    <span className="font-body text-[12px] font-semibold px-2.5 py-1 rounded-md" style={{ background: platformStyle.bg, border: `1px solid ${platformStyle.border}`, color: platformStyle.color }}>
                      {platformLabel}
                    </span>
                    {upvotes > 0 && (
                      <span className="font-body text-[12px] tabular-nums flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                        ⬆ {upvotes.toLocaleString()}
                      </span>
                    )}
                    {comments > 0 && (
                      <span className="font-body text-[12px] tabular-nums flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                        💬 {comments.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {canSeeSourceThreads ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-body text-[13px] font-medium transition-colors hover:underline inline-flex items-center gap-1"
                      style={{ color: "#9585F2" }}
                    >
                      View original thread <ExternalLink className="w-3.5 h-3.5 inline" strokeWidth={1.5} />
                    </a>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                      <span className="font-body text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                        Original source threads are a Pro feature
                      </span>
                      <button
                        onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/pricing")}
                        className="font-body text-[12px] font-medium hover:underline"
                        style={{ color: "#A78BFA" }}
                      >
                        Upgrade
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Scores section */}
            <SectionErrorBoundary sectionName="scores">
            <div className="mb-4 sm:mb-6">
              <h4 className="font-heading text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Validation Scores</h4>
              <div className="surface-card rounded-xl p-3.5 sm:p-5 space-y-2.5" style={{ transform: 'none' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-body text-xs uppercase tracking-[0.04em] font-medium" style={{ color: 'var(--text-tertiary)' }}>Overall</span>
                  <div className="relative w-16 h-16" style={{
                    ...(overallScore >= 9 ? { animation: 'score-pulse 2s ease-in-out infinite' } : {}),
                    filter: overallScore >= 8 ? `drop-shadow(0 0 16px ${scoreColor}44)` : undefined,
                  }}>
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="26" fill={`${scoreColor}08`} stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <motion.circle
                        cx="32" cy="32" r="26" fill="none"
                        stroke={scoreColor}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 26}
                        initial={{ strokeDashoffset: 2 * Math.PI * 26 }}
                        animate={{ strokeDashoffset: 2 * Math.PI * 26 - (overallScore / 10) * 2 * Math.PI * 26 }}
                        transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center font-heading text-lg font-bold tabular-nums" style={{ color: scoreColor }}>
                      {(Number(overallScore) || 0).toFixed(1)}
                    </span>
                  </div>
                </div>
                <ScoreBar label="🔥 Pain Level" value={scores.pain_score ?? 0} />
                <ScoreBar label="📈 Trend" value={scores.trend_score ?? 0} />
                <ScoreBar label={`⚔️ ${competitionLabel}`} value={scores.competition_score ?? 0} />
                <ScoreBar label="💰 Revenue" value={scores.revenue_potential ?? 0} />
                <ScoreBar label={`🛠️ ${buildLabel}`} value={scores.build_difficulty ?? 0} />
                <p className="font-body text-[10px] mt-2 select-none opacity-60" style={{ color: 'var(--text-tertiary)' }}>
                  Competition & Build Difficulty: lower = better
                </p>
              </div>
            </div>
            </SectionErrorBoundary>

            <div className="my-6" style={{ borderTop: '1px solid var(--border-subtle)' }} />

            {/* Related Pain Signals */}
            {relatedSignals.length > 0 && (
              <div id="pain-signals" className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Radio className="w-4 h-4" style={{ color: "#FB923C" }} strokeWidth={1.5} />
                  <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                    Related Pain Signals
                  </h4>
                  <span className="font-body text-[10px] px-2 py-0.5 rounded-md" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", color: "#FB923C" }}>
                    {relatedSignals.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {relatedSignals.map((sig) => {
                    const sentColors: Record<string, string> = { frustrated: "#F59E0B", angry: "#EF4444", desperate: "#A855F7", hopeful: "#10B981", neutral: "#6B7280" };
                    const sColor = sentColors[sig.sentiment || "neutral"] || "#6B7280";
                    return (
                      <div
                        key={sig.id}
                        className="px-3 py-2.5 rounded-xl"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-body text-[10px] font-medium capitalize" style={{ color: sColor }}>{sig.sentiment}</span>
                          <span className="font-body text-[10px]" style={{ color: "#FF8400" }}>
                            {sig.subreddit ? `r/${sig.subreddit}` : sig.source_platform === "hackernews" ? "HN" : sig.source_platform}
                          </span>
                        </div>
                        <p className="font-body text-[13px] italic leading-relaxed line-clamp-2 mb-1.5" style={{ color: "var(--text-secondary)" }}>
                          "{sig.body || sig.title}"
                        </p>
                        <div className="flex items-center gap-3 font-body text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                          <span className="inline-flex items-center gap-0.5">
                            <ArrowUp className="w-3 h-3" strokeWidth={1.5} /> {sig.upvotes}
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <MessageSquare className="w-3 h-3" strokeWidth={1.5} /> {sig.comments}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Proof Stack */}
            <ProofStack idea={idea} relatedSignalCount={relatedSignals.length} />

            {/* Builder Activity */}
            <BuilderActivity viewCount={viewCount} saveCount={localSaveCount} buildCount={idea?.build_count ?? 0} />

            {/* MRR + Meta */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-3 mb-4 sm:mb-6">
              <div className="surface-card rounded-xl p-3 sm:p-4" style={{ transform: 'none' }}>
                <p className="font-body text-[10px] sm:text-[11px] uppercase tracking-[0.04em] font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>💰 Est. MRR</p>
                <p className="text-xs sm:text-sm font-semibold truncate" style={{ color: estimatedMRR ? '#34D399' : 'var(--text-secondary)' }}>{mrrDisplay}</p>
              </div>
              <div className="surface-card rounded-xl p-3 sm:p-4" style={{ transform: 'none' }}>
                <p className="font-body text-[10px] sm:text-[11px] uppercase tracking-[0.04em] font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Audience</p>
                <p className="text-xs sm:text-sm font-medium line-clamp-2" style={{ color: 'var(--text-primary)' }}>{targetAudience}</p>
              </div>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 sm:gap-1.5 mb-4 sm:mb-6">
                {tags.map((tag) => (
                  <span key={tag} className="font-body text-[11px] px-2.5 py-1 rounded-md border" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>{tag}</span>
                ))}
              </div>
            )}

            {/* Competitor Analysis — pre-generated, premium reveal */}
            <div ref={competitorRef} id="competitors-section" />
            <SectionErrorBoundary sectionName="competitors">
            <CompetitorReveal
              competitors={preCompetitors}
              blurHitCount={blurHitCount}
              onBlurHit={handleBlurHit}
            />

            {/* Fallback: show validation_data competitors if no pre-generated ones */}
            {!preCompetitors && idea?.validation_data?.competitors && idea.validation_data.competitors.length > 0 && (
              <CompetitorReveal
                competitors={idea.validation_data.competitors}
                blurHitCount={blurHitCount}
                onBlurHit={handleBlurHit}
              />
            )}
            </SectionErrorBoundary>

            {idea?.validation_data?.real_feedback && idea.validation_data.real_feedback.length > 0 && (
              <RealFeedback feedback={idea.validation_data.real_feedback} sourceUrl={idea?.source_url || idea?.validation_data?.source_url} />
            )}

            <div className="my-6" style={{ borderTop: '1px solid var(--border-subtle)' }} />

            {/* Build Blueprint — pre-generated, premium reveal */}
            <div ref={blueprintRef} id="blueprint-section" />
            <SectionErrorBoundary sectionName="blueprint">
            <BlueprintReveal
              markdown={preBlueprint}
              blurHitCount={blurHitCount}
              onBlurHit={handleBlurHit}
            />
            </SectionErrorBoundary>

            <div className="my-6" style={{ borderTop: '1px solid var(--border-subtle)' }} />

            <p className="text-xs text-center flex items-center justify-center gap-1 tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
              <Users className="w-3.5 h-3.5" strokeWidth={1.5} /> {localSaveCount} builders saved this idea
            </p>
            </>}

            {/* Extra bottom padding for mobile floating action bar */}
            <div className="h-24 sm:h-0" />
          </div>

        </motion.div>

        {/* Mobile floating action bar — OUTSIDE the modal motion.div so fixed positioning works correctly */}
        <motion.div
          key="idea-detail-actionbar"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2, delay: 0.15 }}
          className="sm:hidden fixed bottom-0 left-0 right-0 z-[10000]"
          style={{
            background: 'rgba(6, 7, 11, 0.85)',
            backdropFilter: 'blur(24px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {/* Top gradient accent line — matches MobileNav */}
          <div className="absolute top-0 left-[10%] right-[10%] h-[1px] rounded-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.2), rgba(6,182,212,0.2), transparent)' }} />
          <div
            className="flex items-center justify-around px-0"
            style={{ height: 'calc(56px + env(safe-area-inset-bottom, 8px))', paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
          >
            <button
              onClick={handleSave}
              className="flex flex-col items-center justify-center gap-0.5 py-2 w-full min-h-[44px] haptic-press"
            >
              <Heart className="w-5 h-5" fill={saved ? "currentColor" : "none"} strokeWidth={1.5} style={{ color: saved ? "#F87171" : "var(--text-tertiary)" }} />
              <span className="font-body text-[10px]" style={{ color: saved ? "#F87171" : "var(--text-tertiary)" }}>
                {saved ? "Saved" : "Save"}
              </span>
            </button>
            <button
              onClick={() => {
                haptic();
                blueprintRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="flex flex-col items-center justify-center gap-0.5 py-2 w-full min-h-[44px] haptic-press"
            >
              <Map className="w-5 h-5" strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
              <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>Blueprint</span>
            </button>
            <button
              onClick={() => {
                haptic();
                competitorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="flex flex-col items-center justify-center gap-0.5 py-2 w-full min-h-[44px] haptic-press"
            >
              <Swords className="w-5 h-5" strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
              <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>Rivals</span>
            </button>
            <button
              onClick={handleNativeShare}
              className="flex flex-col items-center justify-center gap-0.5 py-2 w-full min-h-[44px] haptic-press"
            >
              <Upload className="w-5 h-5" strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
              <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>Share</span>
            </button>
          </div>
        </motion.div>

        <ShareModal
          open={showShare}
          onClose={() => setShowShare(false)}
          ideaId={idea?.id || ""}
          ideaTitle={title}
          score={overallScore}
          oneLiner={oneLiner}
          painScore={scores.pain_score}
          trendScore={scores.trend_score}
        />

        <LimitReachedModal
          open={limitModal.open}
          onClose={() => setLimitModal((prev) => ({ ...prev, open: false }))}
          feature={limitModal.feature}
          used={limitModal.used}
          limit={limitModal.limit}
        />
      </AnimatePresence>
  );
};

export default IdeaDetail;
