import { Database, Lightbulb, Radio, BrainCircuit } from "lucide-react";
import type { TodayStats } from "../types";

interface PipelineHealthProps {
  stats: TodayStats | null;
}

const SOURCE_COLORS: Record<string, string> = {
  reddit: "#FF4500",
  hackernews: "#FF6600",
  github: "#8B5CF6",
  producthunt: "#DA552F",
  lobsters: "#B22222",
  devto: "#3B49DF",
  ai_generated: "#06B6D4",
};

const TIER_COLORS: Record<string, string> = {
  S: "#F59E0B",
  A: "#10B981",
  B: "#06B6D4",
  C: "#8E93A8",
};

const PipelineHealth = ({ stats: s }: PipelineHealthProps) => {
  const hasData = (s?.ideas_scraped_today ?? 0) > 0;

  return (
    <div className="surface-card p-3.5 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-4 h-4" style={{ color: "#10B981" }} />
        <h3
          className="font-heading text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Pipeline Health
        </h3>
        {hasData ? (
          <span className="text-[9px] px-2 py-0.5 rounded-full font-body font-medium bg-emerald-500/15 text-emerald-400">
            Running
          </span>
        ) : (
          <span className="text-[9px] px-2 py-0.5 rounded-full font-body font-medium bg-amber-500/15 text-amber-400">
            Awaiting 6 PM IST
          </span>
        )}
      </div>

      {/* Pipeline counts */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div
          className="p-2.5 rounded-lg text-center"
          style={{
            background: "rgba(139,92,246,0.08)",
            border: "1px solid rgba(139,92,246,0.2)",
          }}
        >
          <Lightbulb
            className="w-3.5 h-3.5 mx-auto mb-1"
            style={{ color: "#8B5CF6" }}
          />
          <div
            className="font-heading text-lg font-bold tabular-nums"
            style={{ color: "#8B5CF6" }}
          >
            {s?.ideas_scraped_today ?? 0}
          </div>
          <span
            className="font-body text-[9px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            Ideas
          </span>
        </div>

        <div
          className="p-2.5 rounded-lg text-center"
          style={{
            background: "rgba(6,182,212,0.08)",
            border: "1px solid rgba(6,182,212,0.2)",
          }}
        >
          <Radio
            className="w-3.5 h-3.5 mx-auto mb-1"
            style={{ color: "#06B6D4" }}
          />
          <div
            className="font-heading text-lg font-bold tabular-nums"
            style={{ color: "#06B6D4" }}
          >
            {s?.signals_scraped_today ?? 0}
          </div>
          <span
            className="font-body text-[9px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            Signals
          </span>
        </div>

        <div
          className="p-2.5 rounded-lg text-center"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <BrainCircuit
            className="w-3.5 h-3.5 mx-auto mb-1"
            style={{ color: "#F59E0B" }}
          />
          <div
            className="font-heading text-lg font-bold tabular-nums"
            style={{ color: "#F59E0B" }}
          >
            {s?.use_cases_generated_today ?? 0}
          </div>
          <span
            className="font-body text-[9px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            Use Cases
          </span>
        </div>
      </div>

      {/* Avg score */}
      {s?.avg_score_today != null && (
        <div className="flex items-center justify-between mb-2">
          <span
            className="font-body text-[10px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            Avg Score
          </span>
          <span
            className="font-heading text-xs font-bold"
            style={{ color: "#F59E0B" }}
          >
            {s.avg_score_today}
          </span>
        </div>
      )}

      {/* Source breakdown */}
      {s?.ideas_by_source_today &&
        Object.keys(s.ideas_by_source_today).length > 0 && (
          <div className="mb-2">
            <span
              className="font-body text-[9px] uppercase tracking-wider block mb-1.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              Sources
            </span>
            <div className="flex flex-wrap gap-1">
              {Object.entries(s.ideas_by_source_today).map(
                ([source, count]) => {
                  const color = SOURCE_COLORS[source] || "#8E93A8";
                  return (
                    <span
                      key={source}
                      className="font-body text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{
                        background: `${color}15`,
                        border: `1px solid ${color}30`,
                        color,
                      }}
                    >
                      {source}: {count}
                    </span>
                  );
                }
              )}
            </div>
          </div>
        )}

      {/* Tier breakdown */}
      {s?.tiers_today && Object.keys(s.tiers_today).length > 0 && (
        <div>
          <span
            className="font-body text-[9px] uppercase tracking-wider block mb-1.5"
            style={{ color: "var(--text-tertiary)" }}
          >
            Tiers
          </span>
          <div className="flex gap-1.5">
            {Object.entries(s.tiers_today)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([tier, count]) => {
                const color = TIER_COLORS[tier] || "#8E93A8";
                return (
                  <span
                    key={tier}
                    className="font-heading text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: `${color}15`,
                      border: `1px solid ${color}30`,
                      color,
                    }}
                  >
                    {tier}: {count}
                  </span>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelineHealth;
