import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Idea } from "@/data/ideas";

export interface BuilderDna {
  tech_level: string | null;
  budget_range: string | null;
  time_commitment: string | null;
  industries: string[];
  risk_tolerance: string | null;
}

const TECH_LEVELS = ["no_code", "low_code", "full_stack"] as const;
const BUDGET_LEVELS = ["zero", "low", "medium", "high"] as const;

function techLevelIndex(level: string | null): number {
  if (!level) return 0;
  const idx = TECH_LEVELS.indexOf(level as any);
  return idx >= 0 ? idx : 0;
}

function budgetIndex(budget: string | null): number {
  if (!budget) return 0;
  const idx = BUDGET_LEVELS.indexOf(budget as any);
  return idx >= 0 ? idx : 0;
}

/** Map idea techLevel format ("no-code") to builder_dna format ("no_code") */
function normalizeIdeaTechLevel(tl: string | undefined): string {
  if (!tl) return "low_code";
  return tl.replace(/-/g, "_");
}

/** Map idea category to onboarding industry labels for matching.
 *  Scraper generates 30+ categories; onboarding offers 12 industry choices.
 *  We map every known scraper category → one or more onboarding labels.
 */
export function categoryToIndustries(category: string): string[] {
  const cat = (category || "").toLowerCase().replace(/[\/\s]+/g, " ").trim();
  const map: Record<string, string[]> = {
    // Direct matches
    "ai/ml": ["AI / ML"],
    "ai ml": ["AI / ML"],
    "ai": ["AI / ML"],
    "developer tools": ["Developer Tools"],
    "dev tools": ["Developer Tools"],
    "dev tool": ["Developer Tools"],
    "marketing": ["Marketing & Sales"],
    "sales": ["Marketing & Sales"],
    "marketing & sales": ["Marketing & Sales"],
    "hr/recruiting": ["SaaS / Software", "Productivity"],
    "hr recruiting": ["SaaS / Software", "Productivity"],
    "finance": ["Finance & Fintech"],
    "fintech": ["Finance & Fintech"],
    "finance & fintech": ["Finance & Fintech"],
    "healthcare": ["Health & Wellness"],
    "healthtech": ["Health & Wellness"],
    "health & wellness": ["Health & Wellness"],
    "education": ["Education"],
    "edtech": ["Education"],
    "e-commerce": ["E-commerce"],
    "ecommerce": ["E-commerce"],
    "productivity": ["Productivity"],
    "communication": ["SaaS / Software", "Productivity"],
    "analytics": ["SaaS / Software", "Developer Tools"],
    "security": ["Developer Tools", "SaaS / Software"],
    "iot": ["Developer Tools", "SaaS / Software"],
    "real estate": ["Real Estate"],
    "proptech": ["Real Estate"],
    "legal": ["Finance & Fintech", "SaaS / Software"],
    "legaltech": ["Finance & Fintech", "SaaS / Software"],
    "field services": ["SaaS / Software", "Productivity"],
    "construction": ["SaaS / Software", "Productivity"],
    "automotive": ["SaaS / Software"],
    "fitness": ["Health & Wellness"],
    "agriculture": ["SaaS / Software"],
    "logistics": ["SaaS / Software", "E-commerce"],
    "compliance": ["Finance & Fintech", "SaaS / Software"],
    "revops": ["Marketing & Sales", "SaaS / Software"],
    "agency tools": ["Marketing & Sales", "SaaS / Software"],
    "insurtech": ["Finance & Fintech"],
    "foodtech": ["SaaS / Software", "E-commerce"],
    "creatoreconomy": ["Social / Community", "Marketing & Sales"],
    "creator economy": ["Social / Community", "Marketing & Sales"],
    "social": ["Social / Community"],
    "entertainment": ["Social / Community"],
    // Generic fallbacks
    "saas": ["SaaS / Software"],
    "tool": ["SaaS / Software", "Productivity", "Developer Tools"],
    "platform": ["SaaS / Software"],
    "marketplace": ["E-commerce"],
    "api": ["Developer Tools"],
    "chrome extension": ["Developer Tools", "Productivity"],
    "mobile app": ["SaaS / Software"],
  };
  return map[cat] || [];
}

export function calculateMatchScore(idea: Idea, dna: BuilderDna): number {
  let score = 0;

  // Tech level match (30pts: exact=30, adjacent=15, far=5)
  const userTech = techLevelIndex(dna.tech_level);
  const ideaTech = techLevelIndex(normalizeIdeaTechLevel(idea.techLevel));
  const techDiff = Math.abs(userTech - ideaTech);
  score += techDiff === 0 ? 30 : techDiff === 1 ? 15 : 5;

  // Budget match (20pts: match=20, close=10, far=4)
  const userBudget = budgetIndex(dna.budget_range);
  const ideaBudgetNeed = Math.min(3, Math.floor((idea.scores?.build_difficulty ?? 5) / 3));
  const budgetDiff = Math.max(0, ideaBudgetNeed - userBudget);
  score += budgetDiff === 0 ? 20 : budgetDiff === 1 ? 10 : 4;

  // Industry / category match (30pts: match=30, partial=15, none=10)
  const userIndustries = (dna.industries || []).map((i) => i.toLowerCase());
  const ideaIndustries = categoryToIndustries(idea.category || "");
  const ideaTags = (idea.tags || []).map((t) => t.toLowerCase());
  const ideaCatLower = (idea.category || "").toLowerCase();
  const allIdeaKeywords = [...ideaIndustries.map((i) => i.toLowerCase()), ...ideaTags, ideaCatLower];
  // Also check idea description/title keywords for broader matching
  const ideaTitle = (idea.title || "").toLowerCase();
  const industryMatch = userIndustries.some((ui) =>
    allIdeaKeywords.some((ik) => ik.includes(ui) || ui.includes(ik)) ||
    ideaTitle.includes(ui)
  );
  // Partial match: the idea's category or tags partially overlap with user interests
  const partialMatch = !industryMatch && userIndustries.length > 0 && (
    userIndustries.some((ui) => ideaCatLower.includes(ui.split(" ")[0]) || ui.includes(ideaCatLower.split(" ")[0]))
  );
  score += industryMatch ? 30 : partialMatch ? 15 : 10;

  // Time commitment vs build difficulty (20pts)
  const timeMap: Record<string, number> = { side_hustle: 0, part_time: 1, full_time: 2 };
  const userTime = timeMap[dna.time_commitment || "part_time"] ?? 1;
  const buildDiff = idea.scores?.build_difficulty ?? 5;
  // Lower build difficulty suits less time; higher suits more time
  const idealTime = buildDiff >= 7 ? 2 : buildDiff >= 4 ? 1 : 0;
  const timeDiff = Math.abs(userTime - idealTime);
  score += timeDiff === 0 ? 20 : timeDiff === 1 ? 12 : 4;

  return Math.min(100, score);
}

export function useBuilderMatch() {
  const { user } = useAuth();
  const [dna, setDna] = useState<BuilderDna | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchDna = useCallback(() => {
    if (!user) {
      setDna(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.resolve(
      supabase
        .from("builder_dna")
        .select("tech_level, budget_range, time_commitment, industries, risk_tolerance")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!error && data) {
            setDna({
              ...data,
              industries: Array.isArray(data.industries) ? data.industries : [],
            });
          }
          setLoading(false);
        })
    ).catch(() => {
      // Network error — don't block feed
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    fetchDna();
  }, [fetchDna, refreshKey]);

  // Listen for "builder_dna_saved" event from Onboarding — triggers re-fetch
  useEffect(() => {
    const handleDnaSaved = () => setRefreshKey((k) => k + 1);
    window.addEventListener("builder_dna_saved", handleDnaSaved);
    return () => window.removeEventListener("builder_dna_saved", handleDnaSaved);
  }, []);

  // Also re-fetch when navigating to feed after onboarding (check if dna is null but localStorage says done)
  useEffect(() => {
    if (!user || dna) return;
    const localFlag = localStorage.getItem(`onboarding_done_${user.id}`);
    if (localFlag === "true") {
      // Delay slightly to give DB time to propagate after RPC
      const timer = setTimeout(() => setRefreshKey((k) => k + 1), 500);
      return () => clearTimeout(timer);
    }
  }, [user, dna]);

  const getMatchScore = (idea: Idea): number | null => {
    if (!dna) return null;
    return calculateMatchScore(idea, dna);
  };

  return { dna, loading: loading, getMatchScore, refetch: fetchDna };
}
