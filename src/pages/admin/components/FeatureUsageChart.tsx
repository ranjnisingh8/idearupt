import { Activity } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import ExportButton from "./ExportButton";
import { FEATURE_COLORS, FEATURE_LABELS } from "../constants";
import type { FeatureUsage } from "../types";

interface FeatureUsageChartProps {
  data: FeatureUsage[];
}

const FeatureUsageChart = ({ data }: FeatureUsageChartProps) => {
  const chartData = data.map((f) => ({
    ...f,
    label: FEATURE_LABELS[f.feature] || f.feature,
    fill: FEATURE_COLORS[f.feature] || "#8B5CF6",
  }));

  return (
    <div className="surface-card p-3.5 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3
          className="font-heading text-sm font-semibold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <Activity className="w-4 h-4" style={{ color: "#A855F7" }} />
          Feature Usage
        </h3>
        <ExportButton data={data} filename="feature-usage" />
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#8E93A8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#8E93A8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                color: "var(--text-primary)",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => [
                value,
                name === "total_uses" ? "Uses" : "Users",
              ]}
            />
            <Bar dataKey="total_uses" radius={[4, 4, 0, 0]}>
              {data.map((f, i) => (
                <Cell key={i} fill={FEATURE_COLORS[f.feature] || "#8B5CF6"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div
          className="text-center py-6 font-body text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          No feature usage recorded for this period.
        </div>
      )}
    </div>
  );
};

export default FeatureUsageChart;
