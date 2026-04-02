import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Target, Lock, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useAccess } from "@/hooks/useAccess";
import { useProStatus } from "@/hooks/useProStatus";
import { useUsage } from "@/hooks/useUsage";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import { useNavigate } from "react-router-dom";
import NicheSelector from "@/components/NicheSelector";
import PainRadarCard from "@/components/radar/PainRadarCard";
import IdeaDetail from "@/components/IdeaDetail";
import { Idea } from "@/data/ideas";
import { categoryToIndustries } from "@/hooks/useBuilderMatch";
import { toast } from "sonner";

const SCANNING_SOURCES = ["Reddit", "Hacker News", "Product Hunt", "Indie Hackers", "Stack Overflow", "GitHub", "Dev.to", "Lobsters"];
const FREE_VISIBLE = 3;

// ── Helpers ─────────────────────────────────────────────────

/** Fisher-Yates shuffle (returns new array) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Generate fake "time ago" labels — staggered realistically */
function getTimeAgo(idx: number): string {
  if (idx === 0) return "just now";
  if (idx === 1) return "2m ago";
  if (idx === 2) return "5m ago";
  if (idx <= 4) return `${5 + Math.floor(Math.random() * 8)}m ago`;
  if (idx <= 8) return `${15 + Math.floor(Math.random() * 20)}m ago`;
  if (idx <= 14) return `${40 + Math.floor(Math.random() * 30)}m ago`;
  if (idx <= 22) return `${Math.floor(Math.random() * 2) + 1}h ago`;
  if (idx <= 35) return `${Math.floor(Math.random() * 3) + 2}h ago`;
  return `${Math.floor(Math.random() * 8) + 4}h ago`;
}

/** Slower, more realistic drip: 5-14 seconds with occasional bursts */
function nextDripMs(): number {
  // 20% chance of a quicker "burst" (3-5s), 80% is slow and organic (6-14s)
  if (Math.random() < 0.2) return 3000 + Math.random() * 2000;
  return 6000 + Math.random() * 8000;
}

// ─────────────────────────────────────────────────────────────

const PainRadar = () => {
  const { user } = useAuth();
  const { hasFullAccess } = useAccess();
  const { isEarlyAdopter, hasUsedTrial } = useProStatus();
  const { getUsage, incrementUsage } = useUsage();
  const navigate = useNavigate();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);

  const [niches, setNiches] = useState<string[]>([]);
  const [painFilter, setPainFilter] = useState<number>(0);
  const [allIdeas, setAllIdeas] = useState<Idea[]>([]);
  const [visibleIdeas, setVisibleIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanningIdx, setScanningIdx] = useState(0);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [newestIdx, setNewestIdx] = useState<number>(-1); // index of last dripped card (shows NEW badge)
  const dripTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scanning source animation — randomized order
  useEffect(() => {
    const shuffled = shuffle([...SCANNING_SOURCES]);
    let i = 0;
    const timer = setInterval(() => {
      setScanningIdx(i % shuffled.length);
      i++;
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Fetch ideas — 150 for variety
  useEffect(() => {
    const fetchIdeas = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("ideas")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(150);

        if (error || !data) { setAllIdeas([]); setLoading(false); return; }

        // Deduplicate by normalized title (strip special chars)
        const seen = new Set<string>();
        const deduped = data.filter((row: any) => {
          const key = (row.title || "").toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 50);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const mapped: Idea[] = deduped.map((row: any) => ({
          ...row,
          oneLiner: row.one_liner || row.description?.substring(0, 140) || "",
          category: row.category || "Other",
          categoryColor: row.categoryColor || "bg-primary",
          tags: Array.isArray(row.tags) ? row.tags : [],
          scores: row.scores ?? {
            pain_score: row.pain_score ?? 0,
            trend_score: row.trend_score ?? 0,
            competition_score: row.competition_score ?? 0,
            revenue_potential: row.revenue_potential ?? 0,
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
        }));

        setAllIdeas(mapped);
      } catch {
        setAllIdeas([]);
      } finally {
        setLoading(false);
      }
    };
    fetchIdeas();
  }, []);

  // Fetch saved status
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_interactions")
      .select("idea_id")
      .eq("user_id", user.id)
      .eq("action", "saved")
      .then(({ data }) => {
        if (data) setSavedIds(new Set(data.map((d: any) => d.idea_id)));
      });
  }, [user]);

  // Filter by niches + pain score, then SHUFFLE so each visit feels unique
  const filtered = useMemo(() => {
    const f = allIdeas.filter((idea) => {
      // Niche filter
      if (niches.length > 0) {
        const ideaCat = (idea.category || "").toLowerCase();
        const ideaTags = (idea.tags || []).map((t) => t.toLowerCase());
        const mappedIndustries = categoryToIndustries(idea.category || "").map((i) => i.toLowerCase());
        const matchesNiche = niches.some((niche) => {
          const n = niche.toLowerCase();
          if (ideaCat.includes(n) || n.includes(ideaCat)) return true;
          if (mappedIndustries.some((mi) => mi.includes(n) || n.includes(mi))) return true;
          if (ideaTags.some((tag) => tag.includes(n) || n.includes(tag))) return true;
          return false;
        });
        if (!matchesNiche) return false;
      }

      // Pain filter
      const pain = idea.scores?.pain_score ?? 0;
      if (painFilter > 0 && pain < painFilter) return false;

      return true;
    });

    // Fully random shuffle — no weighting, every visit feels different
    return shuffle(f);
  }, [allIdeas, niches, painFilter]);

  // Drip-feed with SLOW randomized intervals — feels like a real live feed
  useEffect(() => {
    setVisibleIdeas([]);
    setNewestIdx(-1);
    if (filtered.length === 0) return;

    let idx = 0;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled || idx >= filtered.length) return;
      // First card after 1.5-3s "scanning" delay, rest use normal drip
      const delay = idx === 0 ? 1500 + Math.random() * 1500 : nextDripMs();
      dripTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        const nextIdx = idx;
        setVisibleIdeas((prev) => [...prev, filtered[nextIdx]]);
        setNewestIdx(nextIdx);
        idx++;
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (dripTimerRef.current) clearTimeout(dripTimerRef.current);
    };
  }, [filtered]);

  // Clear NEW badge after 4 seconds
  useEffect(() => {
    if (newestIdx < 0) return;
    const t = setTimeout(() => setNewestIdx(-1), 4000);
    return () => clearTimeout(t);
  }, [newestIdx]);

  const handleView = useCallback(async (idea: Idea) => {
    if (user) {
      const usage = getUsage("idea_view");
      if (!usage.canUse) {
        toast.error("Daily idea view limit reached. Upgrade to Pro for more.");
        return;
      }
      const ok = await incrementUsage("idea_view");
      if (!ok) return;
    }
    setSelectedIdea(idea);
  }, [user, getUsage, incrementUsage]);

  const handleSave = useCallback(async (idea: Idea) => {
    if (!user) { navigate("/auth"); return; }
    const isSaved = savedIds.has(idea.id);
    if (isSaved) {
      await supabase.from("user_interactions").delete().eq("user_id", user.id).eq("idea_id", idea.id).eq("action", "saved");
      setSavedIds((prev) => { const s = new Set(prev); s.delete(idea.id); return s; });
      toast("Unsaved");
    } else {
      const { error } = await supabase.from("user_interactions").insert({ user_id: user.id, idea_id: idea.id, action: "saved" });
      if (error?.code === "23505") return;
      if (!error) {
        setSavedIds((prev) => new Set(prev).add(idea.id));
        await incrementUsage("save");
        toast.success("Saved!");
      }
    }
  }, [user, savedIds, incrementUsage, navigate]);

  const handleUpgrade = () => {
    if (!user) {
      navigate("/auth?redirect=radar");
    } else {
      openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id);
    }
  };

  const displayedIdeas = hasFullAccess ? visibleIdeas : visibleIdeas.slice(0, FREE_VISIBLE);
  const hasMore = !hasFullAccess && visibleIdeas.length > FREE_VISIBLE;

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <div className="mx-auto px-4 py-4 sm:py-6 max-w-3xl w-full">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-[-0.02em]">
              <span style={{ color: "var(--text-primary)" }}>Pain </span>
              <span className="text-gradient-purple-cyan">Radar</span>
            </h1>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="font-body text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#34D399" }}>LIVE</span>
            </div>
          </div>
          <p className="font-body text-sm mb-5" style={{ color: "var(--text-tertiary)" }}>
            Real complaints from communities, scored and ready to build
          </p>

          {/* Niche selector */}
          <div className="mb-4">
            <NicheSelector selected={niches} onChange={setNiches} max={3} storageKey="radar_niches" />
          </div>

          {/* Pain filter pills */}
          <div className="flex items-center gap-2 mb-5">
            <span className="font-body text-[10px] uppercase tracking-[0.06em] font-medium" style={{ color: "var(--text-tertiary)" }}>Min Pain</span>
            {[
              { label: "All", value: 0 },
              { label: "7+", value: 7 },
              { label: "8+", value: 8 },
            ].map((opt) => {
              const isLocked = opt.value === 8 && !hasFullAccess;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (isLocked) {
                      toast("8+ pain filter is a Pro feature.");
                      return;
                    }
                    setPainFilter(painFilter === opt.value ? 0 : opt.value);
                  }}
                  className={`font-body text-[11px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 flex items-center gap-1 ${
                    painFilter === opt.value
                      ? "text-[#EEEEF0] border border-[rgba(124,106,237,0.4)] bg-[rgba(124,106,237,0.15)]"
                      : "border border-transparent hover:border-[var(--border-hover)]"
                  }`}
                  style={painFilter !== opt.value ? { color: "var(--text-tertiary)" } : {}}
                >
                  {opt.label}
                  {isLocked && <Lock className="w-3 h-3 opacity-50" strokeWidth={1.5} />}
                </button>
              );
            })}

            {/* Live count */}
            {!loading && filtered.length > 0 && (
              <span className="font-body text-[11px] ml-auto tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                {visibleIdeas.length}/{filtered.length} found
              </span>
            )}
          </div>

          {/* Scanning indicator — shows while dripping */}
          {(loading || visibleIdeas.length < filtered.length) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2.5 mb-4 px-3 py-2.5 rounded-xl"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
            >
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#9585F2" }} strokeWidth={1.5} />
              <span className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
                Scanning{" "}
                <AnimatePresence mode="wait">
                  <motion.span
                    key={scanningIdx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="inline-block font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {SCANNING_SOURCES[scanningIdx]}
                  </motion.span>
                </AnimatePresence>
                {" "}for pain points...
              </span>
            </motion.div>
          )}

          {/* Cards */}
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="surface-card p-4 animate-pulse">
                  <div className="h-4 rounded w-1/3 mb-3" style={{ background: "var(--bg-elevated)" }} />
                  <div className="h-5 rounded w-2/3 mb-2" style={{ background: "var(--bg-elevated)" }} />
                  <div className="h-3 rounded w-full mb-3" style={{ background: "var(--bg-elevated)" }} />
                  <div className="h-2 rounded w-1/2" style={{ background: "var(--bg-elevated)" }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 surface-card rounded-2xl">
              <div className="text-4xl mb-4">🎯</div>
              <p className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {niches.length > 0 ? "No matches for these niches" : "Select niches to start scanning"}
              </p>
              <p className="font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
                {niches.length > 0 ? "Try different niches or lower the pain filter." : "Pick up to 3 niches above to see live complaints."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {displayedIdeas.map((idea, i) => (
                  <PainRadarCard
                    key={idea.id}
                    idea={idea}
                    index={i}
                    onView={() => handleView(idea)}
                    onSave={() => handleSave(idea)}
                    saved={savedIds.has(idea.id)}
                    timeAgo={getTimeAgo(i)}
                    isNew={i === newestIdx}
                  />
                ))}
              </AnimatePresence>

              {/* Free user blur overlay */}
              {hasMore && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="relative"
                >
                  <div className="blur-[6px] pointer-events-none select-none space-y-3">
                    {visibleIdeas.slice(FREE_VISIBLE, FREE_VISIBLE + 2).map((idea, i) => (
                      <PainRadarCard
                        key={idea.id}
                        idea={idea}
                        index={FREE_VISIBLE + i}
                        onView={() => {}}
                        timeAgo={getTimeAgo(FREE_VISIBLE + i)}
                      />
                    ))}
                  </div>
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl"
                    style={{ background: "linear-gradient(to bottom, transparent, rgba(10,11,16,0.95) 40%)" }}
                  >
                    <div className="text-center px-6">
                      <Lock className="w-6 h-6 mx-auto mb-3" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                      <p className="font-heading text-base font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
                        {filtered.length - FREE_VISIBLE} more pain points found
                      </p>
                      <p className="font-body text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>
                        Upgrade to Pro for unlimited radar access
                      </p>
                      <button
                        onClick={handleUpgrade}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-heading text-sm font-semibold text-white transition-all hover:opacity-90"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}
                      >
                        <Sparkles className="w-4 h-4" strokeWidth={2} />
                        Unlock Pain Radar — {priceLabel}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* All revealed */}
              {!loading && visibleIdeas.length >= filtered.length && !hasMore && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center font-body text-xs py-4"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  All {filtered.length} pain point{filtered.length !== 1 ? "s" : ""} loaded
                  {niches.length > 0 ? ` for ${niches.join(", ")}` : ""}
                </motion.p>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Idea detail modal */}
      {selectedIdea && createPortal(
        <IdeaDetail idea={selectedIdea} onClose={() => setSelectedIdea(null)} />,
        document.body
      )}
    </div>
  );
};

export default PainRadar;
