import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { sampleIdeas, Idea } from "@/data/ideas";
import IdeaCard from "@/components/IdeaCard";
import IdeaDetail from "@/components/IdeaDetail";
import IdeaCardSkeleton from "@/components/IdeaCardSkeleton";
import IdeaOfTheDay from "@/components/IdeaOfTheDay";
import SearchFilterBar, { Filters } from "@/components/SearchFilterBar";

import GamificationBar from "@/components/GamificationBar";
import DailyChallengeCard from "@/components/DailyChallengeCard";
import PullToRefresh from "@/components/PullToRefresh";
import DailyDropSection from "@/components/DailyDropSection";
import { motion, AnimatePresence } from "framer-motion";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useUsage } from "@/hooks/useUsage";
import { useBuilderMatch, categoryToIndustries } from "@/hooks/useBuilderMatch";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Sparkles, ArrowRight, Bell, ChevronUp, Radio, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { useProStatus } from "@/hooks/useProStatus";
import { useAccess } from "@/hooks/useAccess";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import SortTabs from "@/components/SortTabs";
import { getCategoryStyle, formatCategory, getScoreColor } from "@/lib/theme";
import SwipeableIdeaCard from "@/components/SwipeableIdeaCard";
import AllExploredCard from "@/components/AllExploredCard";
import IdeaComparison from "@/components/IdeaComparison";

const PAGE_SIZE = 30;
const FREE_LIMIT = 3;

/** Locked idea preview — shows title + score to build curiosity, blurs the rest. */
const LockedIdeaPreview = ({ idea }: { idea: Idea }) => {
  const { user } = useAuth();
  const { isEarlyAdopter, planStatus, hasUsedTrial } = useProStatus();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);
  const navigate = useNavigate();

  const score = Number(idea?.overall_score) || 0;
  const scoreColor = getScoreColor(score);
  const circumference = 2 * Math.PI * 14;
  const strokeDashoffset = circumference - (score / 10) * circumference;
  const catStyle = getCategoryStyle(idea?.category || "Other");
  const isNoPlan = !hasUsedTrial && !!user;

  const handleUpgrade = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate("/auth?redirect=feed");
    } else {
      openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="surface-card overflow-hidden select-none"
    >
      {/* Visible section: category badge + score + title */}
      <div className="p-3.5 sm:p-5 pb-3">
        <div className="flex items-center justify-between mb-2.5">
          <span className={`font-body text-[11px] uppercase tracking-[0.06em] font-medium px-2.5 py-1 rounded-md border whitespace-nowrap ${catStyle}`}>
            {formatCategory(idea?.category || "Other")}
          </span>
          <div className="relative w-9 h-9 shrink-0" style={score >= 7 ? { filter: `drop-shadow(0 0 6px ${scoreColor}44)` } : undefined}>
            <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
              <circle cx="18" cy="18" r="14" fill="none" stroke={scoreColor} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-heading text-xs font-bold tabular-nums" style={{ color: scoreColor }}>
              {score.toFixed(1)}
            </span>
          </div>
        </div>
        <h3 className="font-heading text-base sm:text-lg font-semibold tracking-[-0.01em] leading-snug line-clamp-2 break-words" style={{ color: "var(--text-primary)" }}>
          {idea?.title || "Untitled Idea"}
        </h3>
      </div>

      {/* Fade-to-locked section */}
      <div className="relative">
        {/* Blurred placeholder content */}
        <div className="blur-[5px] pointer-events-none px-3.5 sm:px-5 pb-4" aria-hidden="true">
          <p className="text-[13px] sm:text-sm mb-3 leading-[1.6]" style={{ color: "var(--text-secondary)" }}>
            {idea?.oneLiner || "Validated problem with market demand signals and competitive analysis..."}
          </p>
          <div style={{ borderTop: "1px solid var(--border-subtle)" }} className="mb-2.5" />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full" style={{ background: "var(--bg-elevated)" }} />
            <div className="flex gap-2">
              <div className="w-9 h-9 rounded-lg" style={{ background: "var(--bg-elevated)" }} />
              <div className="w-9 h-9 rounded-lg" style={{ background: "var(--bg-elevated)" }} />
            </div>
          </div>
        </div>

        {/* Gradient fade overlay + CTA */}
        <div className="absolute inset-0 flex flex-col items-end justify-end z-10 rounded-b-2xl"
          style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(10,11,16,0.85) 60%)" }}>
          <div className="w-full px-3.5 sm:px-5 pb-3.5 sm:pb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
              <p className="font-body text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                {isNoPlan ? "Start free trial to unlock" : "Upgrade to see full details"}
              </p>
            </div>
            <button
              onClick={handleUpgrade}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-heading font-semibold text-white transition-all duration-200 hover:opacity-90 shrink-0"
              style={{ background: isNoPlan ? "linear-gradient(135deg, #F59E0B, #F97316)" : "var(--accent-purple)" }}
            >
              <Sparkles className="w-3 h-3" strokeWidth={2} />
              {isNoPlan ? "Start Trial" : "Upgrade"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const sortOptions = ["For You", "Top Scored", "Newest", "Trending"] as const;

const Feed = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [sort, setSort] = useState<string>("Top Scored");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ search: "", topics: [], budgets: [], techLevels: [], sizes: [], minScore: null });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [alertBannerDismissed, setAlertBannerDismissed] = useState(() => localStorage.getItem("alert_banner_dismissed") === "true");
  const [hasAlerts, setHasAlerts] = useState(false);
  const [newIdeaIds, setNewIdeaIds] = useState<Set<string>>(new Set());
  const [pendingNewIdeas, setPendingNewIdeas] = useState<number>(0);
  const [aiMatchScores, setAiMatchScores] = useState<Record<string, number>>({});
  const [aiMatchLoading, setAiMatchLoading] = useState(false);
  const [saveRefreshKey, setSaveRefreshKey] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const matchCalledRef = useRef(false);
  const retryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const newIdeaTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const { user } = useAuth();
  const { getUsage, incrementUsage } = useUsage();
  const { dna, getMatchScore } = useBuilderMatch();
  const { hasFullAccess: isPro, isEarlyAdopter, planStatus, refetch: refetchProStatus, hasUsedTrial } = useProStatus();
  const { canCompare } = useAccess();
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);
  const navigate = useNavigate();

  // Onboarding check removed — ProtectedRoute already handles this

  // Payment/checkout success handler — show toast + refetch pro status with retries
  // Webhook from Lemon Squeezy may take a few seconds to land in the DB
  useEffect(() => {
    const isPaymentSuccess = searchParams.get("payment") === "success";
    const isCheckoutSuccess = searchParams.get("checkout") === "success";

    const isReactivated = searchParams.get("reactivated") === "true";

    if (isReactivated) {
      toast.success("Welcome back! Your Pro access is live.");
      setSearchParams({}, { replace: true });
    }

    if (isPaymentSuccess || isCheckoutSuccess) {
      toast.success(
        isCheckoutSuccess
          ? "Welcome to Idearupt Pro! Your 7-day free trial has started."
          : "Welcome to Pro! Your account has been upgraded."
      );
      setSearchParams({}, { replace: true });

      // Retry refetch — webhook may not have updated the DB yet
      const retryDelays = [500, 2000, 5000, 10000];
      retryTimersRef.current = retryDelays.map((delay) =>
        setTimeout(() => refetchProStatus(), delay)
      );
    }
    return () => {
      retryTimersRef.current.forEach(clearTimeout);
      retryTimersRef.current = [];
    };
  }, []);

  // Refetch pro status when user switches back to this tab
  // (checkout opens in a new tab — original tab needs to pick up the webhook update)
  const prevPlanRef = useRef(planStatus);
  useEffect(() => {
    // Detect plan upgrade: was none/free → now trial/active
    if (
      (prevPlanRef.current === "none" || prevPlanRef.current === "free") &&
      (planStatus === "trial" || planStatus === "active")
    ) {
      toast.success(
        planStatus === "trial"
          ? "Welcome to Idearupt Pro! Your 7-day free trial has started."
          : "Welcome to Idearupt Pro! Your account has been upgraded."
      );
    }
    prevPlanRef.current = planStatus;
  }, [planStatus]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refetchProStatus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refetchProStatus]);

  useEffect(() => { if (dna) setSort("For You"); }, [dna]);

  // Call match-ideas edge function when user has Builder DNA and ideas loaded
  // useRef guard prevents duplicate calls across re-renders
  useEffect(() => {
    if (!dna || ideas.length === 0) return;
    if (matchCalledRef.current) return;
    matchCalledRef.current = true;
    
    setAiMatchLoading(true);
    const topIdeas = ideas.slice(0, 100).map(i => ({
      id: i.id, title: i.title, description: i.description || i.oneLiner || "",
      category: i.category, tags: i.tags || [],
      scores: i.scores,
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    // Get auth token for server-side auth guard
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
      };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      return fetch(`${SUPABASE_URL}/functions/v1/match-ideas`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ideas: topIdeas,
          builderProfile: {
            tech_level: dna.tech_level,
            budget_range: dna.budget_range,
            time_commitment: dna.time_commitment,
            industries: dna.industries,
            risk_tolerance: dna.risk_tolerance,
          },
        }),
        signal: controller.signal,
      });
    }).then(res => {
      if (!res.ok) throw new Error("Match failed");
      return res.json();
    }).then(data => {
      if (data?.matches) {
        const scores: Record<string, number> = {};
        for (const m of data.matches) {
          if (m.idea_id && typeof m.match_score === "number") {
            scores[m.idea_id] = m.match_score;
          }
        }
        setAiMatchScores(scores);
      }
      setAiMatchLoading(false);
    }).catch(() => setAiMatchLoading(false))
      .finally(() => clearTimeout(timeout));
  }, [dna, ideas.length]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_alerts").select("id").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setHasAlerts(!!data));
  }, [user]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // Map raw DB row → Idea shape (single source of truth)
  const mapRow = (row: any): Idea => ({
    ...row,
    oneLiner: row.oneLiner || row.one_liner || (() => { const d = row.description || ""; if (d.length <= 140) return d; const c = d.substring(0, 140); const s = c.lastIndexOf(" "); return s > 40 ? c.substring(0, s) + "..." : c + "..."; })(),
    category: row.category || "Other",
    categoryColor: row.categoryColor || "bg-primary",
    tags: Array.isArray(row.tags) ? row.tags : [],
    scores: row.scores ?? {
      pain_score: row.pain_score ?? 0, trend_score: row.trend_score ?? 0,
      competition_score: row.competition_score ?? 0, revenue_potential: row.revenue_potential ?? 0,
      build_difficulty: row.build_difficulty ?? 0,
    },
    overall_score: row.overall_score ?? 0,
    problem_size: row.problem_size || (row.build_difficulty != null ? (row.build_difficulty <= 3 ? "small" : row.build_difficulty <= 6 ? "medium" : "large") : "medium"),
    save_count: row.save_count ?? 0,
    view_count: row.view_count ?? 0,
    is_trending: row.is_trending ?? false,
    targetAudience: row.targetAudience || row.target_audience || "Entrepreneurs",
    estimatedMRR: row.estimatedMRR || row.estimated_mrr || null,
    validation_data: row.validation_data ?? undefined,
    blueprint_markdown: row.blueprint_markdown || null,
    blueprint_generated_at: row.blueprint_generated_at || null,
    competitor_analysis_pregenerated: row.competitor_analysis || null,
    competitor_generated_at: row.competitor_generated_at || null,
  });

  const fetchIdeas = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("ideas").select("*").order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        setIdeas(data.map(mapRow));
      } else {
        setIdeas(sampleIdeas);
      }
    } catch {
      setIdeas(sampleIdeas);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  // Restore idea modal from URL ?idea=<id> when navigating back
  useEffect(() => {
    if (ideas.length === 0) return;
    const ideaId = searchParams.get("idea");
    if (ideaId && !selectedIdea) {
      const found = ideas.find(i => i.id === ideaId);
      if (found) setSelectedIdea(found);
    }
  }, [ideas, searchParams]);

  const [ideaLimitReached, setIdeaLimitReached] = useState(false);

  // Open an idea and update the URL — check idea_view daily limit
  const openIdea = async (idea: Idea) => {
    let limited = false;
    if (user) {
      const usage = getUsage("idea_view");
      if (!usage.canUse) {
        limited = true;
      } else {
        await incrementUsage("idea_view");
      }
    }
    setIdeaLimitReached(limited);
    setSelectedIdea(idea);
    setSearchParams({ idea: idea.id });
    trackEvent(EVENTS.IDEA_VIEWED, { idea_id: idea.id, idea_title: idea.title, source: "feed" });
  };

  // Close the idea modal and clear the URL param
  const closeIdea = () => {
    setSelectedIdea(null);
    setSearchParams({}, { replace: true });
    // Trigger save status re-check on all visible IdeaCards
    setSaveRefreshKey((k) => k + 1);
  };

  // Realtime subscriptions — INSERT new ideas + UPDATE existing ideas
  useEffect(() => {
    const mapRow = (row: any): Idea => ({
      ...row,
      oneLiner: row.one_liner || (() => { const d = row.description || ""; if (d.length <= 140) return d; const c = d.substring(0, 140); const s = c.lastIndexOf(" "); return s > 40 ? c.substring(0, s) + "..." : c + "..."; })(),
      category: row.category || "Other",
      categoryColor: row.categoryColor || "bg-primary",
      tags: Array.isArray(row.tags) ? row.tags : [],
      scores: row.scores ?? {
        pain_score: row.pain_score ?? 0, trend_score: row.trend_score ?? 0,
        competition_score: row.competition_score ?? 0, revenue_potential: row.revenue_potential ?? 0,
        build_difficulty: row.build_difficulty ?? 0,
      },
      overall_score: row.overall_score ?? 0,
      problem_size: row.problem_size || (row.build_difficulty != null ? (row.build_difficulty <= 3 ? "small" : row.build_difficulty <= 6 ? "medium" : "large") : "medium"),
      save_count: row.save_count ?? 0,
      view_count: row.view_count ?? 0,
      is_trending: row.is_trending ?? false,
      targetAudience: row.target_audience || "Entrepreneurs",
      estimatedMRR: row.estimated_mrr_range || null,
      validation_data: row.validation_data ?? undefined,
    }) as Idea;

    const channel = supabase
      .channel('ideas-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ideas' },
        (payload) => {
          const newId = (payload.new as any)?.id;
          if (!newId) return;
          const mapped = mapRow(payload.new);
          const isScrolled = window.scrollY > 300;
          if (isScrolled) {
            setPendingNewIdeas(prev => prev + 1);
          }
          // Prevent duplicate inserts with functional state update
          setIdeas(prev => {
            if (prev.some(i => i.id === newId)) return prev;
            return [mapped, ...prev];
          });
          setNewIdeaIds(prev => new Set(prev).add(newId));
          toast.success(`🔥 New problem just dropped: ${mapped.title}`);
          // Clear the NEW badge after 3 seconds — track timer for cleanup
          const badgeTimer = setTimeout(() => {
            setNewIdeaIds(prev => { const n = new Set(prev); n.delete(newId); return n; });
            newIdeaTimersRef.current.delete(newId);
          }, 3000);
          newIdeaTimersRef.current.set(newId, badgeTimer);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ideas' },
        (payload) => {
          const updated = mapRow(payload.new);
          setIdeas(prev => prev.map(idea => {
            if (idea.id !== updated.id) return idea;
            // Preserve existing validation_data if the update doesn't include it
            // (Realtime payloads from trigger-only updates may not include JSONB columns)
            return {
              ...idea,
              ...updated,
              validation_data: updated.validation_data || idea.validation_data,
            };
          }));
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'ideas' },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setIdeas(prev => prev.filter(idea => idea.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      newIdeaTimersRef.current.forEach(clearTimeout);
      newIdeaTimersRef.current.clear();
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setPendingNewIdeas(0);
  };

  const ideaOfTheDay = useMemo(() => {
    if (ideas.length === 0) return null;
    const dateSeed = new Date().toISOString().substring(0, 10);
    const seedNum = dateSeed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

    // If user has builder DNA, pick from their best-matched ideas
    if (dna) {
      const withScores = ideas.map(idea => ({ idea, matchScore: getMatchScore(idea) ?? 0 }));
      const sorted = withScores.sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.idea.overall_score ?? 0) - (a.idea.overall_score ?? 0);
      });
      const top5 = sorted.slice(0, Math.min(5, sorted.length));
      return top5[seedNum % top5.length]?.idea || null;
    }

    // Default: top-scored rotation
    const sorted = [...ideas].sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));
    const top5 = sorted.slice(0, Math.min(5, sorted.length));
    return top5[seedNum % top5.length] || null;
  }, [ideas, dna, getMatchScore]);

  const filtered = useMemo(() => {
    return ideas
      .filter((idea) => {
        // Topic filter: match against idea.category mapped to industry labels (OR logic)
        if (filters.topics.length > 0) {
          const ideaCat = (idea?.category || "").toLowerCase();
          const ideaTags = (idea?.tags || []).map((t: string) => t.toLowerCase());
          // Map the idea's raw category to onboarding industry labels
          const mappedIndustries = categoryToIndustries(idea?.category || "").map(i => i.toLowerCase());
          const matchesTopic = filters.topics.some(topic => {
            const t = topic.toLowerCase();
            // 1. Direct category match (substring both ways)
            if (ideaCat.includes(t) || t.includes(ideaCat)) return true;
            // 2. Mapped industry match (e.g. "Dev Tool" category maps to "Developer Tools")
            if (mappedIndustries.some(mi => mi.includes(t) || t.includes(mi))) return true;
            // 3. Tag match
            if (ideaTags.some((tag: string) => tag.includes(t) || t.includes(tag))) return true;
            return false;
          });
          if (!matchesTopic) return false;
        }
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const match = (idea.title || "").toLowerCase().includes(q)
            || (idea.description || "").toLowerCase().includes(q)
            || (idea.category || "").toLowerCase().includes(q)
            || (idea.tags || []).some((t) => t.toLowerCase().includes(q))
            || (idea.oneLiner || "").toLowerCase().includes(q);
          if (!match) return false;
        }
        if (filters.minScore != null && (idea.overall_score ?? 0) < filters.minScore) return false;
        if (filters.techLevels.length > 0) {
          const ideaTech = (idea.techLevel || "").replace(/-/g, "_");
          if (!filters.techLevels.includes(ideaTech)) return false;
        }
        if (filters.budgets.length > 0) {
          const bd = idea.scores?.build_difficulty ?? 5;
          const budgetTier = idea.budget_min
            ? idea.budget_min.toLowerCase().replace(/[\s\-]/g, "_")
            : bd <= 2 ? "zero" : bd <= 4 ? "low" : bd <= 7 ? "medium" : "high";
          if (!filters.budgets.includes(budgetTier)) return false;
        }
        if (filters.sizes.length > 0) {
          const size = idea.problem_size || "medium";
          if (!filters.sizes.includes(size)) return false;
        }
        return true;
      })
      .map((idea) => {
        // Prefer AI match score from edge function, fallback to client-side
        const aiScore = aiMatchScores[idea.id];
        const clientScore = getMatchScore(idea);
        const matchScore = aiScore != null ? aiScore : clientScore;
        return { idea, matchScore };
      })
      .filter(({ matchScore }) => {
        // Only filter truly poor matches; lowered from 20 to 10 to ensure ideas always show
        if (sort === "For You" && dna) return (matchScore ?? 0) >= 10;
        return true;
      })
      .sort((a, b) => {
        if (sort === "For You") return (b.matchScore ?? 0) - (a.matchScore ?? 0);
        if (sort === "Trending") {
          // Trending = recency boost + engagement + pain score + overall score
          const now = Date.now();
          const recencyA = Math.max(0, 7 - (now - new Date(a.idea?.created_at || 0).getTime()) / 86400000); // 0-7 day boost
          const recencyB = Math.max(0, 7 - (now - new Date(b.idea?.created_at || 0).getTime()) / 86400000);
          const trendA = (a.idea?.is_trending ? 500 : 0) + recencyA * 100 + (a.idea?.save_count ?? 0) * 50 + (a.idea?.view_count ?? 0) * 5 + (a.idea?.scores?.pain_score ?? 0) * 30 + (a.idea?.overall_score ?? 0) * 10;
          const trendB = (b.idea?.is_trending ? 500 : 0) + recencyB * 100 + (b.idea?.save_count ?? 0) * 50 + (b.idea?.view_count ?? 0) * 5 + (b.idea?.scores?.pain_score ?? 0) * 30 + (b.idea?.overall_score ?? 0) * 10;
          return trendB - trendA;
        }
        if (sort === "Newest") return new Date(b.idea?.created_at || 0).getTime() - new Date(a.idea?.created_at || 0).getTime();
        return (b.idea?.overall_score ?? 0) - (a.idea?.overall_score ?? 0);
      });
  }, [ideas, filters, sort, dna, getMatchScore, aiMatchScores]);

  // Track search queries (debounced)
  useEffect(() => {
    if (!filters.search) return;
    const timer = setTimeout(() => {
      trackEvent(EVENTS.FEED_SEARCH_PERFORMED, { query: filters.search });
    }, 1000);
    return () => clearTimeout(timer);
  }, [filters.search]);

  return (
    <div className="min-h-screen pb-20 md:pb-0 overflow-x-hidden" ref={scrollRef}>

      {/* New ideas banner */}
      <AnimatePresence>
        {pendingNewIdeas > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[55] cursor-pointer"
            onClick={scrollToTop}
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full font-body text-sm font-medium shadow-lg"
              style={{ background: '#7C6AED', color: '#fff' }}>
              <ChevronUp className="w-4 h-4" strokeWidth={2} />
              {pendingNewIdeas} new problem{pendingNewIdeas > 1 ? 's' : ''} available
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PullToRefresh onRefresh={fetchIdeas}>
      <div className="mx-auto px-4 py-4 sm:py-6 max-w-3xl w-full">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}>

          <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-1 tracking-[-0.02em]">
            <span style={{ color: 'var(--text-primary)' }}>Today's </span>
            <span className="text-gradient-purple-cyan">Problems</span>
          </h1>
          <p className="font-body text-sm mb-4 sm:mb-6" style={{ color: 'var(--text-tertiary)' }}>{today}</p>

          {/* Signals discovery banner — PRO feature promoted from feed */}
          {!loading && user && (
            <Link to="/signals" className="block mb-4 sm:mb-5">
              <div
                className="flex items-center gap-3 p-3.5 rounded-xl transition-all active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, rgba(249,115,22,0.06), rgba(139,92,246,0.06))',
                  border: '1px solid rgba(249,115,22,0.15)',
                }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(249,115,22,0.1)' }}>
                  <Radio className="w-4.5 h-4.5" style={{ color: '#FB923C' }} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Live Signals
                  </p>
                  <p className="font-body text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                    See what people are complaining about right now →
                  </p>
                </div>
                <span className="font-bold text-[7px] uppercase tracking-widest px-1.5 py-[2px] rounded-full shrink-0" style={{ background: 'rgba(124,106,237,0.1)', color: '#9585F2' }}>PRO</span>
              </div>
            </Link>
          )}

          {/* Daily Drop Section — exclude Idea of the Day to avoid duplication */}
          {!loading && ideas.length > 0 && (
            <DailyDropSection ideas={ideas} onIdeaClick={(idea) => openIdea(idea)} excludeId={ideaOfTheDay?.id} />
          )}

          {/* Idea of the Day */}
          {!loading && ideaOfTheDay && (
            <IdeaOfTheDay idea={ideaOfTheDay} matchScore={getMatchScore(ideaOfTheDay)} onClick={() => openIdea(ideaOfTheDay)} />
          )}

          {user && <DailyChallengeCard />}
          {user && <GamificationBar />}
          
          {/* Free Tier & Pro banners removed — trial system handles upgrade prompts */}

          {/* Builder profile banner — ProtectedRoute forces onboarding for new users.
              Show a subtle "improve your matches" banner only for users who skipped. */}
          {!loading && user && !dna && (
            <Link to="/onboarding" className="block mb-3 sm:mb-5">
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="surface-card p-4 flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-accent shrink-0" strokeWidth={1.5} />
                  <div>
                    <p className="font-heading text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Complete your builder profile</p>
                    <p className="font-body text-xs" style={{ color: 'var(--text-tertiary)' }}>Get personalized idea recommendations</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 group-hover:text-accent transition-colors" style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
              </motion.div>
            </Link>
          )}

          {/* Alert banner */}
          {!loading && user && !hasAlerts && !alertBannerDismissed && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="surface-card p-4 flex items-center justify-between mb-3 sm:mb-5 group">
              <Link to="/settings" className="flex items-center gap-3 flex-1">
                <Bell className="w-5 h-5 shrink-0" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
                <div>
                  <p className="font-heading text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Set up Alerts</p>
                  <p className="font-body text-xs" style={{ color: 'var(--text-tertiary)' }}>Get notified when problems match your criteria →</p>
                </div>
              </Link>
              <button onClick={(e) => { e.stopPropagation(); setAlertBannerDismissed(true); localStorage.setItem("alert_banner_dismissed", "true"); }}
                className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}
                aria-label="Dismiss alert banner">
                ✕
              </button>
            </motion.div>
          )}

          <SearchFilterBar filters={filters} onChange={setFilters} resultCount={filtered.length} totalCount={ideas.length} userInterests={dna?.industries} />

          {/* Sort tabs */}
          <SortTabs options={sortOptions} active={sort} onChange={(s) => { setSort(s); trackEvent(EVENTS.FEED_SORT_CHANGED, { sort: s }); }} layoutId="feed-tab-underline" showForYouIcon />

          {loading || (sort === "For You" && aiMatchLoading && Object.keys(aiMatchScores).length === 0) ? (
            <div className="space-y-3 sm:space-y-4">
              {sort === "For You" && aiMatchLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-3">
                  <p className="font-body text-xs" style={{ color: 'var(--text-tertiary)' }}>🧬 Personalizing your feed...</p>
                </motion.div>
              )}
              {[...Array(3)].map((_, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.1 }}>
                <IdeaCardSkeleton />
              </motion.div>
            ))}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 surface-card rounded-2xl" style={{ transform: 'none' }}>
              <div className="text-4xl mb-4">{sort === "For You" ? "🧬" : "🔍"}</div>
              <p className="font-heading text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                {filters.search || filters.topics.length || filters.budgets.length || filters.techLevels.length || filters.minScore
                  ? "No matches found"
                  : sort === "For You" ? "No personalized matches yet" : "Nothing here yet"}
              </p>
              <p className="font-body text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>
                {filters.search || filters.topics.length || filters.budgets.length || filters.techLevels.length || filters.minScore
                  ? "Try broadening your search or adjusting filters."
                  : sort === "For You" ? "Try 'Top Scored' instead for great problems." : "Check back soon for new problems."}
              </p>
              {(filters.search || filters.topics.length > 0 || filters.budgets.length > 0 || filters.techLevels.length > 0 || filters.sizes.length > 0 || filters.minScore) && (
                <button onClick={() => setFilters({ search: "", topics: [], budgets: [], techLevels: [], sizes: [], minScore: null })}
                  className="font-body text-sm text-[#9585F2] hover:text-[var(--text-primary)] transition-colors duration-150">Clear filters</button>
              )}
            </div>
          ) : (
            <>
              {/* Results count with upgrade link for free users */}
              {!isPro && filtered.length > FREE_LIMIT && (
                <p className="font-body text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
                  {filtered.length} problem{filtered.length !== 1 ? "s" : ""} · {FREE_LIMIT} free · <button onClick={() => openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user?.email || undefined, user?.id)} className="text-[#A78BFA] hover:underline">Upgrade for all</button>
                </p>
              )}

              {/* Pre-limit warning: 1 idea view remaining today */}
              {!isPro && user && getUsage("idea_view").remaining === 1 && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-body text-[11px] font-medium mb-3"
                  style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#FBBF24" }}>
                  ⚠ 1 idea view left today · <button
                    onClick={() => openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user?.email || undefined, user?.id)}
                    className="underline hover:text-amber-300 transition-colors">
                    Upgrade for more
                  </button>
                </div>
              )}
              <AnimatePresence>
                <div className="space-y-3 sm:space-y-4">
                  {(() => {
                    // Compute most explored idea (highest view_count)
                    const mostExploredId = filtered.reduce((best, curr) =>
                      (curr.idea?.view_count ?? 0) > (best?.view_count ?? 0) ? curr.idea : best,
                      filtered[0]?.idea
                    )?.id;
                    return filtered.slice(0, visibleCount)
                      .filter(({ idea }) => !dismissedIds.has(idea?.id))
                      .map(({ idea, matchScore }, i) => {
                    const isLocked = !isPro && i >= FREE_LIMIT;
                    const isCompareSelected = compareIds.includes(idea?.id);
                    const toggleCompare = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (!canCompare) {
                        toast("Compare is a Pro feature. Upgrade to unlock.");
                        return;
                      }
                      setCompareIds((prev) => {
                        if (prev.includes(idea?.id)) return prev.filter((id) => id !== idea?.id);
                        if (prev.length >= 3) { toast("Maximum 3 ideas for comparison"); return prev; }
                        return [...prev, idea?.id];
                      });
                    };
                    const cardContent = isLocked ? (
                      <LockedIdeaPreview idea={idea} />
                    ) : (
                      <div className="relative overflow-hidden rounded-2xl">
                        {/* Compare checkbox */}
                        <button
                          onClick={toggleCompare}
                          className="absolute top-3 left-3 z-10 w-6 h-6 rounded-md flex items-center justify-center transition-all"
                          style={{
                            background: isCompareSelected ? "#7C6AED" : "rgba(255,255,255,0.06)",
                            border: isCompareSelected ? "1px solid #9585F2" : "1px solid rgba(255,255,255,0.12)",
                            opacity: canCompare ? 1 : 0.4,
                          }}
                          title={canCompare ? (isCompareSelected ? "Remove from comparison" : "Add to comparison") : "Compare is a Pro feature"}
                        >
                          {isCompareSelected && <span className="text-white text-xs font-bold">✓</span>}
                        </button>
                        <IdeaCard idea={idea} index={i} matchScore={matchScore} onClick={() => openIdea(idea)} isNew={newIdeaIds.has(idea?.id)} refreshSaveKey={saveRefreshKey} isMostExplored={idea?.id === mostExploredId && (idea?.view_count ?? 0) > 10} />
                      </div>
                    );
                    // Wrap with SwipeableIdeaCard on mobile (non-locked cards only)
                    if (isMobile && !isLocked) {
                      return (
                        <SwipeableIdeaCard
                          key={idea?.id || i}
                          ideaId={idea?.id}
                          onSave={() => setSaveRefreshKey((k) => k + 1)}
                          onDismiss={() => setDismissedIds((prev) => new Set(prev).add(idea?.id))}
                        >
                          {cardContent}
                        </SwipeableIdeaCard>
                      );
                    }
                    return <div key={idea?.id || i}>{cardContent}</div>;
                  });
                  })()}
                </div>
              </AnimatePresence>
              {visibleCount < filtered.length ? (
                <div className="text-center mt-6">
                  <button onClick={() => { setVisibleCount((v) => v + PAGE_SIZE); trackEvent(EVENTS.FEED_LOAD_MORE, { visible_count: visibleCount + 30 }); }}
                    className="btn-ghost px-6 py-2.5 text-sm font-body">
                    Load more problems ({filtered.length - visibleCount} remaining)
                  </button>
                </div>
              ) : filtered.length > 0 && (
                <AllExploredCard />
              )}
            </>
          )}
        </motion.div>
      </div>
      </PullToRefresh>

      {selectedIdea && createPortal(
        <IdeaDetail idea={selectedIdea} onClose={closeIdea} limitReached={ideaLimitReached} />,
        document.body
      )}

      {/* Floating compare bar */}
      <AnimatePresence>
        {compareIds.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[55]"
          >
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl" style={{ background: "#7C6AED", color: "#fff" }}>
              <button
                onClick={() => setShowComparison(true)}
                className="font-heading text-sm font-semibold whitespace-nowrap"
              >
                Compare {compareIds.length} Ideas
              </button>
              <button onClick={() => setCompareIds([])} className="p-1 rounded-lg hover:bg-[rgba(255,255,255,0.15)]" aria-label="Clear selection">
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comparison modal */}
      <AnimatePresence>
        {showComparison && (
          <IdeaComparison
            ideas={ideas.filter((i) => compareIds.includes(i.id))}
            onClose={() => setShowComparison(false)}
            onRemove={(id) => {
              setCompareIds((prev) => prev.filter((i) => i !== id));
              if (compareIds.length <= 2) setShowComparison(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Feed;
