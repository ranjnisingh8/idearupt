import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Lock,
  Zap,
  TrendingUp,
  Target,
  Radar,
  Brain,
  Shield,
  FileText,
  Bell,
  Users,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  Flame,
  Star,
  Eye,
} from "lucide-react";
import { motion, LazyMotion, domAnimation, AnimatePresence, useInView } from "framer-motion";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Spotlight from "@/components/Spotlight";
import { trackEvent, EVENTS } from "@/lib/analytics";
import FAQSection from "@/components/landing/FAQSection";
import StickyMobileCTA from "@/components/landing/StickyMobileCTA";
import ExitIntentPopup from "@/components/landing/ExitIntentPopup";
import { supabase } from "@/lib/supabase";
import { PLATFORM_STATS } from "@/lib/config";

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */
interface TopIdea {
  id: string;
  title: string;
  category: string;
  overall_score: number;
  one_liner: string;
  estimated_mrr_range?: string;
  build_difficulty?: number;
  save_count?: number;
  distinct_posters?: number;
  distinct_communities?: number;
  recurrence_weeks?: number;
  pain_type?: "paid" | "vocal" | "latent";
  tags?: string[];
  scores?: {
    pain_score: number;
    trend_score: number;
    competition_score: number;
    revenue_potential: number;
    build_difficulty: number;
  };
  wtp_quotes?: { quote: string; source: string; url?: string; upvotes?: number }[];
}

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
}

interface NicheIdea {
  id: string;
  title: string;
  category: string;
  overall_score: number;
  one_liner: string;
}

/* ═══════════════════════════════════════════════════════════
   Utility Functions
   ═══════════════════════════════════════════════════════════ */
const getScoreColor = (s: number) =>
  s >= 8 ? "#10B981" : s >= 6 ? "#06B6D4" : "#F59E0B";

const getPainTypeStyle = (pt: string | undefined) => {
  switch (pt) {
    case "paid":
      return { label: "Paid Pain", color: "#34D399", bg: "rgba(16,185,129,0.1)" };
    case "latent":
      return { label: "Latent Pain", color: "#9CA3AF", bg: "rgba(156,163,175,0.1)" };
    default:
      return { label: "Vocal Pain", color: "#FB923C", bg: "rgba(249,115,22,0.1)" };
  }
};

const getDifficultyLabel = (d: number | undefined) => {
  if (!d) return null;
  if (d <= 3) return { label: "Beginner", color: "#34D399", bg: "rgba(16,185,129,0.1)" };
  if (d <= 6) return { label: "Intermediate", color: "#FBBF24", bg: "rgba(245,158,11,0.1)" };
  return { label: "Advanced", color: "#F87171", bg: "rgba(239,68,68,0.1)" };
};

const sentimentColors: Record<string, string> = {
  frustrated: "#F59E0B",
  angry: "#EF4444",
  desperate: "#A855F7",
  hopeful: "#10B981",
  neutral: "#6B7280",
};

// Daily-rotating odd floor values — feels fresh each day
const getDailyFloors = () => {
  const today = new Date().toISOString().substring(0, 10);
  const seed = today.split("").reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0);
  const ensureOdd = (n: number) => (n % 2 === 0 ? n - 1 : n);
  return {
    ideas: ensureOdd(PLATFORM_STATS.problemsFound + Math.abs(seed % 151)),
    builders: ensureOdd(PLATFORM_STATS.buildersActive + Math.abs((seed * 13) % 81)),
  };
};

/* ═══════════════════════════════════════════════════════════
   Animated Counter — count-up on scroll into view
   ═══════════════════════════════════════════════════════════ */
const AnimatedCounter = ({
  end,
  suffix = "",
  duration = 1800,
}: {
  end: number;
  suffix?: string;
  duration?: number;
}) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref as any, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!inView || end <= 0) return;
    const startTime = performance.now();
    const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      setCount(Math.round(easeOutExpo(progress) * end));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [inView, end, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {count > 0 ? `${count.toLocaleString()}${suffix}` : "—"}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════
   Mini Score Bar (used in Hero card)
   ═══════════════════════════════════════════════════════════ */
const MiniScoreBar = ({
  label,
  value,
  color,
  delay = 0,
}: {
  label: string;
  value: number;
  color: string;
  delay?: number;
}) => (
  <div className="flex items-center gap-2">
    <span className="font-body text-[10px] w-14 text-right" style={{ color: "var(--text-tertiary)" }}>
      {label}
    </span>
    <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${(value / 10) * 100}%` }}
        transition={{ duration: 0.8, ease: "easeOut", delay }}
      />
    </div>
    <span className="font-heading text-[11px] font-bold tabular-nums w-6" style={{ color }}>
      {value.toFixed(1)}
    </span>
  </div>
);

/* ═══════════════════════════════════════════════════════════
   Niche categories for the interactive picker
   ═══════════════════════════════════════════════════════════ */
const NICHE_OPTIONS = [
  { value: "SaaS", label: "SaaS Tools", icon: "🛠️" },
  { value: "AI", label: "AI / ML", icon: "🤖" },
  { value: "Developer Tools", label: "Dev Tools", icon: "⚙️" },
  { value: "E-Commerce", label: "E-Commerce", icon: "🛒" },
  { value: "Health", label: "Health & Fitness", icon: "💪" },
  { value: "Education", label: "Education", icon: "📚" },
  { value: "Finance", label: "Finance", icon: "💰" },
  { value: "Productivity", label: "Productivity", icon: "📊" },
];

/* ═══════════════════════════════════════════════════════════
   LANDING PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */
const Landing = () => {
  const dailyFloors = useMemo(() => getDailyFloors(), []);
  const [totalIdeas, setTotalIdeas] = useState(dailyFloors.ideas);
  const [realUserCount, setRealUserCount] = useState(dailyFloors.builders);
  const [topIdeas, setTopIdeas] = useState<TopIdea[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalCount, setSignalCount] = useState(0);
  const [heroIdea, setHeroIdea] = useState<TopIdea | null>(null);
  const [ideasLoaded, setIdeasLoaded] = useState(false);

  // Niche picker state
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [nicheIdeas, setNicheIdeas] = useState<NicheIdea[]>([]);
  const [nicheLoading, setNicheLoading] = useState(false);

  /* ── Batch fetch all homepage data ── */
  useEffect(() => {
    const fetchAll = async () => {
      const ensureOdd = (n: number) => (n % 2 === 0 ? n + 1 : n);

      // 1. Total idea count
      const { count: totalC } = await supabase
        .from("ideas")
        .select("id", { count: "exact", head: true });
      if (totalC != null) setTotalIdeas(ensureOdd(Math.max(dailyFloors.ideas, totalC)));

      // 2. Real user count
      const { count: userC } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true });
      if (userC != null) setRealUserCount(ensureOdd(Math.max(dailyFloors.builders, userC)));

      // 3. Top ideas (20 fetched, 6 shown — daily rotation)
      const { data: fullData } = await supabase
        .from("ideas")
        .select(
          "id, title, category, overall_score, one_liner, estimated_mrr_range, build_difficulty, save_count, distinct_posters, distinct_communities, recurrence_weeks, pain_type, tags, scores, wtp_quotes"
        )
        .order("overall_score", { ascending: false })
        .limit(20);

      if (fullData && fullData.length > 0) {
        const mapped = fullData.map((d: any) => ({
          ...d,
          tags: Array.isArray(d.tags) ? d.tags : [],
          scores: d.scores ?? {
            pain_score: 0,
            trend_score: 0,
            competition_score: 0,
            revenue_potential: 0,
            build_difficulty: d.build_difficulty ?? 0,
          },
        }));

        // Hero idea = absolute highest scorer
        setHeroIdea(mapped[0] as TopIdea);

        // Rotate which 6 of top 20 we show
        const dateSeed = new Date().toISOString().substring(0, 10);
        const seedNum = dateSeed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        const offset = seedNum % Math.max(1, mapped.length - 6);
        const rotated = [...mapped.slice(offset), ...mapped.slice(0, offset)];
        setTopIdeas(rotated.slice(0, 6) as TopIdea[]);
      }

      // 4. Pain signals (top 4)
      const { data: sigData, count: sigCount } = await supabase
        .from("pain_signals")
        .select("id, title, body, source_platform, subreddit, upvotes, comments, sentiment, created_at", {
          count: "exact",
        })
        .order("engagement_score", { ascending: false })
        .limit(4);
      if (sigData) setSignals(sigData as Signal[]);
      if (sigCount != null) setSignalCount(sigCount);

      setIdeasLoaded(true);
    };
    fetchAll();

    // Realtime updates
    const ideasChannel = supabase
      .channel("landing-ideas-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ideas" }, () => {
        setTotalIdeas((prev) => prev + 1);
      })
      .subscribe();
    const usersChannel = supabase
      .channel("landing-users-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "users" }, () => {
        setRealUserCount((prev) => prev + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ideasChannel);
      supabase.removeChannel(usersChannel);
    };
  }, []);

  /* ── Niche picker fetch ── */
  const handleNicheSelect = useCallback(async (niche: string) => {
    setSelectedNiche(niche);
    setNicheLoading(true);
    const { data } = await supabase
      .from("ideas")
      .select("id, title, category, overall_score, one_liner")
      .ilike("category", `%${niche}%`)
      .order("overall_score", { ascending: false })
      .limit(3);
    if (data) setNicheIdeas(data as NicheIdea[]);
    setNicheLoading(false);
  }, []);

  /* ═══ SECTION COMPONENTS ═══ */

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-screen overflow-x-hidden">
        {/* ══════════════════════════════════════════════════════════
            SECTION 1: Hero — Confident, Sharp, High-Impact
            ══════════════════════════════════════════════════════════ */}
        <section className="container mx-auto px-4 pt-14 sm:pt-24 pb-6 sm:pb-10 relative overflow-hidden">
          <Spotlight className="-top-40 left-0 md:left-60 md:-top-20 hidden sm:block" fill="white" />

          <div className="relative z-10 max-w-6xl mx-auto grid lg:grid-cols-[1fr,400px] gap-10 lg:gap-16 items-center">
            {/* Left: Copy */}
            <div className="text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="mb-5 flex items-center gap-2.5 justify-center lg:justify-start"
              >
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-badge text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "#34D399" }}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  {totalIdeas}+ problems · scored daily
                </span>
              </motion.div>

              <div className="mb-6">
                <motion.h1
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="font-heading text-[22px] sm:text-[48px] lg:text-[56px] leading-[1.12] sm:leading-[1.08] tracking-[-0.02em] sm:tracking-[-0.03em] mb-4 sm:mb-5 font-bold select-none"
                  style={{ color: "#EEEEF0" }}
                >
                  Stop guessing.{" "}
                  <br className="hidden sm:block" />
                  <span style={{ color: "#9585F2" }}>Build what people are already asking for.</span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.4 }}
                  className="text-[14px] sm:text-lg leading-[1.55] sm:leading-[1.6] font-body max-w-[540px] mx-auto lg:mx-0 px-1 sm:px-0"
                  style={{ color: "var(--text-secondary)" }}
                >
                  We scan 6 platforms daily and use AI to score every complaint for pain, revenue potential & competition — so you find
                  problems that are already worth building for.
                </motion.p>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
                className="flex flex-col sm:flex-row items-center lg:items-start gap-3"
              >
                <Link
                  to="/auth"
                  onClick={() => trackEvent(EVENTS.CTA_HERO_CLICK, { label: "explore_problems" })}
                  className="btn-gradient px-8 sm:px-10 py-3 sm:py-3.5 text-sm sm:text-[15px] font-semibold font-heading inline-flex items-center justify-center gap-2"
                >
                  Explore Problems Free <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </Link>
                <Link
                  to="/auth?mode=login"
                  className="btn-ghost px-6 py-3 text-sm font-heading font-medium inline-flex items-center gap-2"
                >
                  Log in
                </Link>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="font-body text-[10px] sm:text-[11px] mt-3 sm:mt-4 px-2 sm:px-0"
                style={{ color: "var(--text-tertiary)" }}
              >
                Free forever · No card required · {realUserCount}+ builders
              </motion.p>
            </div>

            {/* Right: Hero Idea Card — desktop only */}
            <div className="hidden lg:block">
              {heroIdea && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="glass-card rounded-xl p-5 relative overflow-hidden glow-neon-purple"
                  style={{ animation: "float 5s ease-in-out infinite" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="font-body text-[11px] uppercase tracking-[0.06em] font-medium px-2.5 py-1 rounded-md"
                      style={{
                        background: "rgba(139,92,246,0.1)",
                        border: "1px solid rgba(139,92,246,0.2)",
                        color: "#A78BFA",
                      }}
                    >
                      {heroIdea.category}
                    </span>
                    <div className="relative w-10 h-10">
                      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
                        <motion.circle
                          cx="20"
                          cy="20"
                          r="16"
                          fill="none"
                          stroke={getScoreColor(heroIdea.overall_score)}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 16}
                          initial={{ strokeDashoffset: 2 * Math.PI * 16 }}
                          animate={{
                            strokeDashoffset:
                              2 * Math.PI * 16 - (heroIdea.overall_score / 10) * (2 * Math.PI * 16),
                          }}
                          transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
                        />
                      </svg>
                      <span
                        className="absolute inset-0 flex items-center justify-center font-heading text-xs font-bold tabular-nums"
                        style={{ color: getScoreColor(heroIdea.overall_score) }}
                      >
                        {heroIdea.overall_score.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <h3
                    className="font-heading text-base font-semibold mb-1.5 leading-snug"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {heroIdea.title}
                  </h3>
                  <p className="text-xs line-clamp-2 mb-4" style={{ color: "var(--text-secondary)" }}>
                    {heroIdea.one_liner}
                  </p>

                  <div className="space-y-2 mb-4">
                    <MiniScoreBar
                      label="Pain"
                      value={heroIdea.scores?.pain_score ?? 0}
                      color="#F97316"
                      delay={0.6}
                    />
                    <MiniScoreBar
                      label="Trend"
                      value={heroIdea.scores?.trend_score ?? 0}
                      color="#3B82F6"
                      delay={0.7}
                    />
                    <MiniScoreBar
                      label="Revenue"
                      value={heroIdea.scores?.revenue_potential ?? 0}
                      color="#10B981"
                      delay={0.8}
                    />
                  </div>

                  {/* Pro features peek */}
                  <Link
                    to="/auth"
                    className="block rounded-lg p-3 overflow-hidden transition-all duration-200 sm:hover:scale-[1.02]"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                        📄 PDF export · 🔗 Source threads · 🎯 Pain Radar
                      </p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span
                        className="flex items-center gap-1.5 font-body text-[11px] font-medium px-3 py-1.5 rounded-lg"
                        style={{
                          background: "rgba(139,92,246,0.15)",
                          border: "1px solid rgba(139,92,246,0.3)",
                          color: "#A78BFA",
                        }}
                      >
                        Sign up to explore
                      </span>
                    </div>
                  </Link>

                  {/* Annotation */}
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.2, duration: 0.4 }}
                    className="absolute -right-2 font-body text-[10px] px-2 py-1 rounded-md whitespace-nowrap"
                    style={{
                      background: "rgba(249,115,22,0.12)",
                      border: "1px solid rgba(249,115,22,0.25)",
                      color: "#F97316",
                      top: "calc(52% + 4px)",
                    }}
                  >
                    ← Real pain score
                  </motion.div>
                </motion.div>
              )}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 2: Social Proof Counter Bar
            ══════════════════════════════════════════════════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="container mx-auto px-4 py-4 sm:py-6"
        >
          <div className="flex items-center justify-center px-2">
            <div
              className="grid grid-cols-3 w-full max-w-sm sm:max-w-none sm:w-auto sm:inline-flex sm:items-center sm:divide-x rounded-2xl sm:rounded-full px-2 sm:px-8 py-2.5 sm:py-3 glass-badge"
              style={{ borderColor: "var(--border-visible)" }}
            >
              <div className="text-center px-1 sm:px-6">
                <div className="font-mono text-base sm:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                  <AnimatedCounter end={totalIdeas} suffix="+" />
                </div>
                <p
                  className="font-body text-[8px] sm:text-xs uppercase tracking-[0.06em] sm:tracking-[0.08em] mt-0.5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Problems Found
                </p>
              </div>
              <div className="text-center px-1 sm:px-6 border-x sm:border-x-0 sm:border-l" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="font-mono text-base sm:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                  <AnimatedCounter end={6} suffix="" />
                </div>
                <p
                  className="font-body text-[8px] sm:text-xs uppercase tracking-[0.06em] sm:tracking-[0.08em] mt-0.5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Platforms Scanned
                </p>
              </div>
              <div className="text-center px-1 sm:px-6">
                <div className="font-mono text-base sm:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                  <AnimatedCounter end={realUserCount} suffix="+" />
                </div>
                <p
                  className="font-body text-[8px] sm:text-xs uppercase tracking-[0.06em] sm:tracking-[0.08em] mt-0.5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Builders Active
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        <hr className="section-divider-glass max-w-4xl mx-auto" />

        {/* ══════════════════════════════════════════════════════════
            SECTION 3: Live Product Preview — Trending Ideas
            ══════════════════════════════════════════════════════════ */}
        <section className="container mx-auto px-4 py-8 sm:py-14 ambient-glow">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-6"
          >
            <p
              className="section-label mb-2"
            >
              🔥 HIGHEST RATED PROBLEMS
            </p>
            <h2
              className="font-heading text-lg sm:text-3xl font-bold tracking-[-0.02em] mb-2 px-2 sm:px-0"
              style={{ color: "var(--text-primary)" }}
            >
              Real problems people are{" "}
              <br className="sm:hidden" />
              <span style={{ color: "#9585F2" }}>complaining about right now</span>
            </h2>
            <p className="font-body text-sm max-w-lg mx-auto" style={{ color: "var(--text-tertiary)" }}>
              Every idea is backed by real posts from Reddit, Hacker News, Product Hunt & more.
            </p>
          </motion.div>

          {/* Idea cards grid */}
          <div className="sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4 max-w-5xl mx-auto overflow-hidden sm:overflow-visible">
            <div className="flex sm:contents gap-3 overflow-x-auto pb-3 sm:pb-0 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              {topIdeas.length > 0
                ? topIdeas.map((idea, i) => {
                    const scoreColor = getScoreColor(idea.overall_score);
                    const painType = getPainTypeStyle(idea.pain_type);
                    const diff = getDifficultyLabel(idea.build_difficulty);
                    const hasProof =
                      (idea.distinct_posters ?? 0) > 0 || (idea.distinct_communities ?? 0) > 0;
                    const isBlurred = i >= 4;
                    const isTopPick = i === 0;

                    return (
                      <div key={idea.id} className="relative block shrink-0 w-[280px] sm:w-auto snap-start">
                        <Link to="/auth" className="block h-full">
                          <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.1 }}
                            transition={{ delay: 0.1 + i * 0.06, duration: 0.35 }}
                            className={`group relative glass-card rounded-xl p-3.5 sm:p-5 h-full ${
                              isBlurred ? "select-none" : "sm:hover:scale-[1.02] cursor-pointer"
                            } ${isTopPick ? "glow-neon-purple" : ""}`}
                            style={{
                              border: isTopPick ? "1px solid rgba(124,106,237,0.4)" : undefined,
                              filter: isBlurred ? "blur(6px)" : "none",
                              opacity: isBlurred ? 0.5 : 1,
                            }}
                          >
                            {isTopPick && (
                              <div
                                className="absolute -top-2 -right-2 font-body text-[9px] font-bold px-2 py-0.5 rounded-full z-10"
                                style={{
                                  background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
                                  color: "#fff",
                                }}
                              >
                                🏆 Top Pick
                              </div>
                            )}

                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1">
                                <span
                                  className="font-body"
                                  style={{
                                    color: "var(--text-tertiary)",
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    textTransform: "uppercase" as const,
                                    letterSpacing: "0.08em",
                                  }}
                                >
                                  {idea.category}
                                </span>
                                <span
                                  className="font-body"
                                  style={{
                                    color: painType.color,
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    textTransform: "uppercase" as const,
                                    letterSpacing: "0.08em",
                                  }}
                                >
                                  {painType.label}
                                </span>
                              </div>
                              <span
                                className="inline-flex items-center gap-1 font-heading text-xs font-bold tabular-nums px-2 py-0.5 rounded-md"
                                style={{
                                  background: `${scoreColor}15`,
                                  border: `1px solid ${scoreColor}30`,
                                  color: scoreColor,
                                }}
                              >
                                <BarChart3 className="w-3 h-3" strokeWidth={2} />
                                {idea.overall_score.toFixed(1)}
                              </span>
                            </div>

                            <h3
                              className="font-heading text-sm sm:text-[15px] font-semibold leading-snug mb-1.5 line-clamp-2"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {idea.title}
                            </h3>
                            <p
                              className="font-body text-xs leading-relaxed line-clamp-2 mb-2"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {idea.one_liner}
                            </p>

                            <p className="font-body text-[12px] mb-2.5" style={{ color: "#9CA3AF" }}>
                              {hasProof ? (
                                <>
                                  📊 {idea.distinct_posters} people
                                  {(idea.distinct_communities ?? 0) > 0 && (
                                    <> · {idea.distinct_communities} communities</>
                                  )}
                                </>
                              ) : (
                                <>📊 10+ complaints tracked</>
                              )}
                            </p>

                            <div className="flex items-center gap-1.5 flex-wrap mb-3">
                              {idea.estimated_mrr_range && (
                                <span
                                  className="font-body text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                                  style={{
                                    background: "rgba(16,185,129,0.08)",
                                    border: "1px solid rgba(16,185,129,0.2)",
                                    color: "#34D399",
                                  }}
                                >
                                  💰 {idea.estimated_mrr_range}
                                </span>
                              )}
                              {diff && (
                                <span
                                  className="font-body text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                                  style={{ background: diff.bg, color: diff.color }}
                                >
                                  {diff.label}
                                </span>
                              )}
                            </div>

                            <span
                              className="inline-flex items-center gap-1 font-heading text-[11px] font-semibold"
                              style={{ color: "#9585F2" }}
                            >
                              {isBlurred ? "Sign up to unlock" : "See full analysis →"}
                            </span>
                          </motion.div>
                        </Link>
                        {isBlurred && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10">
                            <Link
                              to="/auth"
                              className="flex items-center gap-1.5 font-body text-[11px] font-medium px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                              style={{
                                background: "rgba(124,106,237,0.15)",
                                border: "1px solid rgba(124,106,237,0.3)",
                                color: "#9585F2",
                              }}
                            >
                              <Lock className="w-3 h-3" strokeWidth={1.5} /> Sign up to unlock
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })
                : !ideasLoaded
                  ? [...Array(3)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.25 + i * 0.1 }}
                        className="rounded-xl p-3.5 sm:p-5 animate-pulse shrink-0 w-[280px] sm:w-auto snap-start glass-card"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="h-4 w-16 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
                          <div className="h-4 w-10 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
                        </div>
                        <div className="h-4 w-3/4 rounded mb-2" style={{ background: "rgba(255,255,255,0.06)" }} />
                        <div className="h-3 w-full rounded mb-1" style={{ background: "rgba(255,255,255,0.04)" }} />
                        <div className="h-3 w-2/3 rounded mb-3" style={{ background: "rgba(255,255,255,0.04)" }} />
                        <div className="h-3 w-32 rounded" style={{ background: "rgba(124,106,237,0.08)" }} />
                      </motion.div>
                    ))
                  : null}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center mt-5"
          >
            <Link
              to="/auth"
              onClick={() => trackEvent(EVENTS.CTA_EXPLORE_PROBLEMS, { total_ideas: totalIdeas })}
              className="inline-flex items-center gap-1.5 font-heading text-[11px] sm:text-xs font-semibold transition-colors text-center leading-relaxed"
              style={{ color: "#9585F2" }}
            >
              <span className="hidden sm:inline">🔓 Sign up free to see all {totalIdeas}+ problems with proof data, competitor analysis & blueprints</span>
              <span className="sm:hidden">🔓 Sign up to see all {totalIdeas}+ problems</span>
              <ArrowRight className="w-3 h-3" strokeWidth={2} />
            </Link>
          </motion.div>
        </section>

        <hr className="section-divider-glass max-w-4xl mx-auto" />

        {/* ══════════════════════════════════════════════════════════
            SECTION 4: Pain Signals — Live Complaints
            ══════════════════════════════════════════════════════════ */}
        {signals.length > 0 && (
          <section className="container mx-auto px-4 py-10 sm:py-16 ambient-glow">
            <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <div className="text-center mb-6">
                <div
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-3 glass-badge"
                  style={{ borderColor: "rgba(239,68,68,0.2)" }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span className="font-body text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#F87171" }}>
                    Live
                  </span>
                </div>
                <h2
                  className="font-heading text-lg sm:text-2xl font-bold tracking-[-0.02em] mb-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  People Are Frustrated <span style={{ color: "#F87171" }}>Right Now</span>
                </h2>
                <p className="font-body text-xs sm:text-sm" style={{ color: "var(--text-tertiary)" }}>
                  Real complaints from Reddit, HN & more{signalCount > 0 ? ` — ${signalCount}+ tracked` : ""}
                </p>
              </div>

              <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
                {signals.slice(0, 4).map((s, i) => {
                  const color = sentimentColors[s.sentiment || "neutral"] || sentimentColors.neutral;
                  const isBlurred = i >= 2;
                  return (
                    <div key={s.id} className="relative">
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.06 }}
                        className={`glass-card rounded-xl p-4 ${isBlurred ? "select-none" : ""}`}
                        style={{
                          borderLeft: `3px solid ${color}`,
                          filter: isBlurred ? "blur(6px)" : "none",
                          opacity: isBlurred ? 0.5 : 1,
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-body text-[11px] font-medium capitalize" style={{ color }}>
                            {s.sentiment}
                          </span>
                          <span className="font-body text-[11px]" style={{ color: "#FF8400" }}>
                            {s.subreddit ? `r/${s.subreddit}` : s.source_platform}
                          </span>
                        </div>
                        <p
                          className="font-body text-sm italic leading-relaxed line-clamp-3"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          &ldquo;{s.body || s.title}&rdquo;
                        </p>
                        <div className="flex items-center gap-3 mt-2 font-body text-[11px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                          <span className="inline-flex items-center gap-0.5">↑ {s.upvotes}</span>
                          <span className="inline-flex items-center gap-0.5">💬 {s.comments}</span>
                        </div>
                      </motion.div>
                      {isBlurred && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10">
                          <Link
                            to="/auth"
                            className="flex items-center gap-1.5 font-body text-[11px] font-medium px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                            style={{
                              background: "rgba(139,92,246,0.15)",
                              border: "1px solid rgba(139,92,246,0.3)",
                              color: "#A78BFA",
                            }}
                          >
                            <Lock className="w-3 h-3" strokeWidth={1.5} /> Sign up to see more
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="text-center">
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 font-heading text-sm font-semibold transition-colors"
                  style={{ color: "#A78BFA" }}
                >
                  <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
                  See all {signalCount}+ signals <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </Link>
              </div>
            </motion.div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════
            SECTION 5: Mid-Page CTA — "You just saw the surface"
            ══════════════════════════════════════════════════════════ */}
        <section className="container mx-auto px-4 py-6 sm:py-10">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-xl mx-auto text-center glass-card rounded-2xl p-6 sm:p-8"
          >
            <p
              className="font-heading text-base sm:text-xl font-bold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              You just saw{" "}
              <span style={{ color: "#9585F2" }}>the surface.</span>
            </p>
            <p className="font-body text-sm mb-5" style={{ color: "var(--text-tertiary)" }}>
              {totalIdeas}+ problems with competitor intel, revenue estimates, and build blueprints inside.
            </p>
            <Link
              to="/auth"
              onClick={() => trackEvent(EVENTS.CTA_MID_PAGE, { total_ideas: totalIdeas })}
              className="btn-gradient px-8 py-3 text-sm font-heading font-semibold inline-flex items-center gap-2"
            >
              See All Problems <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
          </motion.div>
        </section>

        <hr className="section-divider-glass max-w-4xl mx-auto" />

        {/* ══════════════════════════════════════════════════════════
            SECTION 6: Interactive Niche Picker
            ══════════════════════════════════════════════════════════ */}
        <section className="container mx-auto px-4 py-10 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-6"
          >
            <p className="section-label mb-2">YOUR NICHE</p>
            <h2
              className="font-heading text-lg sm:text-3xl font-bold tracking-[-0.02em] mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Pick your niche.{" "}
              <br className="sm:hidden" />
              <span style={{ color: "#9585F2" }}>See matching problems instantly.</span>
            </h2>
            <p className="font-body text-sm max-w-md mx-auto" style={{ color: "var(--text-tertiary)" }}>
              Every builder has a superpower. What&apos;s yours?
            </p>
          </motion.div>

          {/* Niche pills */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 max-w-3xl mx-auto mb-6">
            {NICHE_OPTIONS.map((niche) => (
              <motion.button
                key={niche.value}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleNicheSelect(niche.value)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 min-h-[44px] ${
                  selectedNiche === niche.value
                    ? "border-[#7C6AED]"
                    : "border-transparent hover:border-[rgba(124,106,237,0.2)]"
                }`}
                style={{
                  background:
                    selectedNiche === niche.value
                      ? "linear-gradient(135deg, rgba(124,106,237,0.15), rgba(6,182,212,0.08))"
                      : "var(--bg-surface)",
                  border: `1px solid ${
                    selectedNiche === niche.value ? "rgba(124,106,237,0.4)" : "var(--border-subtle)"
                  }`,
                  color:
                    selectedNiche === niche.value ? "#A78BFA" : "var(--text-secondary)",
                }}
              >
                <span>{niche.icon}</span>
                {niche.label}
              </motion.button>
            ))}
          </div>

          {/* Niche results */}
          <AnimatePresence mode="wait">
            {selectedNiche && (
              <motion.div
                key={selectedNiche}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="max-w-3xl mx-auto"
              >
                {nicheLoading ? (
                  <div className="grid sm:grid-cols-3 gap-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="glass-card rounded-xl p-4 animate-pulse">
                        <div className="h-4 w-20 rounded mb-2" style={{ background: "rgba(255,255,255,0.06)" }} />
                        <div className="h-3 w-full rounded mb-1" style={{ background: "rgba(255,255,255,0.04)" }} />
                        <div className="h-3 w-2/3 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
                      </div>
                    ))}
                  </div>
                ) : nicheIdeas.length > 0 ? (
                  <div className="grid sm:grid-cols-3 gap-3">
                    {nicheIdeas.map((idea, i) => (
                      <Link key={idea.id} to="/auth">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.08 }}
                          className="glass-card rounded-xl p-4 sm:hover:scale-[1.02] cursor-pointer transition-transform h-full"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-body text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--text-tertiary)" }}>
                              {idea.category}
                            </span>
                            <span
                              className="font-heading text-xs font-bold tabular-nums px-2 py-0.5 rounded-md"
                              style={{
                                background: `${getScoreColor(idea.overall_score)}15`,
                                color: getScoreColor(idea.overall_score),
                              }}
                            >
                              {idea.overall_score.toFixed(1)}
                            </span>
                          </div>
                          <h3
                            className="font-heading text-sm font-semibold mb-1 line-clamp-2"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {idea.title}
                          </h3>
                          <p className="font-body text-xs line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                            {idea.one_liner}
                          </p>
                        </motion.div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center glass-card rounded-xl p-6">
                    <p className="font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
                      No exact matches yet — but we add problems daily. Sign up and we&apos;ll alert you.
                    </p>
                  </div>
                )}

                <div className="text-center mt-4">
                  <Link
                    to="/auth"
                    className="inline-flex items-center gap-1.5 font-heading text-xs font-semibold"
                    style={{ color: "#9585F2" }}
                  >
                    See all {selectedNiche} problems <ArrowRight className="w-3 h-3" strokeWidth={2} />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <hr className="section-divider-glass max-w-4xl mx-auto" />

        {/* ══════════════════════════════════════════════════════════
            SECTION 7: How It Works — 3 Steps
            ══════════════════════════════════════════════════════════ */}
        <section id="how-it-works" className="container mx-auto px-4 py-12 sm:py-20">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center font-body text-xs uppercase tracking-[0.15em] font-medium mb-4"
            style={{ color: "var(--accent-purple)" }}
          >
            How it works
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-heading text-[22px] sm:text-[36px] font-bold text-center mb-6 sm:mb-12 tracking-[-0.02em] sm:tracking-[-0.03em] px-2 sm:px-0"
            style={{ color: "var(--text-primary)" }}
          >
            From complaint to{" "}
            <span style={{ color: "#9585F2" }}>startup in 3 steps</span>
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto relative">
            <div
              className="hidden md:block absolute top-[52px] left-[20%] right-[20%] h-px"
              style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.2), rgba(6,182,212,0.2))" }}
            />
            {[
              {
                num: "01",
                icon: Radar,
                title: "We scan thousands of posts daily",
                desc: "Reddit, Hacker News, Product Hunt, Indie Hackers, Stack Overflow & GitHub — our AI reads thousands of posts looking for real complaints.",
              },
              {
                num: "02",
                icon: Brain,
                title: "AI scores every problem",
                desc: "Each problem gets scored across pain, trend, competition, revenue & build difficulty. Plus competitors with their pricing exposed.",
              },
              {
                num: "03",
                icon: Target,
                title: "You get a build plan",
                desc: "Not just a problem — a full 90-day roadmap matched to your skills, budget, and hours. Like having a co-founder on speed dial.",
              },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
                className="relative glass-card rounded-xl p-4 sm:p-8 text-center"
              >
                <div
                  className="w-11 h-11 mx-auto mb-5 rounded-full flex items-center justify-center relative z-10 p-[1px]"
                  style={{
                    background: "linear-gradient(135deg, #8B5CF6, #06B6D4)",
                    boxShadow: "0 0 16px rgba(124, 106, 237, 0.2)",
                  }}
                >
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(180deg, rgba(26, 27, 36, 0.95), var(--bg-surface))" }}
                  >
                    <span className="font-heading text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                      {step.num}
                    </span>
                  </div>
                </div>
                <h3
                  className="font-heading text-base sm:text-lg font-semibold mb-2 sm:mb-2.5 tracking-[-0.01em]"
                  style={{ color: "var(--text-primary)" }}
                >
                  {step.title}
                </h3>
                <p className="text-[13px] sm:text-sm leading-relaxed font-body" style={{ color: "var(--text-secondary)" }}>
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 8: Feature Toolkit
            ══════════════════════════════════════════════════════════ */}
        <section className="container mx-auto px-4 py-10 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-6"
          >
            <p className="section-label mb-3">WHAT YOU GET</p>
            <h2
              className="font-heading text-xl sm:text-3xl font-bold tracking-[-0.02em] sm:tracking-[-0.03em]"
              style={{ color: "var(--text-primary)" }}
            >
              The full{" "}
              <span style={{ color: "#9585F2" }}>builder toolkit</span>
            </h2>
          </motion.div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 max-w-4xl mx-auto">
            {[
              { icon: BarChart3, title: "AI Pain Scores", desc: "Pain, trend, competition & revenue — scored 0-10 from real data." },
              { icon: Brain, title: "Builder DNA Match", desc: "Problems matched to your skills, budget & risk tolerance." },
              { icon: FileText, title: "90-Day Build Plans", desc: "Roadmaps with tech stack, costs & launch strategy." },
              { icon: Shield, title: "Competitor Intel", desc: "Pricing, revenue & weaknesses — analyzed for every idea." },
              { icon: Radar, title: "Pain Radar", desc: "Live feed of complaints filtered by your niche — scored and ready." },
              { icon: Bell, title: "Sniper Alerts", desc: "Get emailed when new problems match your criteria." },
              { icon: Zap, title: "Validate Your Idea", desc: "Paste your idea — get scores & a build plan in seconds." },
              { icon: TrendingUp, title: "Live Signals", desc: "Real-time frustrated users from Reddit, HN & more." },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
                className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-4 rounded-xl glass-card"
              >
                <f.icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5" style={{ color: "#9585F2" }} strokeWidth={1.5} />
                <div className="min-w-0">
                  <h4 className="font-heading text-[11px] sm:text-sm font-semibold mb-0.5 leading-tight" style={{ color: "var(--text-primary)" }}>
                    {f.title}
                  </h4>
                  <p className="font-body text-[10px] sm:text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                    {f.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <hr className="section-divider-glass max-w-4xl mx-auto" />

        {/* ══════════════════════════════════════════════════════════
            SECTION 9: Pricing Anchor
            ══════════════════════════════════════════════════════════ */}
        <section className="container mx-auto px-4 py-10 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-6"
          >
            <p className="section-label mb-2">PRICING</p>
            <h2
              className="font-heading text-lg sm:text-3xl font-bold tracking-[-0.02em] mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Start free.{" "}
              <span style={{ color: "#9585F2" }}>Upgrade when you&apos;re hooked.</span>
            </h2>
          </motion.div>

          <div className="max-w-2xl mx-auto grid sm:grid-cols-2 gap-4">
            {/* Free */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="glass-card rounded-xl p-5 sm:p-6"
            >
              <p className="font-heading text-sm font-bold mb-1" style={{ color: "var(--text-tertiary)" }}>
                Free
              </p>
              <p className="font-heading text-3xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                $0<span className="text-base font-normal" style={{ color: "var(--text-tertiary)" }}>/mo</span>
              </p>
              <ul className="space-y-2 mb-4">
                {[
                  "3 ideas, 3 signals, 3 use cases/day",
                  "AI pain scores on every idea",
                  "1 blueprint & 1 validation/day",
                  "Competitor details blurred",
                  "Revenue projections blurred",
                  "PDF reports locked",
                ].map((f) => {
                  const isLocked = f.includes("blurred") || f.includes("locked");
                  return (
                    <li key={f} className="flex items-center gap-2 font-body text-[13px] sm:text-sm" style={{ color: isLocked ? "var(--text-tertiary)" : "var(--text-secondary)" }}>
                      {isLocked ? (
                        <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: "#34D399" }} strokeWidth={1.5} />
                      )}
                      {f}
                    </li>
                  );
                })}
              </ul>
              <Link to="/auth" className="block w-full text-center btn-ghost px-4 py-2.5 text-sm font-heading font-semibold">
                Get Started Free
              </Link>
            </motion.div>

            {/* Pro */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.06 }}
              className="glass-card rounded-xl p-5 sm:p-6 relative overflow-hidden"
              style={{ border: "1px solid rgba(124,106,237,0.3)" }}
            >
              {/* Glow blob */}
              <div
                className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-15 pointer-events-none"
                style={{ background: "radial-gradient(circle, #7C6AED 0%, transparent 70%)" }}
              />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-heading text-sm font-bold" style={{ color: "#A78BFA" }}>
                    Pro
                  </p>
                  <span className="badge-pro">7-DAY FREE TRIAL</span>
                </div>
                <p className="font-heading text-3xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                  $19<span className="text-base font-normal" style={{ color: "var(--text-tertiary)" }}>/mo</span>
                </p>
                <ul className="space-y-2 mb-4">
                  {[
                    "8 ideas, 8 signals, 8 use cases/day",
                    "3 blueprints & 3 validations/day",
                    "Pain Radar & Sniper Alerts",
                    "Full competitor intel & revenue data",
                    "PDF exports & original source threads",
                    "Everything unlocked — nothing blurred",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2 font-body text-[13px] sm:text-sm" style={{ color: "var(--text-secondary)" }}>
                      <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/auth"
                  className="block w-full text-center btn-gradient px-4 py-2.5 text-sm font-heading font-semibold"
                >
                  Start Free Trial →
                </Link>
              </div>
            </motion.div>
          </div>

          <p className="text-center font-body text-xs mt-4" style={{ color: "var(--text-tertiary)" }}>
            <Link to="/pricing" className="underline hover:text-[var(--text-secondary)] transition-colors">
              See full pricing comparison →
            </Link>
          </p>
        </section>

        <hr className="section-divider-glass max-w-4xl mx-auto" />

        {/* ══════════════════════════════════════════════════════════
            SECTION 10: FAQ
            ══════════════════════════════════════════════════════════ */}
        <FAQSection />

        {/* ══════════════════════════════════════════════════════════
            SECTION 11: Final CTA — "Your next startup starts here"
            ══════════════════════════════════════════════════════════ */}
        <section className="container mx-auto px-4 py-8 sm:py-20 text-center relative ambient-glow">
          <div className="max-w-2xl mx-auto glass-card rounded-2xl p-5 sm:p-12 relative overflow-hidden">
            {/* Glow blobs */}
            <div
              className="absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-10 pointer-events-none"
              style={{ background: "radial-gradient(circle, #7C6AED 0%, transparent 70%)" }}
            />
            <div
              className="absolute -bottom-20 -right-20 w-48 h-48 rounded-full opacity-10 pointer-events-none"
              style={{ background: "radial-gradient(circle, #06B6D4 0%, transparent 70%)" }}
            />
            <div className="relative z-10">
              <h2
                className="font-heading text-xl sm:text-3xl md:text-[38px] font-bold mb-3 tracking-[-0.02em] leading-[1.2]"
                style={{ color: "var(--text-primary)" }}
              >
                Your next startup{" "}
                <span style={{ color: "#9585F2" }}>starts here.</span>
              </h2>
              <p className="font-body text-sm mb-6 max-w-md mx-auto" style={{ color: "var(--text-tertiary)" }}>
                {totalIdeas}+ scored problems. Competitor intel. Build blueprints. Everything you need to go from idea to revenue.
              </p>
              <Link
                to="/auth"
                onClick={() => trackEvent(EVENTS.CTA_GET_STARTED, { location: "final_cta" })}
                className="btn-gradient px-8 sm:px-10 py-3 sm:py-4 text-sm sm:text-[15px] font-heading font-semibold inline-flex items-center gap-2"
              >
                Get Started Free <ArrowRight className="w-4 h-4" strokeWidth={2} />
              </Link>
              <p className="font-body text-[11px] mt-3" style={{ color: "var(--text-tertiary)" }}>
                Free forever plan available · Pro trial unlocks everything
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 12: Footer
            ══════════════════════════════════════════════════════════ */}
        <footer style={{ borderTop: "1px solid var(--border-subtle)" }} className="py-8 sm:py-10 pb-20 sm:pb-10">
          <div
            className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 text-[11px] sm:text-xs font-body"
            style={{ color: "var(--text-tertiary)" }}
          >
            <span className="font-heading font-semibold tracking-tight text-sm" style={{ color: "var(--text-secondary)" }}>
              Idearupt
            </span>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
              <Link to="/pricing" className="hover:text-[var(--text-secondary)] transition-colors">
                Pricing
              </Link>
              <Link to="/changelog" className="hover:text-[var(--text-secondary)] transition-colors">
                Changelog
              </Link>
              <Link to="/privacy" className="hover:text-[var(--text-secondary)] transition-colors">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-[var(--text-secondary)] transition-colors">
                Terms
              </Link>
              <Link to="/refund" className="hover:text-[var(--text-secondary)] transition-colors">
                Refund
              </Link>
              <a
                href="https://x.com/idearupt"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--text-secondary)] transition-colors"
              >
                Twitter
              </a>
              <a href="mailto:hello@idearupt.ai" className="hover:text-[var(--text-secondary)] transition-colors">
                hello@idearupt.ai
              </a>
            </div>
            <span>&copy; {new Date().getFullYear()} Idearupt. All rights reserved.</span>
          </div>
        </footer>

        {/* ══════════════════════════════════════════════════════════
            Conversion Boosters (existing components)
            ══════════════════════════════════════════════════════════ */}
        <ExitIntentPopup />
        <StickyMobileCTA />
      </div>
    </LazyMotion>
  );
};

export default Landing;
