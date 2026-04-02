import { motion } from "framer-motion";
import { TrendingDown, Users } from "lucide-react";
import type { DropoffFunnel } from "../types";

interface Props {
  data: DropoffFunnel | null;
}

const stepColors = [
  { bar: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
  { bar: "#06B6D4", bg: "rgba(6,182,212,0.1)" },
  { bar: "#10B981", bg: "rgba(16,185,129,0.1)" },
  { bar: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  { bar: "#EC4899", bg: "rgba(236,72,153,0.1)" },
  { bar: "#EF4444", bg: "rgba(239,68,68,0.1)" },
  { bar: "#6366F1", bg: "rgba(99,102,241,0.1)" },
];

const DropoffFunnelChart = ({ data }: Props) => {
  if (!data || !data.steps || data.steps.length === 0) {
    return (
      <div className="surface-card rounded-xl p-6 text-center" style={{ transform: "none" }}>
        <TrendingDown className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
        <p className="font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
          No funnel data yet. Events will populate as users interact with the app.
        </p>
      </div>
    );
  }

  const maxCount = Math.max(...data.steps.map((s) => s.count), 1);

  return (
    <div className="surface-card rounded-xl p-5" style={{ transform: "none" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4" style={{ color: "#8B5CF6" }} strokeWidth={1.5} />
          <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            User Drop-off Funnel
          </h3>
        </div>
        <span className="font-body text-[11px] px-2 py-0.5 rounded-md" style={{
          background: data.total_conversion_pct >= 5 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${data.total_conversion_pct >= 5 ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
          color: data.total_conversion_pct >= 5 ? "#34D399" : "#F87171",
        }}>
          {data.total_conversion_pct}% end-to-end
        </span>
      </div>

      <div className="space-y-3">
        {data.steps.map((step, i) => {
          const widthPct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
          const color = stepColors[i % stepColors.length];

          return (
            <div key={step.name}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-body text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    {step.name}
                  </span>
                  {i > 0 && step.drop_off_pct > 0 && (
                    <span className="font-body text-[10px] px-1.5 py-0.5 rounded" style={{
                      background: step.drop_off_pct >= 50 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                      color: step.drop_off_pct >= 50 ? "#F87171" : "#FBBF24",
                    }}>
                      -{step.drop_off_pct}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                  <span className="font-body text-xs tabular-nums font-medium" style={{ color: "var(--text-secondary)" }}>
                    {step.count}
                  </span>
                </div>
              </div>
              <div className="h-6 rounded-md overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(widthPct, 2)}%` }}
                  transition={{ duration: 0.6, delay: i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                  className="h-full rounded-md"
                  style={{ background: color.bar, minWidth: "4px" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DropoffFunnelChart;
