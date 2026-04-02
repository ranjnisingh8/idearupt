import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { CalendarDays, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import ExportButton from "./ExportButton";
import type { RetentionCohort } from "../types";

const getCellColor = (pct: number): string => {
  if (pct <= 0) return "rgba(255,255,255,0.02)";
  const opacity = Math.min(0.08 + (pct / 100) * 0.52, 0.6);
  return `rgba(139, 92, 246, ${opacity})`;
};

const RetentionCohortMatrix = () => {
  const [cohorts, setCohorts] = useState<RetentionCohort[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("admin_get_retention_cohorts", { num_weeks: 8 });
      setCohorts((data as RetentionCohort[]) || []);
    } catch {
      // RPC may not be deployed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Determine max weeks elapsed for each cohort
  const maxWeeksPossible = useMemo(() => {
    const now = new Date();
    return cohorts.map(c => {
      try {
        const weekStart = new Date(c.cohort_week);
        return Math.floor((now.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      } catch { return 0; }
    });
  }, [cohorts]);

  // Max week columns to show
  const maxWeek = Math.min(Math.max(...maxWeeksPossible, 0), 8);
  const weekCols = Array.from({ length: maxWeek + 1 }, (_, i) => i);

  // Build flat export data
  const exportData = useMemo(() => {
    return cohorts.flatMap(c => {
      const retMap = new Map(c.retention.map(r => [r.week_number, r]));
      return weekCols.map(w => ({
        cohort_week: c.cohort_week,
        cohort_size: c.cohort_size,
        week_number: w,
        active_users: retMap.get(w)?.active_users ?? 0,
        retention_pct: retMap.get(w)?.retention_pct ?? 0,
      }));
    });
  }, [cohorts, weekCols]);

  if (loading) {
    return (
      <div className="surface-card p-6 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "var(--accent-purple)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="font-heading text-base sm:text-lg font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <CalendarDays className="w-5 h-5" style={{ color: "#06B6D4" }} />
          Retention Cohort Matrix
        </h2>
        <div className="flex items-center gap-2">
          <ExportButton data={exportData} filename="retention-cohorts" />
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="font-body text-[10px] px-2 py-1 rounded-md hover:bg-white/[0.05] transition-colors"
            style={{ color: "var(--text-tertiary)" }}
          >
            <RefreshCw className="w-3 h-3 inline mr-1" />
            Refresh
          </button>
        </div>
      </div>

      <div className="surface-card p-3.5 sm:p-4">
        {cohorts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  <th
                    className="font-body text-[10px] uppercase tracking-wider text-left py-2 px-2"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Cohort
                  </th>
                  <th
                    className="font-body text-[10px] uppercase tracking-wider text-center py-2 px-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Users
                  </th>
                  {weekCols.map(w => (
                    <th
                      key={w}
                      className="font-body text-[10px] uppercase tracking-wider text-center py-2 px-1"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Wk {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort, ci) => {
                  const retMap = new Map(cohort.retention.map(r => [r.week_number, r]));
                  const maxWeekForCohort = maxWeeksPossible[ci] ?? 0;

                  return (
                    <motion.tr
                      key={cohort.cohort_week}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: ci * 0.05 }}
                    >
                      <td
                        className="font-body text-[11px] py-1.5 px-2 whitespace-nowrap"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {(() => { try { return format(new Date(cohort.cohort_week), "MMM d"); } catch { return cohort.cohort_week; } })()}
                      </td>
                      <td
                        className="font-body text-[11px] py-1.5 px-1 text-center tabular-nums font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {cohort.cohort_size}
                      </td>
                      {weekCols.map(w => {
                        const ret = retMap.get(w);
                        const hasElapsed = w <= maxWeekForCohort;

                        if (!hasElapsed) {
                          return (
                            <td key={w} className="py-1.5 px-1 text-center">
                              <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)", opacity: 0.3 }}>—</span>
                            </td>
                          );
                        }

                        const pct = ret?.retention_pct ?? 0;
                        return (
                          <td key={w} className="py-1.5 px-1">
                            <div
                              className="rounded-sm py-1 text-center font-body text-[10px] sm:text-[11px] font-medium tabular-nums"
                              style={{
                                background: getCellColor(pct),
                                color: pct >= 50 ? "var(--text-primary)" : pct > 0 ? "var(--text-secondary)" : "var(--text-tertiary)",
                              }}
                              title={`${ret?.active_users ?? 0} users (${pct}%)`}
                            >
                              {pct > 0 ? `${pct}%` : "0%"}
                            </div>
                          </td>
                        );
                      })}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-3">
              <span className="font-body text-[9px]" style={{ color: "var(--text-tertiary)" }}>0%</span>
              {[0, 15, 30, 50, 75, 100].map((pct, i) => (
                <div key={i} className="w-4 h-4 rounded-sm" style={{ background: getCellColor(pct) }} />
              ))}
              <span className="font-body text-[9px]" style={{ color: "var(--text-tertiary)" }}>100%</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
            Not enough data for cohort analysis yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default RetentionCohortMatrix;
