import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, RefreshCw, Eye, Bookmark, Share2, ArrowUpDown, Flame, Zap } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { supabase } from "@/lib/supabase";
import ExportButton from "./ExportButton";
import type { LeaderboardUser } from "../types";

const LEVEL_NAMES = ["Curious", "Explorer", "Tinkerer", "Builder", "Hustler", "Operator", "Visionary", "Founder", "Mogul", "Top 1%"];

type SortField = "engagement_score" | "total_saves" | "total_views" | "sessions_count" | "last_active" | "xp";

const getStatusInfo = (status: string | null): { label: string; color: string; bg: string } => {
  if (status === "pro" || status === "paid") return { label: "Pro", color: "#10B981", bg: "rgba(16,185,129,0.12)" };
  if (status === "churned") return { label: "Churned", color: "#EF4444", bg: "rgba(239,68,68,0.12)" };
  if (status === "trial") return { label: "Trial", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" };
  return { label: "Free", color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.05)" };
};

interface Props {
  onUserClick: (userId: string, email: string | null) => void;
}

const EngagementLeaderboard = ({ onUserClick }: Props) => {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("engagement_score");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("admin_get_engagement_leaderboard", { result_limit: 100 });
      setUsers((data as LeaderboardUser[]) || []);
    } catch {
      // RPC may not be deployed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sorted = useMemo(() => {
    const arr = [...users];
    arr.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortField === "last_active") {
        av = a.last_active || "";
        bv = b.last_active || "";
        return sortAsc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
      }
      av = (a as any)[sortField] ?? 0;
      bv = (b as any)[sortField] ?? 0;
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [users, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortHeader = ({ field, label, className = "" }: { field: SortField; label: string; className?: string }) => (
    <button
      onClick={() => handleSort(field)}
      className={`font-body text-[10px] uppercase tracking-wider flex items-center gap-0.5 hover:text-white/60 transition-colors ${className}`}
      style={{ color: sortField === field ? "#8B5CF6" : "var(--text-tertiary)" }}
    >
      {label}
      <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
    </button>
  );

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
          <Trophy className="w-5 h-5" style={{ color: "#F59E0B" }} />
          User Engagement Leaderboard
        </h2>
        <div className="flex items-center gap-2">
          <ExportButton data={users} filename="engagement-leaderboard" />
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

      {/* Table */}
      <div className="surface-card p-3.5 sm:p-4">
        {/* Header row */}
        <div
          className="hidden lg:grid lg:grid-cols-[1fr_70px_55px_55px_55px_65px_80px_80px] gap-2 px-2 pb-2 mb-1"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span className="font-body text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>User</span>
          <SortHeader field="engagement_score" label="Score" />
          <SortHeader field="total_views" label="Views" />
          <SortHeader field="total_saves" label="Saves" />
          <span className="font-body text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Shares</span>
          <SortHeader field="sessions_count" label="Sessions" />
          <SortHeader field="xp" label="XP / Level" />
          <SortHeader field="last_active" label="Last Seen" />
        </div>

        {/* Rows */}
        <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {sorted.map((user, i) => {
              const statusInfo = getStatusInfo(user.subscription_status);
              const lastActiveStr = user.last_active
                ? (() => { try { return formatDistanceToNow(new Date(user.last_active), { addSuffix: true }); } catch { return "—"; } })()
                : "Never";

              return (
                <motion.div
                  key={user.user_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.01 }}
                  onClick={() => onUserClick(user.user_id, user.email)}
                  className="grid grid-cols-[1fr_auto] lg:grid-cols-[1fr_70px_55px_55px_55px_65px_80px_80px] gap-2 items-center py-2 px-2 rounded-md hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                  {/* User info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {/* Avatar */}
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{
                          background: `linear-gradient(135deg, rgba(139,92,246,0.4), rgba(6,182,212,0.4))`,
                          color: "var(--text-primary)",
                        }}
                      >
                        {(user.email || "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="font-body text-xs truncate block" style={{ color: "var(--text-primary)" }}>
                          {user.email || "—"}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="font-body text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ color: statusInfo.color, background: statusInfo.bg }}
                          >
                            {statusInfo.label}
                          </span>
                          <span className="font-body text-[9px]" style={{ color: "var(--text-tertiary)" }}>
                            {(() => { try { return format(new Date(user.created_at), "MMM d"); } catch { return ""; } })()}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Mobile metrics */}
                    <div className="lg:hidden flex items-center gap-3 mt-1.5 ml-8">
                      <span className="flex items-center gap-0.5 font-body text-[10px]" style={{ color: "var(--text-secondary)" }}>
                        <Eye className="w-3 h-3" /> {user.total_views}
                      </span>
                      <span className="flex items-center gap-0.5 font-body text-[10px]" style={{ color: "var(--text-secondary)" }}>
                        <Bookmark className="w-3 h-3" /> {user.total_saves}
                      </span>
                      <span className="flex items-center gap-0.5 font-body text-[10px]" style={{ color: "var(--text-secondary)" }}>
                        <Zap className="w-3 h-3" /> {user.xp} XP
                      </span>
                      {user.current_streak > 0 && (
                        <span className="flex items-center gap-0.5 font-body text-[10px]" style={{ color: "#F59E0B" }}>
                          <Flame className="w-3 h-3" /> {user.current_streak}d
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score - visible on mobile too */}
                  <div className="lg:hidden flex flex-col items-end">
                    <span
                      className="font-heading text-sm font-bold tabular-nums"
                      style={{ color: user.engagement_score >= 50 ? "#10B981" : user.engagement_score >= 20 ? "#F59E0B" : "var(--text-secondary)" }}
                    >
                      {user.engagement_score}
                    </span>
                    <span className="font-body text-[9px]" style={{ color: "var(--text-tertiary)" }}>{lastActiveStr}</span>
                  </div>

                  {/* Desktop columns */}
                  <span
                    className="hidden lg:block font-heading text-sm font-bold tabular-nums"
                    style={{ color: user.engagement_score >= 50 ? "#10B981" : user.engagement_score >= 20 ? "#F59E0B" : "var(--text-secondary)" }}
                  >
                    {user.engagement_score}
                  </span>
                  <span className="hidden lg:flex items-center gap-1 font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    <Eye className="w-3 h-3 opacity-50" /> {user.total_views}
                  </span>
                  <span className="hidden lg:flex items-center gap-1 font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    <Bookmark className="w-3 h-3 opacity-50" /> {user.total_saves}
                  </span>
                  <span className="hidden lg:flex items-center gap-1 font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    <Share2 className="w-3 h-3 opacity-50" /> {user.total_shares}
                  </span>
                  <span className="hidden lg:block font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {user.sessions_count}
                  </span>
                  <div className="hidden lg:flex items-center gap-1">
                    <Zap className="w-3 h-3" style={{ color: "#F59E0B" }} />
                    <span className="font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {user.xp}
                    </span>
                    <span
                      className="font-body text-[8px] px-1 py-0.5 rounded"
                      style={{ color: "#8B5CF6", background: "rgba(139,92,246,0.1)" }}
                    >
                      {LEVEL_NAMES[user.level] || `Lv${user.level}`}
                    </span>
                  </div>
                  <span className="hidden lg:block font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    {lastActiveStr}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {users.length === 0 && (
          <div className="text-center py-8 font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
            No engagement data yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default EngagementLeaderboard;
