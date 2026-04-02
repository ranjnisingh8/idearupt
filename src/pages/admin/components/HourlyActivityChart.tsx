import { Activity } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import ExportButton from "./ExportButton";
import type { HourlyBucket } from "../types";

interface HourlyActivityChartProps {
  data: HourlyBucket[];
}

const HourlyActivityChart = ({ data }: HourlyActivityChartProps) => (
  <div className="surface-card p-3.5 sm:p-4 mb-4 sm:mb-6">
    <div className="flex items-center justify-between mb-3">
      <h2
        className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2"
        style={{ color: "var(--text-primary)" }}
      >
        <Activity className="w-4 h-4" style={{ color: "#8B5CF6" }} />
        Activity Over Time
      </h2>
      <ExportButton data={data} filename="hourly-activity" />
    </div>
    {data.length > 0 ? (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="hour_label"
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
              name === "event_count" ? "Events" : name === "unique_users" ? "Users" : "Sessions",
            ]}
          />
          <Area
            type="monotone"
            dataKey="event_count"
            stroke="#8B5CF6"
            fillOpacity={1}
            fill="url(#colorEvents)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="unique_users"
            stroke="#06B6D4"
            fillOpacity={1}
            fill="url(#colorUsers)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    ) : (
      <div
        className="text-center py-12 font-body text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        No activity data for this period.
      </div>
    )}
  </div>
);

export default HourlyActivityChart;
