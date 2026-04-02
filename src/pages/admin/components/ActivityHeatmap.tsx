import { useState, useEffect, useCallback, useMemo } from "react";
import { Grid3X3, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import ExportButton from "./ExportButton";
import type { HeatmapCell } from "../types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return "12a";
  if (i < 12) return `${i}a`;
  if (i === 12) return "12p";
  return `${i - 12}p`;
});

const getCellColor = (count: number, max: number): string => {
  if (count === 0 || max === 0) return "rgba(255,255,255,0.02)";
  const intensity = Math.min(count / max, 1);
  const opacity = 0.06 + intensity * 0.54;
  return `rgba(139, 92, 246, ${opacity})`;
};

const ActivityHeatmap = () => {
  const [data, setData] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data: raw } = await supabase.rpc("admin_get_activity_heatmap");
      setData((raw as HeatmapCell[]) || []);
    } catch {
      // RPC may not be deployed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const { grid, maxCount } = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let mx = 0;
    data.forEach(c => {
      g[c.day_of_week][c.hour_of_day] = c.event_count;
      if (c.event_count > mx) mx = c.event_count;
    });
    return { grid: g, maxCount: mx };
  }, [data]);

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
        <h2
          className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <Grid3X3 className="w-4 h-4" style={{ color: "#8B5CF6" }} />
          Activity Heatmap
          <span className="font-body text-[10px] font-normal" style={{ color: "var(--text-tertiary)" }}>(UTC)</span>
        </h2>
        <div className="flex items-center gap-2">
          <ExportButton data={data} filename="activity-heatmap" />
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="font-body text-[10px] px-2 py-1 rounded-md hover:bg-white/[0.05] transition-colors"
            style={{ color: "var(--text-tertiary)" }}
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {data.length > 0 ? (
        <div className="overflow-x-auto pb-2">
          {/* Hour labels row */}
          <div className="flex items-center gap-[2px] mb-[2px] ml-10">
            {HOUR_LABELS.map((h, i) => (
              <div
                key={i}
                className="w-6 h-4 sm:w-7 sm:h-5 flex items-center justify-center font-body text-[8px] sm:text-[9px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {i % 3 === 0 ? h : ""}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {DAY_LABELS.map((day, dayIdx) => (
            <div key={day} className="flex items-center gap-[2px] mb-[2px]">
              <div
                className="w-10 text-right pr-2 font-body text-[10px] sm:text-[11px] flex-shrink-0"
                style={{ color: "var(--text-secondary)" }}
              >
                {day}
              </div>
              {Array.from({ length: 24 }, (_, hourIdx) => {
                const count = grid[dayIdx][hourIdx];
                return (
                  <motion.div
                    key={hourIdx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: (dayIdx * 24 + hourIdx) * 0.002 }}
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-sm cursor-default relative group"
                    style={{ background: getCellColor(count, maxCount) }}
                    title={`${day} ${HOUR_LABELS[hourIdx]} — ${count} events`}
                  >
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 pointer-events-none">
                      <div
                        className="px-2 py-1 rounded text-[10px] font-body whitespace-nowrap"
                        style={{
                          background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {day} {HOUR_LABELS[hourIdx]} &mdash; {count.toLocaleString()} events
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 ml-10">
            <span className="font-body text-[9px]" style={{ color: "var(--text-tertiary)" }}>Less</span>
            {[0, 0.15, 0.3, 0.5, 0.75, 1].map((intensity, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-sm"
                style={{
                  background: intensity === 0
                    ? "rgba(255,255,255,0.02)"
                    : `rgba(139,92,246,${0.06 + intensity * 0.54})`,
                }}
              />
            ))}
            <span className="font-body text-[9px]" style={{ color: "var(--text-tertiary)" }}>More</span>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
          No activity data for this period.
        </div>
      )}
    </div>
  );
};

export default ActivityHeatmap;
