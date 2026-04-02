import { useParams, Link } from "react-router-dom";
import { sampleIdeas } from "@/data/ideas";
import { generateBlueprint, getDefaultTab, TechLevel } from "@/data/blueprintGenerator";

import { ArrowLeft, Clock, DollarSign, Rocket, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import AILoader from "@/components/AILoader";
import { trackEvent, EVENTS } from "@/lib/analytics";

const tabs = ["No-Code", "Low-Code", "Full-Stack"] as const;
const tabToKey: Record<string, TechLevel> = {
  "No-Code": "no_code",
  "Low-Code": "low_code",
  "Full-Stack": "full_stack",
};

const Blueprint = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [idea, setIdea] = useState(sampleIdeas.find((i) => i.id === id) || null);
  const [activeTab, setActiveTab] = useState<string>("Low-Code");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        if (id) {
          const { data } = await supabase.from("ideas").select("*").eq("id", id).maybeSingle();
          if (data) setIdea(data as any);
        }
        if (user) {
          const { data } = await supabase
            .from("builder_dna")
            .select("tech_level")
            .eq("user_id", user.id)
            .maybeSingle();
          if (data?.tech_level) {
            setActiveTab(getDefaultTab(data.tech_level));
          }
        }
      } catch {
        // Gracefully continue with defaults
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, user]);

  useEffect(() => {
    if (!loading && idea && id) {
      trackEvent(EVENTS.BLUEPRINT_VIEWED, { idea_id: id, idea_title: idea.title, tab: activeTab });
    }
  }, [loading, idea, id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">

        <div className="flex items-center justify-center py-20">
          <AILoader />
        </div>
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

  const blueprints = generateBlueprint();
  const bp = blueprints[tabToKey[activeTab]];
  const title = idea?.title || "Untitled Idea";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto px-3 sm:px-4 py-6 max-w-2xl w-full">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <h1 className="text-xl sm:text-2xl font-bold mb-1 text-gradient">{title}</h1>
        <p className="text-muted-foreground text-sm mb-6">Build Blueprint</p>

        {/* Tabs */}
        <div className="flex gap-1 glass-card p-1 rounded-xl mb-6">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                trackEvent(EVENTS.BLUEPRINT_TAB_SWITCHED, { idea_id: id, tab });
              }}
              className={`flex-1 text-sm font-medium py-2.5 min-h-[44px] rounded-lg transition-all duration-300 ${
                activeTab === tab ? "bg-gradient-to-r from-secondary/50 to-accent/50 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {/* Stack */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recommended Stack</h3>
            <div className="space-y-2">
              {bp?.stack?.map((tool) => (
                <div key={tool.name} className="glass-card rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{tool.name}</p>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                  <span className="text-xs font-medium text-accent">{tool.cost}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Steps */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Step-by-Step Build Guide</h3>
            <div className="space-y-3 relative">
              {bp?.steps?.map((step, i) => {
                return (
                  <div key={i} className="relative pl-8">
                    <div className="absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-gradient-to-br from-secondary to-accent text-white">
                      <CheckCircle className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{step.title}</p>
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {step.time}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

          </section>

          {/* Summary */}
          <section className="grid grid-cols-2 gap-3 mb-8">
            <div className="glass-card rounded-xl p-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Monthly Cost</p>
                <p className="text-sm font-semibold">{bp?.totalMonthlyCost || "N/A"}</p>
              </div>
            </div>
            <div className="glass-card rounded-xl p-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Timeline</p>
                <p className="text-sm font-semibold">{bp?.timeline || "N/A"}</p>
              </div>
            </div>
          </section>

          {/* Launch Playbook */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Rocket className="w-4 h-4" /> Launch Playbook
            </h3>
            <div className="glass-card rounded-xl p-4 space-y-2.5">
              {bp?.launchPlaybook?.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs font-bold text-accent mt-0.5">{i + 1}.</span>
                  <p className="text-sm text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
};

export default Blueprint;
