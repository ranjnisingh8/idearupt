import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface HeroIdea {
  title: string;
  category: string;
  overall_score: number;
  one_liner: string;
  pain_score: number;
  trend_score: number;
  competition_score: number;
}

const MiniScoreBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="flex items-center gap-2">
    <span className="font-body text-[10px] w-12 text-right" style={{ color: "var(--text-tertiary)" }}>{label}</span>
    <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${(value / 10) * 100}%` }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.8 }}
      />
    </div>
    <span className="font-heading text-[11px] font-bold tabular-nums w-6" style={{ color }}>{value.toFixed(1)}</span>
  </div>
);

const HeroIdeaCard = () => {
  const [idea, setIdea] = useState<HeroIdea | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("ideas")
      .select("title, category, overall_score, one_liner, pain_score, trend_score, competition_score")
      .order("overall_score", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setIdea(data as HeroIdea);
      });
  }, []);

  if (!idea) return null;

  const scoreColor = idea.overall_score >= 8 ? "#10B981" : idea.overall_score >= 6 ? "#06B6D4" : "#F59E0B";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="glass-card rounded-xl p-5 relative overflow-hidden glow-neon-purple"
      style={{ animation: "float 5s ease-in-out infinite" }}
    >
      {/* Category + Score */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-body text-[11px] uppercase tracking-[0.06em] font-medium px-2.5 py-1 rounded-md" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#A78BFA" }}>
          {idea.category}
        </span>
        <div className="relative w-10 h-10">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
            <motion.circle
              cx="20" cy="20" r="16" fill="none"
              stroke={scoreColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 16}
              initial={{ strokeDashoffset: 2 * Math.PI * 16 }}
              animate={{ strokeDashoffset: (2 * Math.PI * 16) - (idea.overall_score / 10) * (2 * Math.PI * 16) }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-heading text-xs font-bold tabular-nums" style={{ color: scoreColor }}>
            {idea.overall_score.toFixed(1)}
          </span>
        </div>
      </div>

      <h3 className="font-heading text-base font-semibold mb-1.5 leading-snug" style={{ color: "var(--text-primary)" }}>{idea.title}</h3>
      <p className="text-xs line-clamp-2 mb-4" style={{ color: "var(--text-secondary)" }}>{idea.one_liner}</p>

      {/* Score bars */}
      <div className="space-y-2 mb-4">
        <MiniScoreBar label="Pain" value={idea.pain_score} color="#F97316" />
        <MiniScoreBar label="Trend" value={idea.trend_score} color="#3B82F6" />
        <MiniScoreBar label="Compete" value={idea.competition_score} color="#06B6D4" />
      </div>

      {/* Pro features peek — clickable CTA */}
      <div
        className="relative rounded-lg p-3 overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02]"
        style={{ background: "var(--bg-elevated)" }}
        onClick={() => navigate("/auth")}
      >
        <div className="flex items-center justify-between">
          <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>📄 PDF export · 🔗 Source threads · 🎯 Pain Radar</p>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-1.5 font-body text-[11px] font-medium px-3 py-1.5 rounded-lg" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#A78BFA" }}>
            Sign up to explore
          </span>
        </div>
      </div>

      {/* Floating annotation — points at Pain score bar (desktop only) */}
      <div className="hidden lg:block">
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.2, duration: 0.4 }}
          className="absolute -right-2 font-body text-[10px] px-2 py-1 rounded-md whitespace-nowrap"
          style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)", color: "#F97316", top: "calc(55% + 4px)" }}
        >
          ← Real pain score
        </motion.div>
      </div>
    </motion.div>
  );
};

export default HeroIdeaCard;
