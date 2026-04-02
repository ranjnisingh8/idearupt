import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowUp, MessageSquare, ArrowRight, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Signal {
  id: string;
  title: string;
  body: string | null;
  source_platform: string;
  subreddit: string | null;
  upvotes: number;
  comments: number;
  sentiment: string | null;
  created_at?: string;
  linked_idea_id?: string | null;
  linked_idea_title?: string | null;
}

const sentimentColors: Record<string, string> = {
  frustrated: "#F59E0B",
  angry: "#EF4444",
  desperate: "#A855F7",
  hopeful: "#10B981",
  neutral: "#6B7280",
};

const getRelativeTime = (dateStr: string | undefined) => {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return null;
};

const LiveSignalsPreview = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const fetchSignals = async () => {
      // Fetch top 6 signals — highest engagement first (show 2 clear, 4 blurred)
      const { data, count } = await supabase
        .from("pain_signals")
        .select("id, title, body, source_platform, subreddit, upvotes, comments, sentiment, created_at, linked_idea_id", { count: "exact" })
        .order("engagement_score", { ascending: false })
        .limit(6);
      if (data && data.length > 0) {
        // Fetch linked idea titles for signals that have a linked_idea_id
        const linkedIds = data.filter((s) => s.linked_idea_id).map((s) => s.linked_idea_id!);
        let ideaTitles: Record<string, string> = {};
        if (linkedIds.length > 0) {
          const { data: ideas } = await supabase
            .from("ideas")
            .select("id, title")
            .in("id", linkedIds);
          if (ideas) {
            ideaTitles = Object.fromEntries(ideas.map((i) => [i.id, i.title]));
          }
        }
        setSignals(data.map((s) => ({
          ...s,
          linked_idea_title: s.linked_idea_id ? ideaTitles[s.linked_idea_id] || null : null,
        })));
      }
      if (count != null) setTotalCount(count);
    };
    fetchSignals();

    // Realtime: refresh when signals change (insert, update, delete)
    const channel = supabase
      .channel("landing-signals")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "pain_signals" },
        () => { fetchSignals(); }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "pain_signals" },
        () => { fetchSignals(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (signals.length === 0) return null;

  // Show first 3 fully, rest blurred
  const visibleCount = 3;

  return (
    <section className="container mx-auto px-4 py-10 sm:py-20 ambient-glow">
      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        {/* Header */}
        <div className="text-center mb-5 sm:mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-3 glass-badge" style={{ borderColor: "rgba(239,68,68,0.2)" }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="font-body text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#F87171" }}>Live</span>
          </div>
          <h2 className="font-heading text-lg sm:text-2xl font-bold tracking-[-0.02em] mb-1" style={{ color: "var(--text-primary)" }}>
            People Are Frustrated Right Now
          </h2>
          <p className="font-body text-xs sm:text-sm" style={{ color: "var(--text-tertiary)" }}>
            Real complaints scraped from Reddit, HN, Product Hunt & more{totalCount > 0 ? ` — ${totalCount}+ signals tracked` : ""}
          </p>
        </div>

        {/* Mobile: horizontal scroll carousel / Desktop: grid */}
        <div className="relative max-w-5xl mx-auto mb-6">
          <div className="sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
            <div className="flex sm:contents gap-3 overflow-x-auto pb-3 sm:pb-0 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              {signals.slice(0, Math.min(signals.length, visibleCount + 4)).map((s, i) => {
                const color = sentimentColors[s.sentiment || "neutral"] || sentimentColors.neutral;
                const relTime = getRelativeTime(s.created_at);
                const isBlurred = i >= visibleCount;
                return (
                  <div key={s.id} className="relative block shrink-0 w-[260px] sm:w-auto snap-start">
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.1 }}
                      transition={{ delay: i * 0.06, duration: 0.3 }}
                      className={`glass-card rounded-xl p-3.5 sm:p-5 h-full ${isBlurred ? "select-none" : "cursor-pointer hover:scale-[1.02]"}`}
                      style={{ borderLeft: `3px solid ${color}`, filter: isBlurred ? "blur(6px)" : "none", opacity: isBlurred ? 0.5 : 1 }}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="font-body text-[11px] font-medium capitalize" style={{ color }}>{s.sentiment}</span>
                        <div className="flex items-center gap-2">
                          {relTime && (
                            <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>{relTime}</span>
                          )}
                          <span className="font-body text-[11px]" style={{ color: "#FF8400" }}>
                            {s.subreddit ? `r/${s.subreddit}` : s.source_platform === "hackernews" ? "HN" : s.source_platform}
                          </span>
                        </div>
                      </div>
                      <p className="font-body text-sm italic leading-relaxed mb-2.5 line-clamp-3" style={{ color: "var(--text-secondary)" }}>
                        "{s.body || s.title}"
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 font-body text-[11px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(255,255,255,0.04)" }}
                          >
                            <ArrowUp className="w-3 h-3" strokeWidth={1.5} /> {s.upvotes}
                          </span>
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(255,255,255,0.04)" }}
                          >
                            <MessageSquare className="w-3 h-3" strokeWidth={1.5} /> {s.comments}
                          </span>
                        </div>
                        {s.linked_idea_id && s.linked_idea_title && (
                          <span className="font-body text-[11px] truncate max-w-[140px]" style={{ color: "#8B5CF6" }}>
                            💡 {s.linked_idea_title}
                          </span>
                        )}
                      </div>
                    </motion.div>
                    {/* Overlay on blurred cards */}
                    {isBlurred && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10">
                        <Link
                          to="/auth"
                          className="flex items-center gap-1.5 font-body text-[11px] font-medium px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                          style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#A78BFA" }}
                        >
                          <Lock className="w-3 h-3" strokeWidth={1.5} /> Sign up to see more
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
            Sign up free to see all {totalCount} signals <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        </div>
      </motion.div>
    </section>
  );
};

export default LiveSignalsPreview;
