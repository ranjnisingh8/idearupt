import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Briefcase, Users, BarChart3, Clock, Lock,
  ChevronRight, Sparkles, ExternalLink, Search,
  Target, DollarSign, Rocket, ArrowRight,
} from "lucide-react";
import UseCaseDetail from "@/components/UseCaseDetail";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { useProStatus } from "@/hooks/useProStatus";
import { useAccess } from "@/hooks/useAccess";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import { getCategoryStyle, getDifficultyStyle, getDemandStyle } from "@/lib/theme";
import SortTabs from "@/components/SortTabs";

// ── Types ──────────────────────────────────────────────────
export interface UseCase {
  id: string;
  title: string;
  target_user: string | null;
  problem: string | null;
  solution: string | null;
  pricing_recommendation: string | null;
  where_to_find_customers: string | null;
  launch_steps: string[] | null;
  category: string | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  estimated_build_time: string | null;
  demand_score: number | null;
  source_links: string[] | null;
  status: "active" | "archived" | null;
  created_at: string;
  updated_at: string;
}


const FREE_LIMIT = 3;

const difficultyFilters = ["All", "Beginner", "Intermediate", "Advanced"] as const;
const sortOptions = ["Top Demand", "Newest", "Easiest First"] as const;

// ── Main Page ──────────────────────────────────────────────
const UseCases = () => {
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase | null>(null);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("All");
  const [sort, setSort] = useState<string>("Top Demand");
  const { user } = useAuth();
  const { hasFullAccess: isPro, isEarlyAdopter, planStatus, hasUsedTrial } = useProStatus();
  const navigate = useNavigate();
  const { canSeeSourceThreads } = useAccess();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);

  useEffect(() => {
    trackEvent(EVENTS.USE_CASE_VIEWED);
  }, []);

  const fetchUseCases = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("use_cases")
        .select("*")
        .eq("status", "active")
        .order("demand_score", { ascending: false });

      if (!error && data) {
        setUseCases(data as UseCase[]);
      }
    } catch {
      // Silently fail — empty state shown
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUseCases(); }, [fetchUseCases]);

  useEffect(() => {
    if (!search) return;
    const timer = setTimeout(() => {
      trackEvent(EVENTS.USECASE_SEARCHED, { query: search });
    }, 1000);
    return () => clearTimeout(timer);
  }, [search]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("use-cases-realtime")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "use_cases" },
        (payload) => {
          const newUC = payload.new as UseCase;
          if (newUC.status === "active") {
            setUseCases((prev) => {
              if (prev.some((uc) => uc.id === newUC.id)) return prev;
              return [newUC, ...prev];
            });
          }
        }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "use_cases" },
        (payload) => {
          const updated = payload.new as UseCase;
          setUseCases((prev) =>
            prev.map((uc) => (uc.id === updated.id ? { ...uc, ...updated } : uc))
          );
        }
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "use_cases" },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setUseCases((prev) => prev.filter((uc) => uc.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Filtered + sorted list
  const filtered = useCases
    .filter((uc) => {
      if (difficulty !== "All" && (uc.difficulty || "intermediate") !== difficulty.toLowerCase()) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          (uc.title || "").toLowerCase().includes(q) ||
          (uc.target_user || "").toLowerCase().includes(q) ||
          (uc.problem || "").toLowerCase().includes(q) ||
          (uc.category || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "Top Demand") return (b.demand_score ?? 0) - (a.demand_score ?? 0);
      if (sort === "Newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === "Easiest First") {
        const order = { beginner: 0, intermediate: 1, advanced: 2 };
        return (order[a.difficulty || "intermediate"] || 1) - (order[b.difficulty || "intermediate"] || 1);
      }
      return 0;
    });

  const handleCardClick = (uc: UseCase) => {
    trackEvent(EVENTS.USE_CASE_VIEWED, { usecase_id: uc.id, usecase_title: uc.title });
    setSelectedUseCase(uc);
  };

  return (
    <div className="min-h-screen pb-20 md:pb-0">

      <div className="mx-auto px-4 py-6 max-w-3xl w-full">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}>

          {/* Header */}
          <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-1 tracking-[-0.02em]">
            <span style={{ color: "var(--text-primary)" }}>Use </span>
            <span className="text-gradient-purple-cyan">Cases</span>
          </h1>
          <p className="font-body text-sm mb-6" style={{ color: "var(--text-tertiary)" }}>
            Ready-to-build blueprints with target users, pricing, and launch plans
          </p>

          {/* Search bar */}
          <div className="relative mb-5">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "var(--text-tertiary)" }}
              strokeWidth={1.5}
            />
            <input
              type="text"
              placeholder="Search use cases..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl font-body text-sm outline-none transition-all duration-200"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Sort tabs */}
          <SortTabs options={sortOptions} active={sort} onChange={setSort} layoutId="uc-tab-underline" />

          {/* Difficulty filter pills */}
          <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 scrollbar-hide">
            {difficultyFilters.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDifficulty(d);
                  trackEvent(EVENTS.USECASE_FILTERED, { difficulty: d });
                }}
                className={`font-body text-[11px] uppercase tracking-[0.06em] font-medium px-2.5 py-1.5 rounded-md transition-all duration-150 whitespace-nowrap shrink-0 ${
                  difficulty === d
                    ? "text-[#22D3EE] border border-[rgba(6,182,212,0.3)] bg-[rgba(6,182,212,0.1)] scale-[1.02] shadow-sm"
                    : "border border-transparent hover:border-[var(--border-hover)] hover:scale-[1.01]"
                }`}
                style={difficulty !== d ? { color: "var(--text-tertiary)" } : {}}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Results count */}
          {!loading && (
            <p className="font-body text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
              {filtered.length} use case{filtered.length !== 1 ? "s" : ""}
              {!isPro && filtered.length > FREE_LIMIT && (
                <span className="ml-1">· {FREE_LIMIT} free · <button onClick={() => openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user?.email || undefined, user?.id)} className="text-[#A78BFA] hover:underline">Upgrade for all</button></span>
              )}
            </p>
          )}

          {/* Loading skeleton */}
          {loading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.08 }}
                  className="surface-card rounded-2xl p-5 h-[140px] animate-pulse"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 surface-card rounded-2xl">
              <div className="text-4xl mb-4">🔍</div>
              <p className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {search ? "No matches found" : "No use cases yet"}
              </p>
              <p className="font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
                {search ? "Try broadening your search." : "Check back soon — new use cases are added regularly."}
              </p>
              {search && (
                <button onClick={() => setSearch("")} className="font-body text-sm text-[#A78BFA] hover:text-[var(--text-primary)] transition-colors mt-3">
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {filtered.slice(0, isPro ? filtered.length : FREE_LIMIT).map((uc, index) => {
                  const diffStyle = getDifficultyStyle(uc.difficulty);
                  const demandStyle = getDemandStyle(uc.demand_score);

                  return (
                    <motion.div
                      key={uc.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.4) }}
                      className="relative surface-card rounded-2xl overflow-hidden cursor-pointer"
                      onClick={() => handleCardClick(uc)}
                    >
                      {/* Card content */}
                      <div className="p-5">
                        {/* Top row: badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          {/* Demand score badge */}
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                            style={{ color: demandStyle.color, background: demandStyle.bg, borderColor: demandStyle.border }}
                          >
                            <BarChart3 className="w-3 h-3" strokeWidth={2} />
                            {uc.demand_score?.toFixed(1) ?? "—"}/10
                          </span>

                          {/* Difficulty badge */}
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                            style={{ color: diffStyle.color, background: diffStyle.bg, borderColor: diffStyle.border }}
                          >
                            {diffStyle.label}
                          </span>

                          {/* Category badge */}
                          {uc.category && (
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${getCategoryStyle(uc.category)}`}>
                              {uc.category}
                            </span>
                          )}

                          {/* Build time */}
                          {uc.estimated_build_time && (
                            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                              <Clock className="w-3 h-3" strokeWidth={1.5} />
                              {uc.estimated_build_time}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h3 className="font-heading text-base sm:text-lg font-semibold mb-1.5 tracking-[-0.01em] leading-snug" style={{ color: "var(--text-primary)" }}>
                          {uc.title}
                        </h3>

                        {/* Target user */}
                        {uc.target_user && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <Target className="w-3.5 h-3.5 shrink-0" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
                            <span className="font-body text-xs" style={{ color: "var(--text-secondary)" }}>
                              {uc.target_user}
                            </span>
                          </div>
                        )}

                        {/* Problem summary (truncated) */}
                        {uc.problem && (
                          <p className="font-body text-sm leading-relaxed line-clamp-2" style={{ color: "var(--text-tertiary)" }}>
                            {uc.problem}
                          </p>
                        )}

                        {/* Bottom row */}
                        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <div className="flex items-center gap-3">
                            {uc.pricing_recommendation && (
                              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                                <DollarSign className="w-3 h-3" strokeWidth={1.5} />
                                {uc.pricing_recommendation.length > 30
                                  ? uc.pricing_recommendation.substring(0, 30) + "…"
                                  : uc.pricing_recommendation}
                              </span>
                            )}
                            {uc.launch_steps && uc.launch_steps.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                                <Rocket className="w-3 h-3" strokeWidth={1.5} />
                                {uc.launch_steps.length} steps
                              </span>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Locked cards + upgrade overlay for free users */}
              {!isPro && filtered.length > FREE_LIMIT && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="relative"
                >
                  <div className="blur-[6px] pointer-events-none select-none space-y-4">
                    {filtered.slice(FREE_LIMIT, FREE_LIMIT + 2).map((uc) => (
                      <div key={uc.id} className="surface-card rounded-2xl p-5">
                        <h3 className="font-heading text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{uc.title}</h3>
                        <p className="font-body text-sm line-clamp-1" style={{ color: "var(--text-tertiary)" }}>{uc.problem || uc.target_user || ""}</p>
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
                        {filtered.length - FREE_LIMIT} more use case{filtered.length - FREE_LIMIT !== 1 ? "s" : ""}
                      </p>
                      <p className="font-body text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>
                        Upgrade to Pro for unlimited access
                      </p>
                      <button
                        onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=use-cases")}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-heading text-sm font-semibold text-white transition-all hover:opacity-90"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}
                      >
                        <Sparkles className="w-4 h-4" strokeWidth={2} />
                        Unlock All Use Cases — {priceLabel}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedUseCase && (
          <UseCaseDetail useCase={selectedUseCase} onClose={() => setSelectedUseCase(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default UseCases;
