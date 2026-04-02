import { useState, useEffect, useCallback } from "react";
import { Users, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import ExportButton from "./ExportButton";
import type { DauDataPoint } from "../types";

const DauChart = () => {
  const [data, setData] = useState<DauDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data: raw } = await supabase.rpc("admin_get_dau_chart", { num_days: 30 });
      setData((raw as DauDataPoint[]) || []);
    } catch {
      // RPC may not be deployed yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Trend: compare last 7d avg vs previous 7d avg
  const recentAvg = data.length >= 7
    ? data.slice(-7).reduce((s, d) => s + d.dau, 0) / 7 : 0;
  const prevAvg = data.length >= 14
    ? data.slice(-14, -7).reduce((s, d) => s + d.dau, 0) / 7 : 0;
  const trendPct = prevAvg > 0 ? Math.round(((recentAvg - prevAvg) / prevAvg) * 100) : 0;
  const trendUp = trendPct >= 0;

  const chartData = data.map(d => ({
    ...d,
    label: (() => { try { return format(new Date(d.day), "MMM d"); } catch { return d.day; } })(),
  }));

  if (loading) {
    return (
      <div className="surface-card p-6 flex items-center justify-center mb-4 sm:mb-6">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "var(--accent-purple)" }} />
      </div>
    );
  }

  return (
    <div className="surface-card p-3.5 sm:p-4 mb-4 sm:mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2
            className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}
          >
            <Users className="w-4 h-4" style={{ color: "#8B5CF6" }} />
            Daily Active Users
          </h2>
          {data.length >= 14 && (
            <span
              className="flex items-center gap-1 text-[10px] font-body font-medium px-2 py-0.5 rounded-full"
              style={{
                color: trendUp ? "#10B981" : "#EF4444",
                background: trendUp ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
              }}
            >
              {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trendUp ? "+" : ""}{trendPct}% vs prev 7d
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ExportButton data={chartData} filename="dau-chart" />
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="font-body text-[10px] px-2 py-1 rounded-md hover:bg-white/[0.05] transition-colors"
            style={{ color: "var(--text-tertiary)" }}
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="wauGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: "#8E93A8", fontSize: 10 }}
              axisLine={false} tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#8E93A8", fontSize: 10 }}
              axisLine={false} tickLine={false} width={28}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
                borderRadius: "8px", color: "var(--text-primary)", fontSize: "12px",
              }}
              formatter={(value: number, name: string) => [value, name === "dau" ? "DAU" : "WAU (7d)"]}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", color: "var(--text-secondary)" }}
              formatter={(value: string) => (value === "dau" ? "DAU" : "WAU (7-day)")}
            />
            <Area type="monotone" dataKey="wau" stroke="#06B6D4" fillOpacity={1} fill="url(#wauGrad)" strokeWidth={1.5} />
            <Area type="monotone" dataKey="dau" stroke="#8B5CF6" fillOpacity={1} fill="url(#dauGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-center py-12 font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
          No DAU data available yet.
        </div>
      )}
    </div>
  );
};

export default DauChart;
