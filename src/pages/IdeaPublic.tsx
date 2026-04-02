import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

import IdeaDetail from "@/components/IdeaDetail";
import AILoader from "@/components/AILoader";
import { Idea, sampleIdeas } from "@/data/ideas";
import { trackEvent, EVENTS } from "@/lib/analytics";

const IdeaPublic = () => {
  const { id } = useParams();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [loading, setLoading] = useState(true);
  

  useEffect(() => {
    const fetchIdea = async () => {
      try {
        const { data } = await supabase.from("ideas").select("*").eq("id", id).maybeSingle();
        if (data) {
          setIdea({
            ...data,
            oneLiner: data.oneLiner || data.one_liner || (() => { const d = data.description || ""; if (d.length <= 140) return d; const c = d.substring(0, 140); const s = c.lastIndexOf(" "); return s > 40 ? c.substring(0, s) + "..." : c + "..."; })(),
            category: data.category || "Other",
            tags: Array.isArray(data.tags) ? data.tags : [],
            scores: data.scores ?? {
              pain_score: data.pain_score ?? 0, trend_score: data.trend_score ?? 0,
              competition_score: data.competition_score ?? 0, revenue_potential: data.revenue_potential ?? 0,
              build_difficulty: data.build_difficulty ?? 0,
            },
            overall_score: data.overall_score ?? 0,
            save_count: data.save_count ?? 0,
            is_trending: data.is_trending ?? false,
            validation_data: data.validation_data ?? undefined,
          } as Idea);
        } else {
          const sample = sampleIdeas.find((i) => i.id === id);
          if (sample) setIdea(sample);
        }
      } catch {
        const sample = sampleIdeas.find((i) => i.id === id);
        if (sample) setIdea(sample);
      } finally {
        setLoading(false);
      }
    };
    fetchIdea();
  }, [id]);

  useEffect(() => {
    if (idea && id) {
      trackEvent(EVENTS.IDEA_VIEWED, { idea_id: id, idea_title: idea.title, source: "public_link" });
    }
  }, [idea, id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">

        <div className="flex items-center justify-center py-20"><AILoader /></div>
      </div>
    );
  }

  if (!idea) {
    return (
      <div className="min-h-screen bg-background">

        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-muted-foreground mb-4">Idea not found</p>
          <Link to="/feed" className="btn-gradient px-4 py-2 text-sm">Back to Feed</Link>
        </div>
      </div>
    );
  }

  // Both authenticated and anonymous users see full detail
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <button onClick={() => window.history.back()} className="text-sm text-white/40 hover:text-white/70 mb-4 inline-block transition-colors cursor-pointer">← Back</button>
      </div>
      <IdeaDetail idea={idea} onClose={() => window.history.back()} />
    </div>
  );
};

export default IdeaPublic;
