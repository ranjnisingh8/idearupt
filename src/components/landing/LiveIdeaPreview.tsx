import { motion } from "framer-motion";
import { Lock, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface TopIdea {
  id: string;
  title: string;
  category: string;
  overall_score: number;
  one_liner: string | null;
  description: string | null;
  pain_score: number | null;
  scores: any;
}

const LiveIdeaPreview = () => {
  const [ideas, setIdeas] = useState<TopIdea[]>([]);

  useEffect(() => {
    const fetchTopIdeas = async () => {
      const { data } = await supabase
        .from("ideas")
        .select("id, title, category, overall_score, one_liner, description, pain_score, scores")
        .order("overall_score", { ascending: false })
        .limit(3);

      if (data && data.length > 0) setIdeas(data);
    };
    fetchTopIdeas();
  }, []);

  if (ideas.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.35 }}
        className="text-center mb-10"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <TrendingUp className="w-3.5 h-3.5" style={{ color: '#10B981' }} strokeWidth={1.5} />
          <span className="font-body text-xs font-medium" style={{ color: '#34D399' }}>Updated daily from our database</span>
        </div>
        <h2
          className="font-heading text-[28px] sm:text-[36px] font-bold tracking-[-0.02em]"
          style={{ color: 'var(--text-primary)' }}
        >
          Today's highest-scored ideas
        </h2>
        <p className="text-sm mt-2 font-body" style={{ color: 'var(--text-tertiary)' }}>Real ideas, scored by AI. Refreshed every 24 hours.</p>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
        {ideas.map((idea, i) => {
          const score = idea.overall_score ?? 0;
          const scoreColor = score >= 9 ? "#10B981" : score >= 7 ? "#06B6D4" : "#F59E0B";
          const painScore = idea.scores?.pain_score ?? idea.pain_score ?? 0;
          const oneLiner = idea.one_liner || (() => { const d = idea.description || ""; if (d.length <= 140) return d; const c = d.substring(0, 140); const s = c.lastIndexOf(" "); return s > 40 ? c.substring(0, s) + "..." : c + "..."; })();
          return (
            <motion.div
              key={idea.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.35 }}
              className="surface-card overflow-hidden"
              style={{ transform: 'none' }}
            >
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-body text-[11px] uppercase tracking-[0.06em] font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#A78BFA' }}>
                    {idea.category || "Other"}
                  </span>
                  <span className="font-heading text-lg font-bold tabular-nums" style={{ color: scoreColor }}>
                    {score.toFixed(1)}
                  </span>
                </div>
                <h3 className="font-heading text-base font-semibold mb-2 leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>{idea.title}</h3>
                <p className="text-xs line-clamp-2 mb-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{oneLiner}</p>
                <div className="flex items-center gap-3 font-body text-[10px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                  <span>🔥 {Number(painScore).toFixed(1)} pain</span>
                  <span>📊 {score.toFixed(1)}/10 overall</span>
                </div>
              </div>
              <div className="px-5 py-3.5" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                <Link to="/auth" className="flex items-center justify-center gap-2 text-xs font-medium transition-colors" style={{ color: 'var(--text-tertiary)' }}>
                  <Lock className="w-3 h-3" strokeWidth={1.5} /> Sign up to unlock full analysis →
                </Link>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};

export default LiveIdeaPreview;
