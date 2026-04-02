import { Users, BarChart3 } from "lucide-react";
import type { TodayStats } from "../types";

interface PlatformStatsProps {
  stats: TodayStats | null;
}

const PlatformStats = ({ stats: s }: PlatformStatsProps) => (
  <div className="space-y-3 sm:space-y-4">
    {/* User Stats */}
    <div className="surface-card p-3.5 sm:p-4">
      <h3
        className="font-heading text-sm font-semibold mb-3 flex items-center gap-2"
        style={{ color: "var(--text-primary)" }}
      >
        <Users className="w-4 h-4" style={{ color: "#06B6D4" }} />
        User Stats
      </h3>
      <div className="space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="font-body text-xs" style={{ color: "var(--text-secondary)" }}>
            Total Users
          </span>
          <span className="font-heading text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {s?.total_users?.toLocaleString() ?? 0}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="font-body text-xs" style={{ color: "var(--text-secondary)" }}>
            Active in Period
          </span>
          <span className="font-heading text-sm font-bold" style={{ color: "#10B981" }}>
            {s?.unique_users ?? 0}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="font-body text-xs" style={{ color: "var(--text-secondary)" }}>
            Onboarded
          </span>
          <span className="font-heading text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {s?.onboarding_completed ?? 0}
          </span>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              Onboarding Rate
            </span>
            <span className="font-body text-[10px] font-medium" style={{ color: "#A855F7" }}>
              {s?.onboarding_rate ?? 0}%
            </span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "var(--bg-surface-hover)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, s?.onboarding_rate ?? 0)}%`,
                background: "linear-gradient(90deg, #8B5CF6, #06B6D4)",
              }}
            />
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="font-body text-xs" style={{ color: "var(--text-secondary)" }}>
            Pro Waitlist
          </span>
          <span className="font-heading text-sm font-bold" style={{ color: "#EF4444" }}>
            {s?.total_waitlist ?? 0}
          </span>
        </div>
      </div>
    </div>

    {/* Content Stats */}
    <div className="surface-card p-3.5 sm:p-4">
      <h3
        className="font-heading text-sm font-semibold mb-3 flex items-center gap-2"
        style={{ color: "var(--text-primary)" }}
      >
        <BarChart3 className="w-4 h-4" style={{ color: "#F59E0B" }} />
        Content Health
      </h3>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <span className="font-body text-[10px] block" style={{ color: "var(--text-tertiary)" }}>
            Ideas
          </span>
          <span className="font-heading text-base font-bold" style={{ color: "var(--text-primary)" }}>
            {s?.total_ideas?.toLocaleString() ?? 0}
          </span>
        </div>
        <div>
          <span className="font-body text-[10px] block" style={{ color: "var(--text-tertiary)" }}>
            Avg Score
          </span>
          <span className="font-heading text-base font-bold" style={{ color: "#F59E0B" }}>
            {s?.avg_idea_score ?? "\u2014"}
          </span>
        </div>
        <div>
          <span className="font-body text-[10px] block" style={{ color: "var(--text-tertiary)" }}>
            Signals
          </span>
          <span className="font-heading text-base font-bold" style={{ color: "var(--text-primary)" }}>
            {s?.total_signals?.toLocaleString() ?? 0}
          </span>
        </div>
        <div>
          <span className="font-body text-[10px] block" style={{ color: "var(--text-tertiary)" }}>
            Use Cases
          </span>
          <span className="font-heading text-base font-bold" style={{ color: "var(--text-primary)" }}>
            {s?.total_use_cases ?? 0}
          </span>
        </div>
        <div>
          <span className="font-body text-[10px] block" style={{ color: "var(--text-tertiary)" }}>
            Trending
          </span>
          <span className="font-heading text-base font-bold" style={{ color: "#EF4444" }}>
            {s?.trending_ideas ?? 0}
          </span>
        </div>
      </div>
    </div>
  </div>
);

export default PlatformStats;
