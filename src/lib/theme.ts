/**
 * Centralized design tokens and style helpers.
 * Import from here instead of duplicating style maps in components.
 */

import type { Idea } from "@/data/ideas";

// ── Category badge styles (IdeaCard + UseCases) ──────────────

export const categoryStyles: Record<string, string> = {
  saas: "text-[#A78BFA] border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.1)]",
  tool: "text-[#22D3EE] border-[rgba(6,182,212,0.2)] bg-[rgba(6,182,212,0.1)]",
  api: "text-[#34D399] border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.1)]",
  marketplace: "text-[#FBBF24] border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.1)]",
  ai: "text-[#A78BFA] border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.1)]",
  "ai/ml": "text-[#A78BFA] border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.1)]",
  platform: "text-[#A78BFA] border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.1)]",
  analytics: "text-[#22D3EE] border-[rgba(6,182,212,0.2)] bg-[rgba(6,182,212,0.1)]",
  "dev tool": "text-[#22D3EE] border-[rgba(6,182,212,0.2)] bg-[rgba(6,182,212,0.1)]",
  "developer tools": "text-[#22D3EE] border-[rgba(6,182,212,0.2)] bg-[rgba(6,182,212,0.1)]",
  "chrome extension": "text-[#FBBF24] border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.1)]",
  "mobile app": "text-[#A78BFA] border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.1)]",
  marketing: "text-[#FBBF24] border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.1)]",
  sales: "text-[#34D399] border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.1)]",
  productivity: "text-[#22D3EE] border-[rgba(6,182,212,0.2)] bg-[rgba(6,182,212,0.1)]",
  "e-commerce": "text-[#FBBF24] border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.1)]",
  finance: "text-[#34D399] border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.1)]",
  healthcare: "text-[#F87171] border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.1)]",
  education: "text-[#A78BFA] border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.1)]",
};

export const getCategoryStyle = (cat: string | null | undefined): string => {
  if (!cat) return "text-[var(--text-tertiary)] border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)]";
  return categoryStyles[cat.toLowerCase()] || "text-[var(--text-tertiary)] border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)]";
};

export const formatCategory = (cat: string): string => {
  const map: Record<string, string> = { api: "API", saas: "SaaS", ai: "AI", "ai/ml": "AI/ML" };
  const lower = cat.toLowerCase();
  if (map[lower]) return map[lower];
  return cat.replace(/\b\w/g, (c) => c.toUpperCase());
};

// ── Sentiment styles (Signals + IdeaDetail) ──────────────────

export const sentimentStyles: Record<string, { label: string; color: string; bg: string; border: string }> = {
  frustrated: { label: "Frustrated", color: "#F59E0B", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" },
  angry: { label: "Angry", color: "#EF4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)" },
  desperate: { label: "Desperate", color: "#A855F7", bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.25)" },
  hopeful: { label: "Hopeful", color: "#10B981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)" },
  neutral: { label: "Neutral", color: "#6B7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.25)" },
};

export const getSentimentStyle = (sentiment: string | null) => {
  return sentimentStyles[(sentiment || "neutral").toLowerCase()] || sentimentStyles.neutral;
};

// ── Score colors ─────────────────────────────────────────────

export const getScoreColor = (score: number): string => {
  if (score >= 9) return "#10B981";
  if (score >= 7) return "#06B6D4";
  if (score >= 5) return "#F59E0B";
  return "#565B6E";
};

// ── Source badges ────────────────────────────────────────────

export interface SourceBadge {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const getSourceBadge = (idea: Idea): SourceBadge | null => {
  const src = (idea?.source || idea?.validation_data?.source_platform || "").toLowerCase();
  const subreddit = idea?.validation_data?.subreddit;
  if (src.includes("reddit")) return { label: subreddit ? `r/${subreddit}` : "Reddit", color: "#FF6B35", bg: "rgba(255,69,0,0.12)", border: "rgba(255,69,0,0.25)" };
  if (src.includes("hacker") || src === "hackernews") return { label: "HN", color: "#FF6600", bg: "rgba(255,102,0,0.12)", border: "rgba(255,102,0,0.25)" };
  if (src.includes("github")) return { label: "GitHub", color: "var(--text-secondary)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)" };
  if (src.includes("producthunt") || src.includes("product hunt")) return { label: "PH", color: "#DA552F", bg: "rgba(218,85,47,0.12)", border: "rgba(218,85,47,0.25)" };
  if (src.includes("indiehacker") || src.includes("indie hacker")) return { label: "IH", color: "#4285F4", bg: "rgba(66,133,244,0.12)", border: "rgba(66,133,244,0.25)" };
  if (src.includes("stackoverflow") || src.includes("stack overflow")) return { label: "SO", color: "#F48024", bg: "rgba(244,128,36,0.12)", border: "rgba(244,128,36,0.25)" };
  if (src.includes("lobste")) return { label: "Lobsters", color: "#C0392B", bg: "rgba(139,0,0,0.12)", border: "rgba(139,0,0,0.25)" };
  if (src.includes("dev.to")) return { label: "Dev.to", color: "#3B49DF", bg: "rgba(59,73,223,0.12)", border: "rgba(59,73,223,0.25)" };
  // Don't show badge for AI-generated or unknown/internal source types
  if (src && !src.includes("ai_generated") && !src.includes("ai-generated") && !src.includes("generated") && !src.includes("internal") && !src.includes("manual")) {
    return { label: src, color: "var(--text-secondary)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)" };
  }
  return null;
};

// ── Match badge styles ───────────────────────────────────────

export const getMatchBadgeStyle = (score: number): string => {
  if (score >= 90) return "bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.25)] text-[#34D399]";
  if (score >= 70) return "bg-[rgba(6,182,212,0.12)] border-[rgba(6,182,212,0.25)] text-[#22D3EE]";
  if (score >= 50) return "bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.25)] text-[#FBBF24]";
  return "bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] text-[var(--text-tertiary)]";
};

// ── Difficulty / Demand styles (UseCases) ────────────────────

export const getDifficultyStyle = (d: string | null) => {
  switch (d) {
    case "beginner":
      return { label: "Beginner", color: "#34D399", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)" };
    case "advanced":
      return { label: "Advanced", color: "#F87171", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)" };
    default:
      return { label: "Intermediate", color: "#FBBF24", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" };
  }
};

export const getDemandStyle = (score: number | null) => {
  const s = score ?? 0;
  if (s >= 8) return { color: "#34D399", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)" };
  if (s >= 6) return { color: "#FBBF24", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" };
  return { color: "#A78BFA", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.3)" };
};

// ── Safe number helper ───────────────────────────────────────

export const safeScore = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) || !isFinite(n) ? 0 : n;
};

// ── Text truncation ──────────────────────────────────────────

export const smartTruncate = (text: string, maxLen: number): string => {
  if (!text || text.length <= maxLen) return text;
  const trimmed = text.substring(0, maxLen);
  const lastPeriod = trimmed.lastIndexOf(". ");
  if (lastPeriod > maxLen * 0.4) return trimmed.substring(0, lastPeriod + 1);
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.3) return trimmed.substring(0, lastSpace) + "...";
  return trimmed + "...";
};

// ── Platform filters (Signals) ───────────────────────────────

export const platformFilters = ["All", "Reddit", "Hacker News", "Product Hunt", "Indie Hackers", "Stack Overflow", "GitHub"] as const;

// ── Problem Size badges ─────────────────────────────────────

export type ProblemSize = "small" | "medium" | "large";

export const problemSizeConfig: Record<ProblemSize, { label: string; emoji: string; color: string; bg: string; border: string }> = {
  small:  { label: "Weekend Project", emoji: "⚡", color: "#34D399", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.25)" },
  medium: { label: "Side Project",    emoji: "🛠️", color: "#FBBF24", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.25)" },
  large:  { label: "Serious Build",   emoji: "🏗️", color: "#FB923C", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.25)" },
};

export const getProblemSizeStyle = (size: string | null | undefined) => {
  return problemSizeConfig[(size || "medium") as ProblemSize] || problemSizeConfig.medium;
};
