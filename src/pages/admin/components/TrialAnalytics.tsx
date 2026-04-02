import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Clock, AlertTriangle, UserX, CreditCard, TrendingUp,
  Mail, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";

// ─── Types ──────────────────────────────────────────────────

interface TrialUser {
  id: string;
  email: string | null;
  created_at: string;
  trial_ends_at: string | null;
  subscription_status: string | null;
  upgraded_at: string | null;
  plan_status: string | null;
}

interface EmailLogEntry {
  id: string;
  user_id: string;
  email_type: string;
  sent_at: string;
  user_email: string | null;
}

interface TrialStats {
  total: number;
  activeTrial: number;
  expiringIn3Days: number;
  churned: number;
  pro: number;
  conversionRate: string;
}

// ─── Helpers ────────────────────────────────────────────────

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "MMM d");
  } catch {
    return "—";
  }
};

const getDaysLeft = (trialEndsAt: string | null): number | null => {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const getStatusInfo = (
  status: string | null,
  daysLeft: number | null,
  planStatus: string | null = null,
): { label: string; color: string; bg: string } => {
  const ps = planStatus || "none";

  // Card-required trial users have subscription_status='pro' but plan_status='trial'
  // Show them as "On Trial", not "Paid"
  if (ps === "trial") {
    if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3)
      return { label: "🟡 Expiring", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" };
    return { label: "🟢 On Trial", color: "#10B981", bg: "rgba(16,185,129,0.12)" };
  }

  // Actually paid — plan_status='active' (post-trial, charged by LS)
  if (ps === "active") return { label: "💰 Paid", color: "#10B981", bg: "rgba(16,185,129,0.12)" };

  // Cancelled but still has access
  if (ps === "cancelled") return { label: "🟠 Cancelled", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" };

  // Past due payment
  if (ps === "past_due") return { label: "🔴 Past Due", color: "#EF4444", bg: "rgba(239,68,68,0.12)" };

  // Churned / expired (plan_status='free' or legacy 'churned')
  if (ps === "free" || status === "churned" || (status === "trial" && daysLeft !== null && daysLeft < 0))
    return { label: "🔴 Expired", color: "#EF4444", bg: "rgba(239,68,68,0.12)" };

  // Legacy: paid without new plan_status system
  if ((status === "pro" || status === "paid") && ps === "none") return { label: "💰 Paid", color: "#10B981", bg: "rgba(16,185,129,0.12)" };

  // Legacy free-trial (no card) still active
  if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3)
    return { label: "🟡 Expiring", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" };
  if (status === "trial" && daysLeft !== null && daysLeft > 3)
    return { label: "🟢 Active", color: "#10B981", bg: "rgba(16,185,129,0.12)" };

  return { label: "⚪ Free", color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.05)" };
};

const getDaysLeftBadge = (daysLeft: number | null): { text: string; color: string; bg: string } => {
  if (daysLeft === null) return { text: "—", color: "var(--text-tertiary)", bg: "transparent" };
  if (daysLeft < 0) return { text: "Expired", color: "#EF4444", bg: "rgba(239,68,68,0.12)" };
  if (daysLeft === 0) return { text: "Today!", color: "#EF4444", bg: "rgba(239,68,68,0.12)" };
  if (daysLeft <= 3) return { text: `${daysLeft}d`, color: "#F59E0B", bg: "rgba(245,158,11,0.12)" };
  return { text: `${daysLeft}d`, color: "#10B981", bg: "rgba(16,185,129,0.12)" };
};

const emailTypeLabels: Record<string, string> = {
  welcome: "Welcome",
  day3_checkin: "Day 3 Check-in",
  day5_warning: "Day 5 Warning",
  day7_expired: "Trial Ended",
  day10_nudge: "Day 10 Nudge",
  day14_nudge: "Final Reminder",
  // Legacy values (for backward compat with old email_log rows)
  trial_welcome: "Welcome (old)",
  trial_day3: "Day 3 (old)",
  trial_day5: "Day 5 (old)",
  trial_day6: "Last Day (old)",
  trial_expired: "Expired (old)",
  trial_expired_3d: "3d Post (old)",
  trial_expired_7d: "Final (old)",
};

// ─── Component ──────────────────────────────────────────────

const TrialAnalytics = () => {
  const [users, setUsers] = useState<TrialUser[]>([]);
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>([]);
  const [stats, setStats] = useState<TrialStats>({
    total: 0, activeTrial: 0, expiringIn3Days: 0, churned: 0, pro: 0, conversionRate: "0%",
  });
  const [loading, setLoading] = useState(true);
  const [showEmailLog, setShowEmailLog] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // All 3 queries in parallel via SECURITY DEFINER RPCs (bypass RLS)
      const [usersRes, statsRes, logRes] = await Promise.all([
        Promise.resolve(supabase.rpc("admin_get_trial_users")),
        Promise.resolve(supabase.rpc("admin_get_trial_stats")),
        Promise.resolve(supabase.rpc("admin_get_email_log", { result_limit: 50 })),
      ]);

      // Users
      setUsers((usersRes.data as TrialUser[]) || []);

      // Stats (server-computed)
      if (statsRes.data) {
        const s = statsRes.data as Record<string, number>;
        setStats({
          total: s.total || 0,
          activeTrial: s.active_trial || 0,
          expiringIn3Days: s.expiring_3d || 0,
          churned: s.churned || 0,
          pro: s.pro || 0,
          conversionRate: `${s.conversion_rate || 0}%`,
        });
      }

      // Email log (already joined with user emails server-side)
      setEmailLog((logRes.data as EmailLogEntry[]) || []);
    } catch {
      // Silently fail — RPCs might not be deployed yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="surface-card p-6 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "var(--accent-purple)" }} />
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
          <CreditCard className="w-5 h-5" style={{ color: "#8B5CF6" }} />
          Trial & Subscription Analytics
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {[
          { label: "Total Users", value: stats.total, icon: <Users className="w-4 h-4" />, color: "#8B5CF6" },
          { label: "Active Trials", value: stats.activeTrial, icon: <Clock className="w-4 h-4" />, color: "#10B981" },
          { label: "Expiring ≤30d", value: stats.expiringIn3Days, icon: <AlertTriangle className="w-4 h-4" />, color: "#F59E0B" },
          { label: "Expired", value: stats.churned, icon: <UserX className="w-4 h-4" />, color: "#EF4444" },
          { label: "Paid", value: stats.pro, icon: <CreditCard className="w-4 h-4" />, color: "#10B981" },
          { label: "Conversion", value: stats.conversionRate, icon: <TrendingUp className="w-4 h-4" />, color: "#06B6D4" },
        ].map((card) => (
          <motion.div
            key={card.label}
            className="surface-card p-3 sm:p-3.5 relative overflow-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
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

      {/* User Table */}
      <div className="surface-card p-3.5 sm:p-4">
        <h3
          className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2 mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          <Users className="w-4 h-4" style={{ color: "#8B5CF6" }} />
          All Users ({users.length})
        </h3>

        {/* Table Header */}
        <div
          className="hidden sm:grid sm:grid-cols-[1fr_80px_80px_80px_60px_80px] gap-2 px-2 pb-2 mb-1"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {["Email", "Signed Up", "Trial Ends", "Days Left", "Status", "Upgraded"].map((h) => (
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
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {users.map((user) => {
              const daysLeft = getDaysLeft(user.trial_ends_at);
              const statusInfo = getStatusInfo(user.subscription_status, daysLeft, user.plan_status);
              const daysInfo = getDaysLeftBadge(daysLeft);

              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_80px_80px_80px_60px_80px] gap-2 items-center py-2 px-2 rounded-md hover:bg-white/[0.03] transition-colors"
                >
                  {/* Email */}
                  <div className="min-w-0">
                    <span
                      className="font-body text-xs truncate block"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {user.email || "—"}
                    </span>
                    {/* Mobile: show details inline */}
                    <div className="sm:hidden flex items-center gap-2 mt-0.5">
                      <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                        Ends {formatDate(user.trial_ends_at)}
                      </span>
                      <span
                        className="font-body text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ color: daysInfo.color, background: daysInfo.bg }}
                      >
                        {daysInfo.text}
                      </span>
                    </div>
                  </div>

                  {/* Desktop columns */}
                  <span
                    className="hidden sm:block font-body text-[11px] tabular-nums"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {formatDate(user.created_at)}
                  </span>
                  <span
                    className="hidden sm:block font-body text-[11px] tabular-nums"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {formatDate(user.trial_ends_at)}
                  </span>
                  <span
                    className="hidden sm:block font-body text-[10px] px-1.5 py-0.5 rounded-full font-medium text-center w-fit"
                    style={{ color: daysInfo.color, background: daysInfo.bg }}
                  >
                    {daysInfo.text}
                  </span>

                  {/* Status badge — visible on all screens */}
                  <span
                    className="font-body text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap w-fit justify-self-end sm:justify-self-start"
                    style={{ color: statusInfo.color, background: statusInfo.bg }}
                  >
                    {statusInfo.label}
                  </span>

                  {/* Upgraded date (desktop only) */}
                  <span
                    className="hidden sm:block font-body text-[11px] tabular-nums"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {user.upgraded_at ? formatDate(user.upgraded_at) : "—"}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {users.length === 0 && (
          <div className="text-center py-8 font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
            No users found.
          </div>
        )}
      </div>

      {/* Email Log (Collapsible) */}
      <div className="surface-card p-3.5 sm:p-4">
        <button
          onClick={() => setShowEmailLog(!showEmailLog)}
          className="w-full flex items-center justify-between"
        >
          <h3
            className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}
          >
            <Mail className="w-4 h-4" style={{ color: "#06B6D4" }} />
            Email Log ({emailLog.length})
          </h3>
          {showEmailLog ? (
            <ChevronUp className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
          )}
        </button>

        <AnimatePresence>
          {showEmailLog && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {/* Table header */}
              <div
                className="hidden sm:grid sm:grid-cols-[1fr_140px_140px] gap-2 px-2 pb-2 mt-3 mb-1"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                {["Email", "Type", "Sent At"].map((h) => (
                  <span
                    key={h}
                    className="font-body text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {h}
                  </span>
                ))}
              </div>

              <div className="space-y-1 max-h-[300px] overflow-y-auto mt-2">
                {emailLog.length > 0 ? (
                  emailLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_140px_140px] gap-2 items-center py-1.5 px-2 rounded-md hover:bg-white/[0.03] transition-colors"
                    >
                      <span
                        className="font-body text-xs truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {entry.user_email || "—"}
                      </span>
                      <span
                        className="font-body text-[10px] px-2 py-0.5 rounded-full font-medium w-fit"
                        style={{
                          color: "#8B5CF6",
                          background: "rgba(139,92,246,0.12)",
                        }}
                      >
                        {emailTypeLabels[entry.email_type] || entry.email_type}
                      </span>
                      <span
                        className="hidden sm:block font-body text-[11px] tabular-nums"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {format(new Date(entry.sent_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                  ))
                ) : (
                  <div
                    className="text-center py-6 font-body text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    No emails sent yet. The lifecycle cron runs daily at 9:00 AM UTC.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TrialAnalytics;
