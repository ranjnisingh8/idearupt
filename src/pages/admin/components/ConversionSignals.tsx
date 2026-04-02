import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, RefreshCw, Flame, Eye, Bookmark, CheckCircle2, FileText, CalendarDays } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import ExportButton from "./ExportButton";
import type { ConversionSignalUser } from "../types";

const FEATURE_LABELS: Record<string, string> = {
  validation: "Validate",
  blueprint: "Blueprint",
  competitors: "Competitors",
  "validate-idea": "Validate",
  "analyze-competitors": "Competitors",
  "generate-blueprint": "Blueprint",
  "generate-use-cases": "Use Cases",
  "match-ideas": "Match",
};

interface Props {
  onUserClick: (userId: string, email: string | null) => void;
}

const ConversionSignals = ({ onUserClick }: Props) => {
  const [users, setUsers] = useState<ConversionSignalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [hotOnly, setHotOnly] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("admin_get_conversion_signals", { result_limit: 50 });
      setUsers((data as ConversionSignalUser[]) || []);
    } catch {
      // RPC may not be deployed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    return hotOnly ? users.filter(u => u.is_hot_lead) : users;
  }, [users, hotOnly]);

  const hotCount = users.filter(u => u.is_hot_lead).length;

  const getScoreColor = (score: number): string => {
    if (score >= 50) return "#10B981";
    if (score >= 25) return "#F59E0B";
    return "var(--text-secondary)";
  };

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
          <Target className="w-5 h-5" style={{ color: "#EF4444" }} />
          Conversion Signals
        </h2>
        <div className="flex items-center gap-2">
          <ExportButton data={users} filename="conversion-signals" />
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

      {/* Summary + filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <span className="font-body text-xs" style={{ color: "var(--text-secondary)" }}>
            {users.length} scored users
          </span>
          {hotCount > 0 && (
            <span
              className="flex items-center gap-1 font-body text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ color: "#EF4444", background: "rgba(239,68,68,0.12)" }}
            >
              <Flame className="w-3 h-3" /> {hotCount} hot leads
            </span>
          )}
        </div>
        <button
          onClick={() => setHotOnly(!hotOnly)}
          className="font-body text-[10px] px-2.5 py-1 rounded-md transition-colors"
          style={{
            color: hotOnly ? "#EF4444" : "var(--text-tertiary)",
            background: hotOnly ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${hotOnly ? "rgba(239,68,68,0.2)" : "var(--border-subtle)"}`,
          }}
        >
          {hotOnly ? "Showing hot leads" : "Show hot leads only"}
        </button>
      </div>

      {/* Table */}
      <div className="surface-card p-3.5 sm:p-4">
        {/* Header */}
        <div
          className="hidden lg:grid lg:grid-cols-[1fr_65px_50px_50px_50px_50px_50px_100px] gap-2 px-2 pb-2 mb-1"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {["User", "Score", "Saves", "Valid.", "BPs", "Views", "Days", "Features"].map(h => (
            <span key={h} className="font-body text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {h}
            </span>
          ))}
        </div>

        <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {filtered.map((user, i) => (
              <motion.div
                key={user.user_id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.01 }}
                onClick={() => onUserClick(user.user_id, user.email)}
                className="grid grid-cols-[1fr_auto] lg:grid-cols-[1fr_65px_50px_50px_50px_50px_50px_100px] gap-2 items-center py-2 px-2 rounded-md hover:bg-white/[0.04] transition-colors cursor-pointer"
                style={{ borderLeft: user.is_hot_lead ? "3px solid #EF4444" : "3px solid transparent" }}
              >
                {/* User */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{
                        background: user.is_hot_lead
                          ? "linear-gradient(135deg, rgba(239,68,68,0.4), rgba(245,158,11,0.4))"
                          : "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(6,182,212,0.3))",
                        color: "var(--text-primary)",
                      }}
                    >
                      {user.is_hot_lead ? <Flame className="w-3 h-3" style={{ color: "#EF4444" }} /> : (user.email || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="font-body text-xs truncate block" style={{ color: "var(--text-primary)" }}>
                        {user.email || "—"}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className="font-body text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            color: user.subscription_status === "trial" ? "#F59E0B" : "var(--text-tertiary)",
                            background: user.subscription_status === "trial" ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)",
                          }}
                        >
                          {user.subscription_status || "free"}
                        </span>
                        {user.current_streak > 0 && (
                          <span className="flex items-center gap-0.5 font-body text-[9px]" style={{ color: "#F59E0B" }}>
                            <Flame className="w-2.5 h-2.5" /> {user.current_streak}d streak
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Mobile metrics */}
                  <div className="lg:hidden flex items-center gap-3 mt-1.5 ml-8 flex-wrap">
                    <span className="flex items-center gap-0.5 font-body text-[10px]" style={{ color: "var(--text-secondary)" }}>
                      <Bookmark className="w-3 h-3" /> {user.saves_count}
                    </span>
                    <span className="flex items-center gap-0.5 font-body text-[10px]" style={{ color: "var(--text-secondary)" }}>
                      <CheckCircle2 className="w-3 h-3" /> {user.validations_count}
                    </span>
                    <span className="flex items-center gap-0.5 font-body text-[10px]" style={{ color: "var(--text-secondary)" }}>
                      <FileText className="w-3 h-3" /> {user.blueprints_count}
                    </span>
                    <span className="flex items-center gap-0.5 font-body text-[10px]" style={{ color: "var(--text-secondary)" }}>
                      <CalendarDays className="w-3 h-3" /> {user.active_days}d
                    </span>
                  </div>
                </div>

                {/* Score - mobile */}
                <div className="lg:hidden flex flex-col items-end">
                  <span className="font-heading text-sm font-bold tabular-nums" style={{ color: getScoreColor(user.conversion_score) }}>
                    {user.conversion_score}
                  </span>
                </div>

                {/* Desktop columns */}
                <span className="hidden lg:block font-heading text-sm font-bold tabular-nums" style={{ color: getScoreColor(user.conversion_score) }}>
                  {user.conversion_score}
                </span>
                <span className="hidden lg:flex items-center gap-1 font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  <Bookmark className="w-3 h-3 opacity-50" /> {user.saves_count}
                </span>
                <span className="hidden lg:flex items-center gap-1 font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  <CheckCircle2 className="w-3 h-3 opacity-50" /> {user.validations_count}
                </span>
                <span className="hidden lg:flex items-center gap-1 font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  <FileText className="w-3 h-3 opacity-50" /> {user.blueprints_count}
                </span>
                <span className="hidden lg:flex items-center gap-1 font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  <Eye className="w-3 h-3 opacity-50" /> {user.ideas_viewed}
                </span>
                <span className="hidden lg:flex items-center gap-1 font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  <CalendarDays className="w-3 h-3 opacity-50" /> {user.active_days}
                </span>
                <div className="hidden lg:flex flex-wrap gap-1">
                  {(user.features_used || []).slice(0, 3).map(f => (
                    <span
                      key={f}
                      className="font-body text-[8px] px-1.5 py-0.5 rounded-full"
                      style={{ color: "#8B5CF6", background: "rgba(139,92,246,0.1)" }}
                    >
                      {FEATURE_LABELS[f] || f}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-8 font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
            {hotOnly ? "No hot leads found. Try removing the filter." : "No conversion data yet."}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversionSignals;
