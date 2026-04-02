import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { PLATFORM_STATS } from "@/lib/config";

/**
 * Floor values derived from the single source of truth in config.ts.
 * They only increase when real DB counts exceed them.
 */
const BASE_STATS = {
  ideas: PLATFORM_STATS.problemsFound,
  validations: PLATFORM_STATS.problemsValidated,
  builders: PLATFORM_STATS.buildersActive,
};

const AnimatedCounter = ({ end, label, suffix = "" }: { end: number; label: string; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!inView || end <= 0) return;
    let start = 0;
    const duration = 1800;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [inView, end]);

  return (
    <div ref={ref} className="text-center px-4 sm:px-6">
      <div className="font-mono text-xl sm:text-3xl font-bold tabular-nums" style={{
        color: "var(--text-primary)",
      }}>
        {count > 0 ? `${count.toLocaleString()}${suffix}` : "\u2014"}
      </div>
      <p className="font-body text-[9px] sm:text-xs uppercase tracking-[0.08em] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </p>
    </div>
  );
};

const SocialProofBar = () => {
  const [stats, setStats] = useState(BASE_STATS);

  useEffect(() => {
    const fetchStats = async () => {
      // Only query "ideas" — it has a public SELECT policy.
      // "users" and "validation_results" require auth (RLS) and cause 401 for anon visitors.
      const ideasRes = await supabase.from("ideas").select("id", { count: "exact", head: true });

      setStats({
        ideas: Math.max(BASE_STATS.ideas, ideasRes.count ?? 0),
        validations: BASE_STATS.validations,
        builders: BASE_STATS.builders,
      });
    };
    fetchStats();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="flex items-center justify-center py-3 sm:py-5"
    >
      <div className="flex items-center divide-x glass-badge rounded-full px-6 py-2" style={{ borderColor: "var(--border-visible)" }}>
        <AnimatedCounter end={stats.ideas} label="Problems Found" suffix="+" />
        <AnimatedCounter end={stats.validations} label="Problems Validated" suffix="+" />
        <AnimatedCounter end={stats.builders} label="Builders Active" suffix="+" />
      </div>
    </motion.div>
  );
};

export default SocialProofBar;
