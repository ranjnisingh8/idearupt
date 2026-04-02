import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard, Clock, Users, TrendingUp, CheckCircle, XCircle,
  RefreshCw, ChevronDown, ChevronUp, AlertTriangle, DollarSign,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";

// ─── Types ──────────────────────────────────────────────────

interface CardTrialUser {
  id: string;
  email: string | null;
  created_at: string;
  plan_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  subscription_status: string | null;
  ls_subscription_id: string | null;
}

interface CardTrialStats {
  total: number;
  onTrial: number;
  active: number;
  cancelled: number;
  pastDue: number;
  noPlan: number;
  conversionRate: string;
}

// ─── Helpers ────────────────────────────────────────────────

const fmtDate = (d: string | null): string => {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d"); } catch { return "—"; }
};

const timeAgo = (d: string | null): string => {
  if (!d) return "—";
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return "—"; }
};

const getPlanBadge = (status: string | null, cancelAtEnd: boolean): { label: string; color: string; bg: string } => {
  switch (status) {
    case "trial":
      return { label: "🟢 Trial", color: "#10B981", bg: "rgba(16,185,129,0.12)" };
    case "active":
      return cancelAtEnd
        ? { label: "🟡 Cancelling", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" }
        : { label: "💰 Active", color: "#10B981", bg: "rgba(16,185,129,0.12)" };
    case "cancelled":
      return { label: "🔴 Cancelled", color: "#EF4444", bg: "rgba(239,68,68,0.12)" };
    case "past_due":
      return { label: "⚠️ Past Due", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" };
    case "free":
      return { label: "⚪ Free", color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.05)" };
    default:
      return { label: "⬜ None", color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.05)" };
  }
};

const getDaysLeft = (endDate: string | null): number | null => {
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// ─── Component ──────────────────────────────────────────────

const CardTrialAnalytics = () => {
  const [users, setUsers] = useState<CardTrialUser[]>([]);
  const [stats, setStats] = useState<CardTrialStats>({
    total: 0, onTrial: 0, active: 0, cancelled: 0, pastDue: 0, noPlan: 0, conversionRate: "0%",
  });
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "trial" | "active" | "cancelled" | "past_due" | "none">("all");

  const fetchData = useCallback(async () => {
    try {
      // Both queries in parallel via SECURITY DEFINER RPCs (bypass RLS)
      const [usersRes, statsRes] = await Promise.all([
        supabase.rpc("admin_get_card_trial_users"),
        supabase.rpc("admin_get_card_trial_stats"),
      ]);

      // Users
      setUsers((usersRes.data as CardTrialUser[]) || []);

      // Stats (server-computed)
      if (statsRes.data) {
        const s = statsRes.data as Record<string, number>;
        setStats({
          total: s.total || 0,
          onTrial: s.on_trial || 0,
          active: s.paid || s.active || 0,
          cancelled: s.cancelled || 0,
          pastDue: s.past_due || 0,
          noPlan: s.no_plan || 0,
          conversionRate: `${s.conversion_rate || 0}%`,
        });
      }
    } catch {
      // Silently fail — RPCs might not be deployed yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredUsers = filter === "all"
    ? users
    : filter === "none"
      ? users.filter((u) => !u.plan_status || u.plan_status === "none")
      : users.filter((u) => u.plan_status === filter);

  const displayedUsers = showAll ? filteredUsers : filteredUsers.slice(0, 20);

  if (loading) {
    return (
      <div className="surface-card p-6 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#F59E0B" }} />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h2
          className="font-heading text-base sm:text-lg font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <CreditCard className="w-5 h-5" style={{ color: "#F59E0B" }} />
          Card-Required Trial Analytics
        </h2>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="font-body text-[10px] px-2 py-1 rounded-md hover:bg-white/[0.05] transition-colors"
          style={{ color: "var(--text-tertiary)" }}
        >
          <RefreshCw className="w-3 h-3 inline mr-1" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
        {[
          { label: "Total Users", value: stats.total, icon: <Users className="w-4 h-4" />, color: "#8B5CF6" },
          { label: "On Trial", value: stats.onTrial, icon: <Clock className="w-4 h-4" />, color: "#F59E0B" },
          { label: "Active Paid", value: stats.active, icon: <CheckCircle className="w-4 h-4" />, color: "#10B981" },
          { label: "Cancelled", value: stats.cancelled, icon: <XCircle className="w-4 h-4" />, color: "#EF4444" },
          { label: "Past Due", value: stats.pastDue, icon: <AlertTriangle className="w-4 h-4" />, color: "#F97316" },
          { label: "No Plan", value: stats.noPlan, icon: <Users className="w-4 h-4" />, color: "var(--text-tertiary)" },
          { label: "Trial→Paid", value: stats.conversionRate, icon: <TrendingUp className="w-4 h-4" />, color: "#06B6D4" },
        ].map((card) => (
          <motion.div
            key={card.label}
            className="surface-card p-3 sm:p-3.5 relative overflow-hidden cursor-pointer hover:bg-white/[0.03] transition-colors"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => {
              if (card.label === "On Trial") setFilter(filter === "trial" ? "all" : "trial");
              else if (card.label === "Active Paid") setFilter(filter === "active" ? "all" : "active");
              else if (card.label === "Cancelled") setFilter(filter === "cancelled" ? "all" : "cancelled");
              else if (card.label === "Past Due") setFilter(filter === "past_due" ? "all" : "past_due");
              else if (card.label === "No Plan") setFilter(filter === "none" ? "all" : "none");
              else setFilter("all");
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className="font-body text-[9px] sm:text-[10px] uppercase tracking-wider"
                style={{ color: "var(--text-tertiary)" }}
              >
                {card.label}
              </span>
              <div style={{ color: card.color }} className="opacity-70">{card.icon}</div>
            </div>
            <div
              className="font-heading text-lg sm:text-xl font-bold tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filter indicator */}
      {filter !== "all" && (
        <div className="flex items-center gap-2">
          <span className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Filtering: <strong style={{ color: "var(--text-primary)" }}>{filter === "none" ? "No Plan" : filter}</strong>
          </span>
          <button
            onClick={() => setFilter("all")}
            className="font-body text-[10px] px-2 py-0.5 rounded-md"
            style={{ color: "#8B5CF6", background: "rgba(139,92,246,0.1)" }}
          >
            Clear
          </button>
        </div>
      )}

      {/* User Table */}
      <div className="surface-card p-3.5 sm:p-4">
        <h3
          className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2 mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          <DollarSign className="w-4 h-4" style={{ color: "#F59E0B" }} />
          Users ({filteredUsers.length})
        </h3>

        {/* Table Header */}
        <div
          className="hidden sm:grid sm:grid-cols-[1fr_90px_80px_80px_90px_80px] gap-2 px-2 pb-2 mb-1"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {["Email", "Signed Up", "Plan", "Trial Ends", "Period End", "Days Left"].map((h) => (
            <span
              key={h}
              className="font-body text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-tertiary)" }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* User Rows */}
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {displayedUsers.map((user) => {
              const badge = getPlanBadge(user.plan_status, user.cancel_at_period_end);
              const endDate = user.plan_status === "trial" ? user.trial_ends_at : user.current_period_end;
              const daysLeft = getDaysLeft(endDate);
              const daysColor = daysLeft === null ? "var(--text-tertiary)"
                : daysLeft < 0 ? "#EF4444"
                : daysLeft <= 3 ? "#F59E0B"
                : "#10B981";
              const daysBg = daysLeft === null ? "transparent"
                : daysLeft < 0 ? "rgba(239,68,68,0.12)"
                : daysLeft <= 3 ? "rgba(245,158,11,0.12)"
                : "rgba(16,185,129,0.12)";
              const daysText = daysLeft === null ? "—" : daysLeft < 0 ? "Expired" : `${daysLeft}d`;

              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_90px_80px_80px_90px_80px] gap-2 items-center py-2 px-2 rounded-md hover:bg-white/[0.03] transition-colors"
                >
                  {/* Email */}
                  <div className="min-w-0">
                    <span className="font-body text-xs truncate block" style={{ color: "var(--text-primary)" }}>
                      {user.email || "—"}
                    </span>
                    {/* Mobile: show details inline */}
                    <div className="sm:hidden flex items-center gap-2 mt-0.5 flex-wrap">
                      <span
                        className="font-body text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ color: badge.color, background: badge.bg }}
                      >
                        {badge.label}
                      </span>
                      <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                        {timeAgo(user.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Signed Up */}
                  <span className="hidden sm:block font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {fmtDate(user.created_at)}
                  </span>

                  {/* Plan Status */}
                  <span
                    className="font-body text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap w-fit justify-self-end sm:justify-self-start"
                    style={{ color: badge.color, background: badge.bg }}
                  >
                    {badge.label}
                  </span>

                  {/* Trial Ends */}
                  <span className="hidden sm:block font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {fmtDate(user.trial_ends_at)}
                  </span>

                  {/* Period End */}
                  <span className="hidden sm:block font-body text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {fmtDate(user.current_period_end)}
                  </span>

                  {/* Days Left */}
                  <span
                    className="hidden sm:block font-body text-[10px] px-1.5 py-0.5 rounded-full font-medium text-center w-fit"
                    style={{ color: daysColor, background: daysBg }}
                  >
                    {daysText}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-8 font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
            No users found for this filter.
          </div>
        )}

        {/* Show more / less */}
        {filteredUsers.length > 20 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full mt-2 py-2 font-body text-[11px] rounded-md hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            {showAll ? (
              <>Show less <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>Show all {filteredUsers.length} users <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default CardTrialAnalytics;
