import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BarChart3, Clock, ArrowRight, Target, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface UseCasePreview {
  id: string;
  title: string;
  target_user: string | null;
  category: string | null;
  difficulty: string | null;
  demand_score: number | null;
  estimated_build_time: string | null;
}

const getDifficultyStyle = (d: string | null) => {
  switch (d) {
    case "beginner":
      return { label: "Beginner", color: "#34D399", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)" };
    case "advanced":
      return { label: "Advanced", color: "#F87171", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)" };
    default:
      return { label: "Intermediate", color: "#FBBF24", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" };
  }
};

const getDemandColor = (score: number | null) => {
  const s = score ?? 0;
  if (s >= 8) return "#34D399";
  if (s >= 6) return "#FBBF24";
  return "#A78BFA";
};

const LiveUseCasesPreview = () => {
  const [useCases, setUseCases] = useState<UseCasePreview[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const fetchUseCases = async () => {
      // Fetch top 6 use cases — show 2 clear, rest blurred
      const { data, count } = await supabase
        .from("use_cases")
        .select("id, title, target_user, category, difficulty, demand_score, estimated_build_time", { count: "exact" })
        .eq("status", "active")
        .order("demand_score", { ascending: false })
        .limit(12);
      if (data && data.length > 0) {
        // Deduplicate by title (keep highest demand_score)
        const seen = new Set<string>();
        const unique = data.filter((uc) => {
          const key = uc.title.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setUseCases(unique.slice(0, 6));
      }
      if (count != null) setTotalCount(count);
    };
    fetchUseCases();

    // Realtime: refresh when use cases change (insert, update, delete)
    const channel = supabase
      .channel("landing-use-cases")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "use_cases" },
        () => { fetchUseCases(); }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "use_cases" },
        () => { fetchUseCases(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (useCases.length === 0) return null;

  // Show first 3 fully, rest blurred
  const visibleCount = 3;

  return (
    <section className="container mx-auto px-4 py-10 sm:py-20">
      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        {/* Header */}
        <div className="text-center mb-5 sm:mb-6">
          <h2 className="font-heading text-lg sm:text-2xl font-bold tracking-[-0.02em] mb-1" style={{ color: "var(--text-primary)" }}>
            Ready-to-Build Blueprints
          </h2>
          <p className="font-body text-xs sm:text-sm" style={{ color: "var(--text-tertiary)" }}>
            Proven use cases with launch plans & demand scores{totalCount > 0 ? ` — ${totalCount}+ available` : ""}
          </p>
        </div>

        {/* Mobile: horizontal scroll carousel / Desktop: grid */}
        <div className="relative max-w-5xl mx-auto mb-6">
          <div className="sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
            <div className="flex sm:contents gap-3 overflow-x-auto pb-3 sm:pb-0 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
              {useCases.slice(0, Math.min(useCases.length, visibleCount + 4)).map((uc, i) => {
                const diffStyle = getDifficultyStyle(uc.difficulty);
                const demandColor = getDemandColor(uc.demand_score);
                const builderCount = 3 + Math.abs([...uc.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 11);
                const isBlurred = i >= visibleCount;
                return (
                  <div key={uc.id} className="relative block shrink-0 w-[68vw] max-w-[260px] sm:w-auto sm:max-w-none snap-start">
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.1 }}
                      transition={{ delay: i * 0.06, duration: 0.3 }}
                      className={`glass-card rounded-xl p-3.5 sm:p-5 ${isBlurred ? "select-none" : "cursor-pointer hover:scale-[1.02]"}`}
                      style={{
                        filter: isBlurred ? "blur(6px)" : "none",
                        opacity: isBlurred ? 0.5 : 1,
                      }}
                    >
                      {/* Category + Demand row */}
                      <div className="flex items-center justify-between mb-2.5">
                        {uc.category && (
                          <span
                            className="font-body text-[10px] uppercase tracking-[0.06em] font-semibold px-2 py-0.5 rounded-md"
                            style={{
                              background: "rgba(139,92,246,0.1)",
                              border: "1px solid rgba(139,92,246,0.2)",
                              color: "#A78BFA",
                            }}
                          >
                            {uc.category}
                          </span>
                        )}
                        <span
                          className="inline-flex items-center gap-1 font-heading text-xs font-bold tabular-nums px-2 py-0.5 rounded-md"
                          style={{
                            background: `${demandColor}15`,
                            border: `1px solid ${demandColor}30`,
                            color: demandColor,
                          }}
                        >
                          <BarChart3 className="w-3 h-3" strokeWidth={2} />
                          {uc.demand_score?.toFixed(1) ?? "—"}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="font-heading text-sm font-semibold leading-snug mb-1.5 line-clamp-2" style={{ color: "var(--text-primary)" }}>
                        {uc.title}
                      </h3>

                      {/* Target user */}
                      {uc.target_user && (
                        <p className="flex items-center gap-1.5 font-body text-xs mb-2.5 line-clamp-1" style={{ color: "var(--text-secondary)" }}>
                          <Target className="w-3 h-3 shrink-0" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
                          {uc.target_user}
                        </p>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border"
                          style={{ color: diffStyle.color, background: diffStyle.bg, borderColor: diffStyle.border }}
                        >
                          {diffStyle.label}
                        </span>
                        {uc.estimated_build_time && (
                          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                            <Clock className="w-3 h-3" strokeWidth={1.5} />
                            {uc.estimated_build_time}
                          </span>
                        )}
                      </div>

                      {/* Social proof */}
                      <p className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                        {builderCount} builders exploring this
                      </p>
                    </motion.div>
                    {/* Overlay on blurred cards */}
                    {isBlurred && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10">
                        <Link
                          to="/auth"
                          className="flex items-center gap-1.5 font-body text-[11px] font-medium px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                          style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#A78BFA" }}
                        >
                          <Lock className="w-3 h-3" strokeWidth={1.5} /> Sign up to unlock
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="text-center">
          <Link to="/auth" className="inline-flex items-center gap-2 font-heading text-sm font-semibold transition-colors" style={{ color: "#A78BFA" }}>
            <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
            Sign up free to see all {totalCount} blueprints <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        </div>
      </motion.div>
    </section>
  );
};

export default LiveUseCasesPreview;
