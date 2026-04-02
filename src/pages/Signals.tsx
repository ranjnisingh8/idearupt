import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import ProBadge from "@/components/ProBadge";
import { supabase } from "@/lib/supabase";
import { ArrowUp, MessageSquare, ExternalLink, Lightbulb, Clock, TrendingUp, Lock, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useUsage } from "@/hooks/useUsage";
import { useProStatus } from "@/hooks/useProStatus";
import { useBuilderMatch } from "@/hooks/useBuilderMatch";
import { useAccess } from "@/hooks/useAccess";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { sentimentStyles, platformFilters } from "@/lib/theme";

interface PainSignal {
  id: string;
  title: string;
  body: string | null;
  source_platform: string;
  source_url: string | null;
  subreddit: string | null;
  author: string | null;
  upvotes: number;
  comments: number;
  engagement_score: number;
  sentiment: string | null;
  pain_keywords: string[] | null;
  category: string | null;
  linked_idea_id: string | null;
  discovered_at: string;
  linked_idea?: { title: string } | null;
}

const sortOptions = ["For You", "Newest", "Most Upvotes"] as const;

const PAGE_SIZE = 20;
const FREE_LIMIT = 3;

const Signals = () => {
  const [signals, setSignals] = useState<PainSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<string>("All");
  const [sort, setSort] = useState<string>("Newest");
  const [category, setCategory] = useState<string>("All");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [viewedSignalIds, setViewedSignalIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getUsage, incrementUsage } = useUsage();
  const { hasFullAccess, isEarlyAdopter, planStatus, hasUsedTrial } = useProStatus();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);
  const { canSeeSourceThreads } = useAccess();
  const { dna } = useBuilderMatch();

  useEffect(() => {
    trackEvent(EVENTS.SIGNAL_VIEWED);
  }, []);

  // Auto-switch to "For You" when Builder DNA exists
  useEffect(() => { if (dna) setSort("For You"); }, [dna]);

  const fetchSignals = useCallback(async (mounted = { current: true }) => {
    try {
      const { data, error } = await supabase
        .from("pain_signals")
        .select("*, linked_idea:ideas!pain_signals_linked_idea_id_fkey(title)")
        .order("discovered_at", { ascending: false })
        .limit(500);
      if (!error && data && mounted.current) {
        setSignals(data as PainSignal[]);
        setLastUpdated(new Date());
      }
    } catch {
      // Silently fail — empty state shown
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const mounted = { current: true };
    fetchSignals(mounted);
    return () => { mounted.current = false; };
  }, [fetchSignals]);

  // Realtime subscription for signals (INSERT, UPDATE, DELETE)
  useEffect(() => {
    const channel = supabase
      .channel('signals-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pain_signals' },
        (payload) => {
          const newSignal = payload.new as PainSignal;
          setSignals(prev => {
            if (prev.some(s => s.id === newSignal.id)) return prev;
            return [newSignal, ...prev];
          });
          setLastUpdated(new Date());
          toast.success(`📡 New signal detected: ${newSignal.title?.substring(0, 50)}`);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pain_signals' },
        (payload) => {
          const updated = payload.new as PainSignal;
          setSignals(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
          setLastUpdated(new Date());
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pain_signals' },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setSignals(prev => prev.filter(s => s.id !== deletedId));
            setLastUpdated(new Date());
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    signals.forEach((s) => { if (s.category) counts[s.category] = (counts[s.category] || 0) + 1; });
    return counts;
  }, [signals]);

  const trendingCategories = useMemo(() => {
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const counts: Record<string, number> = {};
    signals.forEach((s) => {
      if (s.category && new Date(s.discovered_at).getTime() > last24h) {
        counts[s.category] = (counts[s.category] || 0) + 1;
      }
    });
    return new Set(Object.entries(counts).filter(([, c]) => c >= 3).map(([k]) => k));
  }, [signals]);

  const categories = useMemo(() => {
    // Only show categories with 3+ signals to reduce clutter
    const cats = Object.entries(categoryCounts)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    return ["All", ...cats];
  }, [categoryCounts]);

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    return signals.filter((s) => s.discovered_at?.substring(0, 10) === today).length;
  }, [signals]);

  const topSubreddit = useMemo(() => {
    const counts: Record<string, number> = {};
    signals.forEach((s) => { if (s.subreddit) counts[s.subreddit] = (counts[s.subreddit] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  }, [signals]);

  const filtered = useMemo(() => {
    let result = [...signals];

    if (platform !== "All") {
      result = result.filter((s) => {
        if (platform === "Reddit") return s.source_platform === "reddit";
        if (platform === "Hacker News") return s.source_platform === "hackernews";
        if (platform === "Product Hunt") return s.source_platform === "producthunt";
        if (platform === "Indie Hackers") return s.source_platform === "indiehackers";
        if (platform === "Stack Overflow") return s.source_platform === "stackoverflow";
        if (platform === "GitHub") return s.source_platform === "github";
        return true;
      });
    }
    if (category !== "All") {
      result = result.filter((s) => s.category === category);
    }

    result.sort((a, b) => {
      if (sort === "For You" && dna) {
        const userIndustries = (dna.industries || []).map((i: string) => i.toLowerCase());
        const matchesA = userIndustries.some((ui: string) =>
          (a.category || "").toLowerCase().includes(ui) ||
          (a.pain_keywords || []).some((k) => k.toLowerCase().includes(ui)) ||
          (a.subreddit || "").toLowerCase().includes(ui)
        ) ? 1000 : 0;
        const matchesB = userIndustries.some((ui: string) =>
          (b.category || "").toLowerCase().includes(ui) ||
          (b.pain_keywords || []).some((k) => k.toLowerCase().includes(ui)) ||
          (b.subreddit || "").toLowerCase().includes(ui)
        ) ? 1000 : 0;
        if (matchesA !== matchesB) return matchesB - matchesA;
        return b.engagement_score - a.engagement_score;
      }
      if (sort === "Most Upvotes") return b.upvotes - a.upvotes;
      return new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime();
    });

    return result;
  }, [signals, platform, sort, category, dna]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const isSignalLimitReached = user ? !getUsage("signal_view").canUse : false;

  // Check signal_view limit before expanding — counts unique signals viewed per day
  const handleSignalView = async (id: string): Promise<boolean> => {
    if (!user) return true; // anonymous users can view
    if (viewedSignalIds.has(id)) return true; // already viewed this one
    const usage = getUsage("signal_view");
    if (!usage.canUse) {
      return false;
    }
    await incrementUsage("signal_view");
    setViewedSignalIds((prev) => new Set(prev).add(id));
    return true;
  };

  const toggleExpand = async (id: string) => {
    const isExpanding = !expanded.has(id);
    if (isExpanding) {
      const allowed = await handleSignalView(id);
      if (!allowed) return;
      trackEvent(EVENTS.SIGNAL_EXPANDED, { signal_id: id });
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isToday = (date: string) => new Date(date).toISOString().substring(0, 10) === new Date().toISOString().substring(0, 10);

  const pillBase = "font-body text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all duration-150 whitespace-nowrap";
  const pillActive = "text-[#22D3EE] border border-[rgba(6,182,212,0.3)] bg-[rgba(6,182,212,0.1)]";
  const pillInactive = "border border-transparent hover:border-[var(--border-hover)]";

  return (
    <div className="min-h-screen pb-20 md:pb-0">

      <div className="mx-auto px-4 py-6 max-w-3xl w-full">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-3 w-3">
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
              Live Pain Signals
            </h1>
            <ProBadge feature="signals" size="md" />
          </div>
          <p className="font-body text-sm mb-2" style={{ color: "var(--text-tertiary)" }}>
            Real complaints from Reddit, Hacker News, Product Hunt, Indie Hackers, Stack Overflow & GitHub — updated daily
          </p>
          <div
            className="rounded-lg px-3 py-2 mb-4 flex items-center gap-2"
            style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)" }}
          >
            <span className="text-xs">✨</span>
            <p className="font-body text-[11px]" style={{ color: "#A78BFA" }}>
              This is a Pro feature — <strong>included in your free trial</strong>
            </p>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-1.5 sm:gap-4 mb-4 sm:mb-6 font-body text-[11px] sm:text-xs" style={{ color: "var(--text-secondary)" }}>
            <span>📊 <strong>{signals.length}</strong> signals</span>
            <span>🔥 <strong>{todayCount}</strong> today</span>
            <span className="hidden sm:inline">Top: r/{topSubreddit}</span>
            <span>🕐 {formatDistanceToNow(lastUpdated, { addSuffix: true })}</span>
          </div>

          {/* Filters — clean 2-row layout */}
          <div className="space-y-2 mb-6">
            {/* Row 1: Platform + Sort */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-nowrap">
              {platformFilters.map((p) => (
                <button key={p} onClick={() => {
                  setPlatform(p);
                  trackEvent(EVENTS.SIGNAL_PLATFORM_FILTERED, { platform: p });
                }}
                  className={`${pillBase} ${platform === p ? pillActive : pillInactive}`}
                  style={platform !== p ? { color: "var(--text-tertiary)" } : {}}>
                  {p}
                </button>
              ))}
              <span className="w-px h-4 mx-1 self-center" style={{ background: "var(--border-hover)" }} />
              {sortOptions.map((s) => (
                <button key={s} onClick={() => setSort(s)}
                  className={`${pillBase} ${sort === s ? "text-[#A78BFA] border border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.1)]" : pillInactive}`}
                  style={sort !== s ? { color: "var(--text-tertiary)" } : {}}>
                  {s}
                </button>
              ))}
            </div>
            {/* Row 2: Categories (only those with 3+ signals) */}
            {categories.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-nowrap">
                {categories.map((c) => {
                  const count = c === "All" ? filtered.length : (categoryCounts[c] || 0);
                  const isTrending = trendingCategories.has(c);
                  return (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`${pillBase} ${category === c ? pillActive : pillInactive} flex items-center gap-1`}
                      style={category !== c ? { color: "var(--text-tertiary)" } : {}}>
                      {c}{c !== "All" && <span style={{ opacity: 0.5 }}>({count})</span>}
                      {isTrending && <TrendingUp className="w-3 h-3 ml-0.5" style={{ color: "#F97316" }} strokeWidth={2} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Signal Cards */}
          {loading ? (
            <div className="space-y-3 sm:space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="surface-card rounded-xl p-5 space-y-3" style={{ transform: "none" }}>
                  <div className="flex justify-between">
                    <div className="skeleton-shimmer h-5 w-20 rounded-md" />
                    <div className="skeleton-shimmer h-5 w-16 rounded-md" />
                  </div>
                  <div className="skeleton-shimmer h-16 w-full rounded-md" />
                  <div className="skeleton-shimmer h-4 w-32 rounded-md" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-4">📡</p>
              <p className="font-heading text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {signals.length === 0 ? "Pain signals are being collected" : "No signals match your filters"}
              </p>
              <p className="font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
                {signals.length === 0
                  ? "Check back soon — we scan Reddit, HN, Product Hunt, Indie Hackers & Stack Overflow daily for fresh opportunities."
                  : "Try adjusting your filters to see more results."}
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {/* Results count with upgrade link for free users */}
              {!hasFullAccess && filtered.length > FREE_LIMIT && (
                <p className="font-body text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
                  {filtered.length} signal{filtered.length !== 1 ? "s" : ""} · {FREE_LIMIT} free · <button onClick={() => openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user?.email || undefined, user?.id)} className="text-[#A78BFA] hover:underline">Upgrade for all</button>
                </p>
              )}
              <div className="space-y-3 sm:space-y-4">
                {(hasFullAccess ? visible : visible.slice(0, FREE_LIMIT)).map((signal, i) => {
                  const sent = sentimentStyles[signal.sentiment || "neutral"] || sentimentStyles.neutral;
                  const isExp = expanded.has(signal.id);
                  const text = signal.body || signal.title || "";
                  const isLong = text.length > 200;
                  const isHot = signal.upvotes >= 100;
                  const isActive = signal.comments >= 50;
                  const isNew = isToday(signal.discovered_at);
                  return (
                    <div key={signal.id} className="relative overflow-hidden rounded-xl">
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.03 }}
                        className={`surface-card rounded-xl p-5 ${isNew ? "ring-1 ring-[rgba(6,182,212,0.15)]" : ""}`}
                        style={{ transform: "none" }}
                      >
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className="font-body text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-md"
                              style={{ background: sent.bg, border: `1px solid ${sent.border}`, color: sent.color }}>
                              {sent.label}
                            </span>
                            {isHot && (
                              <span className="font-body text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-md"
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#F87171" }}>
                                🔥 Hot
                              </span>
                            )}
                            {isActive && (
                              <span className="font-body text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-md hidden sm:inline-block"
                                style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60A5FA" }}>
                                💬 Active
                              </span>
                            )}
                            {isNew && (
                              <span className="font-body text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-md"
                                style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)", color: "#22D3EE" }}>
                                New
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <span className="font-body text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-md truncate max-w-[100px] sm:max-w-none"
                              style={{ background: "rgba(255,132,0,0.12)", border: "1px solid rgba(255,132,0,0.25)", color: "#FF8400" }}>
                              {signal.subreddit && signal.source_platform === "reddit" ? `r/${signal.subreddit}` : signal.source_platform === "hackernews" ? "HN" : signal.source_platform === "producthunt" ? "PH" : signal.source_platform === "indiehackers" ? "IH" : signal.source_platform === "stackoverflow" ? "SO" : signal.source_platform === "github" ? "GH" : signal.source_platform}
                            </span>
                            <span className="flex items-center gap-1 font-body text-[10px] sm:text-[11px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                              <ArrowUp className="w-3 h-3" strokeWidth={1.5} /> {signal.upvotes}
                            </span>
                            <span className="flex items-center gap-1 font-body text-[10px] sm:text-[11px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                              <MessageSquare className="w-3 h-3" strokeWidth={1.5} /> {signal.comments}
                            </span>
                          </div>
                        </div>

                        {/* Quote */}
                        <p className="font-body text-sm italic leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
                          "{isLong && !isExp ? text.substring(0, 200) + "..." : text}"
                        </p>
                        {isLong && (
                          <button onClick={() => toggleExpand(signal.id)} className="font-body text-[11px] mb-3 transition-colors min-h-[44px] flex items-center"
                            style={{ color: "var(--accent-cyan)" }}
                            aria-label={isExp ? "Show less of this signal" : "Read more of this signal"}>
                            {isExp ? "Show less" : "Read more"}
                          </button>
                        )}

                        {/* Keywords */}
                        {signal.pain_keywords && signal.pain_keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 sm:gap-1.5 mb-3">
                            {signal.pain_keywords.slice(0, 5).map((kw) => (
                              <span key={kw} className="font-body text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-md truncate max-w-[120px] sm:max-w-none"
                                style={{ border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
                                {kw}
                              </span>
                            ))}
                            {signal.category && (
                              <span className="font-body text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-md"
                                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.15)", color: "#A78BFA" }}>
                                {signal.category}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-2 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <span className="flex items-center gap-1 font-body text-[10px] sm:text-[11px] shrink-0" style={{ color: "var(--text-tertiary)" }}>
                            <Clock className="w-3 h-3" strokeWidth={1.5} />
                            {formatDistanceToNow(new Date(signal.discovered_at), { addSuffix: true })}
                          </span>
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                            {signal.source_url && canSeeSourceThreads ? (
                              <a href={signal.source_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 font-body text-[10px] sm:text-[11px] font-medium px-2 sm:px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap min-h-[44px]"
                                style={{ border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
                                onClick={() => trackEvent(EVENTS.SIGNAL_EXTERNAL_CLICKED, { signal_id: signal.id, platform: signal.source_platform })}
                                aria-label={`View signal on ${signal.source_platform === "reddit" ? "Reddit" : signal.source_platform === "hackernews" ? "Hacker News" : signal.source_platform === "producthunt" ? "Product Hunt" : signal.source_platform === "indiehackers" ? "Indie Hackers" : signal.source_platform === "stackoverflow" ? "Stack Overflow" : "GitHub"}`}>
                                <ExternalLink className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                                <span className="sm:hidden">{signal.source_platform === "reddit" ? "Reddit" : signal.source_platform === "hackernews" ? "HN" : signal.source_platform === "producthunt" ? "PH" : signal.source_platform === "indiehackers" ? "IH" : signal.source_platform === "stackoverflow" ? "SO" : "GH"} ↗</span>
                                <span className="hidden sm:inline">View on {signal.source_platform === "reddit" ? "Reddit" : signal.source_platform === "hackernews" ? "Hacker News" : signal.source_platform === "producthunt" ? "Product Hunt" : signal.source_platform === "indiehackers" ? "Indie Hackers" : signal.source_platform === "stackoverflow" ? "Stack Overflow" : "GitHub"} ↗</span>
                              </a>
                            ) : signal.source_url ? (
                              <span
                                className="flex items-center gap-1 font-body text-[10px] sm:text-[11px] font-medium px-2 sm:px-2.5 py-1.5 rounded-md whitespace-nowrap min-h-[44px]"
                                style={{ border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)", opacity: 0.6 }}
                                title="Source threads are a Pro feature"
                              >
                                <Lock className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                                <span className="sm:hidden">Source</span>
                                <span className="hidden sm:inline">Source Thread</span>
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded ml-1" style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA" }}>PRO</span>
                              </span>
                            ) : null}
                            {signal.linked_idea_id && (
                              <button
                                onClick={() => navigate(`/idea/${signal.linked_idea_id}`)}
                                className="flex items-center gap-1 font-body text-[10px] sm:text-[11px] font-medium px-2 sm:px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap min-h-[44px]"
                                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#A78BFA" }}
                                aria-label="View related idea">
                                <Lightbulb className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                                <span className="sm:hidden">Idea</span>
                                <span className="hidden sm:inline">Related Idea</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Linked idea banner */}
                        {signal.linked_idea_id && signal.linked_idea && (
                          <div className="mt-3 px-3 py-2 rounded-lg cursor-pointer" onClick={() => navigate(`/idea/${signal.linked_idea_id}`)}
                            style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)" }}>
                            <span className="font-body text-[10px] sm:text-[11px] line-clamp-1 break-words" style={{ color: "#A78BFA" }}>
                              💡 Related: {(signal.linked_idea as any)?.title || "View Idea"}
                            </span>
                          </div>
                        )}
                      </motion.div>

                    </div>
                  );
                })}

                {/* Locked signal cards + upgrade overlay for free users */}
                {!hasFullAccess && filtered.length > FREE_LIMIT && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="relative"
                  >
                    <div className="blur-[6px] pointer-events-none select-none space-y-3 sm:space-y-4">
                      {filtered.slice(FREE_LIMIT, FREE_LIMIT + 2).map((sig) => (
                        <div key={sig.id} className="surface-card rounded-xl p-5">
                          <p className="font-body text-sm italic line-clamp-1" style={{ color: "var(--text-secondary)" }}>"{sig.body || sig.title}"</p>
                        </div>
                      ))}
                    </div>
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl"
                      style={{ background: "linear-gradient(to bottom, transparent, rgba(10,11,16,0.95) 40%)" }}
                    >
                      <div className="text-center px-6">
                        <Lock className="w-6 h-6 mx-auto mb-3" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                        <p className="font-heading text-base font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
                          {filtered.length - FREE_LIMIT} more signal{filtered.length - FREE_LIMIT !== 1 ? "s" : ""}
                        </p>
                        <p className="font-body text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>
                          Upgrade to Pro for unlimited signal access
                        </p>
                        <button
                          onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user?.email || undefined, user?.id) : navigate("/auth?redirect=signals")}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-heading text-sm font-semibold text-white transition-all hover:opacity-90"
                          style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}
                        >
                          <Sparkles className="w-4 h-4" strokeWidth={2} />
                          Unlock All Signals — {priceLabel}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </AnimatePresence>
          )}

          {/* Daily limit overlay */}
          {isSignalLimitReached && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center mt-4"
              style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(6,182,212,0.03))",
                border: "1px solid rgba(139,92,246,0.15)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)" }}>
                <Clock className="w-5 h-5" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
              </div>
              <h3 className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Daily limit reached
              </h3>
              <p className="font-body text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
                Resets at midnight UTC
              </p>
              <button
                onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=signals")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-heading font-semibold text-white transition-all hover:scale-[1.03]"
                style={{ background: !hasUsedTrial ? "linear-gradient(135deg, #F59E0B, #F97316)" : "#7C6AED" }}
              >
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                {!hasUsedTrial ? "Start Free Trial" : `Upgrade to Pro — ${priceLabel}`}
              </button>
            </motion.div>
          )}

          {/* Load More */}
          {hasMore && !loading && !isSignalLimitReached && (
            <div className="text-center mt-6">
              <button onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                className="btn-ghost px-6 py-2.5 text-sm font-body">
                Load more signals ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}

          {/* Usage indicator — only show for free users */}
          {user && !loading && !hasFullAccess && (() => {
            const u = getUsage("signal_view");
            return (
              <p className="font-body text-[10px] text-center mt-4 mb-2" style={{ color: "var(--text-tertiary)" }}>
                {u.remaining === 0 ? "Daily limit reached · resets at midnight UTC" : `${u.used}/${u.limit} signal views today`}
              </p>
            );
          })()}
        </motion.div>
      </div>

    </div>
  );
};

export default Signals;
