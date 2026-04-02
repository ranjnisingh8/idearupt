import { useState, useRef } from "react";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { toast } from "sonner";
import { PLATFORM_STATS } from "@/lib/config";

export interface ValidationAnalysis {
  idea_title: string;
  one_liner: string;
  overall_score: number;
  pain_score: number;
  trend_score: number;
  competition_score: number;
  revenue_potential: number;
  build_difficulty: number;
  category: string;
  estimated_mrr_range: string;
  target_audience: string;
  strengths: string[];
  weaknesses: string[];
  competitors: {
    name: string;
    url: string;
    pricing: string;
    weakness: string;
    estimated_revenue: string;
    rating: string;
  }[];
  similar_ideas_keywords: string[];
  build_steps: string[];
  verdict: string;
}

export interface SimilarIdea {
  id: string;
  title: string;
  one_liner: string;
  overall_score: number;
  category: string;
  estimated_mrr_range: string;
}

export interface ValidationResult {
  analysis?: ValidationAnalysis;
  similarIdeas?: SimilarIdea[];
  analyzedAt: string;
  markdownResult?: string;
}

const LOADING_MESSAGES = [
  "Analyzing your idea...",
  `Scanning ${PLATFORM_STATS.problemsFound}+ validated opportunities...`,
  "Finding competitors...",
  "Calculating market scores...",
  "Almost done...",
];

export const useIdeaValidation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const validate = async (ideaText: string) => {
    if (isLoading) return; // Prevent double-click

    setIsLoading(true);
    setError(null);
    setResult(null);

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    // Cycle loading messages
    let messageIdx = 0;
    setLoadingMessage(LOADING_MESSAGES[0]);
    const interval = setInterval(() => {
      messageIdx = (messageIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[messageIdx]);
    }, 2000);

    // 90-second timeout
    const timeoutId = setTimeout(() => abortRef.current?.abort(), 90000);

    try {
      const url = `${SUPABASE_URL}/functions/v1/validate-idea`;
      const body = { idea: ideaText };

      // Get auth token for server-side usage tracking
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
      };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      // Safe JSON parsing — read text first for resilient handling
      let data: any;
      try {
        const text = await response.text();
        data = JSON.parse(text);
      } catch {
        if (response.status === 529) {
          throw new Error("Our AI is busy right now. Please try again in a moment.");
        }
        if (response.status >= 500) {
          throw new Error("Server error — please try again in a few seconds.");
        }
        throw new Error("Something went wrong. Please try again.");
      }

      if (!response.ok) {
        const msg = data?.error || "Analysis failed";
        if (response.status === 429) {
          throw new Error(msg || "Daily limit reached. Come back tomorrow!");
        }
        if (msg.includes("529") || msg.toLowerCase().includes("overload")) {
          throw new Error("Our AI is busy right now. Please try again in a moment.");
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      // Handle markdown string response format
      if (data?.success && typeof data?.validation === "string") {
        const validationResult: ValidationResult = {
          markdownResult: data.validation,
          analyzedAt: new Date().toISOString(),
        };
        setResult(validationResult);
      }
      // Handle structured response format
      else if (data?.analysis && typeof data.analysis.overall_score === "number") {
        const validationResult: ValidationResult = {
          analysis: data.analysis,
          similarIdeas: data.similarIdeas || [],
          analyzedAt: new Date().toISOString(),
        };
        setResult(validationResult);
      } else {
        throw new Error("Something went wrong. Please try again.");
      }

      // Save to localStorage history
      try {
        const history = JSON.parse(localStorage.getItem("idearupt_validations") || "[]");
        history.unshift({
          analyzedAt: new Date().toISOString(),
          inputText: ideaText,
        });
        localStorage.setItem("idearupt_validations", JSON.stringify(history.slice(0, 20)));
      } catch {}

      toast.success("Analysis complete!");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        const msg = "Request timed out. Please try again.";
        setError(msg);
        toast.error(msg);
        return;
      }
      const msg = err?.message || "Analysis failed — please try again";
      setError(msg);
      toast.error(msg);
    } finally {
      clearTimeout(timeoutId);
      clearInterval(interval);
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setResult(null);
    setError(null);
  };

  return { validate, isLoading, loadingMessage, result, error, reset };
};
