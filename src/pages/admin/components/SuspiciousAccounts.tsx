import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Fingerprint, Wifi, RefreshCw, ChevronDown, ChevronUp, Ban } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface ClusterEntry {
  device_fingerprint?: string;
  signup_ip?: string;
  account_count: number;
  emails: string[];
  signup_dates: string[];
  statuses: string[];
  banned: boolean[];
}

const statusColor = (s: string | null, isBanned?: boolean): { color: string; bg: string } => {
  if (isBanned || s?.startsWith("banned_was_")) return { color: "#DC2626", bg: "rgba(220,38,38,0.15)" };
  if (s === "pro" || s === "paid") return { color: "#10B981", bg: "rgba(16,185,129,0.12)" };
  if (s === "trial") return { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" };
  if (s === "churned") return { color: "#EF4444", bg: "rgba(239,68,68,0.12)" };
  return { color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.05)" };
};

const SuspiciousAccounts = () => {
  const [fpDupes, setFpDupes] = useState<ClusterEntry[]>([]);
  const [ipClusters, setIpClusters] = useState<ClusterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIp, setShowIp] = useState(false);
  const [banning, setBanning] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("admin_get_suspicious_accounts");
      if (data) {
        setFpDupes((data as any).fingerprint_dupes || []);
        setIpClusters((data as any).ip_clusters || []);
      }
    } catch {
      // RPC may not be deployed yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBanCluster = async (emails: string[], clusterKey: string) => {
    const unbannedEmails = emails.filter((_, i) => {
      const cluster = [...fpDupes, ...ipClusters].find(
        (c) => (c.device_fingerprint || c.signup_ip || c.emails.join(",")) === clusterKey
      );
      return cluster && !cluster.banned?.[i];
    });

    if (unbannedEmails.length === 0) {
      toast.info("All accounts in this cluster are already banned.");
      return;
    }

    if (!confirm(`Ban ${unbannedEmails.length} account(s) in this cluster?\n\nThis will:\n- Block all logins\n- Stop all API access\n- Exclude from all emails\n\nAccounts:\n${unbannedEmails.join("\n")}`)) return;

    setBanning(clusterKey);
    try {
      const { data, error } = await supabase.rpc("admin_ban_cluster", {
        p_emails: unbannedEmails,
        p_reason: "multi-account abuse - admin action",
      });
      if (error) throw error;
      toast.success(`Banned ${(data as any)?.banned_count || unbannedEmails.length} account(s)`);
      setLoading(true);
      fetchData();
    } catch (err: any) {
      toast.error(`Ban failed: ${err?.message || "Unknown error"}`);
    } finally {
      setBanning(null);
    }
  };

  if (loading) {
    return (
      <div className="surface-card p-6 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "var(--accent-purple)" }} />
      </div>
    );
  }

  if (fpDupes.length === 0 && ipClusters.length === 0) {
    return (
      <div className="surface-card p-6 text-center">
        <ShieldAlert className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
        <p className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          No suspicious accounts
        </p>
        <p className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
          Duplicate fingerprints and IP clusters will appear here.
        </p>
      </div>
    );
  }

  const renderCluster = (entry: ClusterEntry, idx: number, type: "fp" | "ip") => {
    const clusterKey = entry.device_fingerprint || entry.signup_ip || entry.emails.join(",");
    const allBanned = entry.banned?.length > 0 && entry.banned.every(Boolean);
    const isBanning = banning === clusterKey;

    return (
      <motion.div
        key={`${type}-${idx}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-lg p-3"
        style={{
          background: allBanned ? "rgba(220,38,38,0.04)" : "rgba(255,255,255,0.02)",
          border: `1px solid ${allBanned ? "rgba(220,38,38,0.2)" : "var(--border-subtle)"}`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {type === "fp" ? (
              <Fingerprint className="w-3.5 h-3.5" style={{ color: allBanned ? "#DC2626" : "#F59E0B" }} />
            ) : (
              <Wifi className="w-3.5 h-3.5" style={{ color: allBanned ? "#DC2626" : "#06B6D4" }} />
            )}
            <span className="font-body text-[10px] font-mono truncate max-w-[200px]" style={{ color: "var(--text-tertiary)" }}>
              {type === "fp"
                ? `${entry.device_fingerprint?.slice(0, 12)}...`
                : entry.signup_ip}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="font-body text-[10px] px-1.5 py-0.5 rounded-md font-medium"
              style={{ background: "rgba(239,68,68,0.12)", color: "#F87171" }}
            >
              {entry.account_count} accounts
            </span>
            {allBanned ? (
              <span
                className="font-body text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                style={{ background: "rgba(220,38,38,0.15)", color: "#DC2626" }}
              >
                ALL BANNED
              </span>
            ) : (
              <button
                onClick={() => handleBanCluster(entry.emails, clusterKey)}
                disabled={isBanning}
                className="font-body text-[10px] px-1.5 py-0.5 rounded-md font-medium transition-colors hover:opacity-80"
                style={{
                  background: "rgba(220,38,38,0.15)",
                  color: "#F87171",
                  opacity: isBanning ? 0.5 : 1,
                  cursor: isBanning ? "wait" : "pointer",
                }}
              >
                <Ban className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                {isBanning ? "Banning..." : "Ban"}
              </button>
            )}
          </div>
        </div>
        <div className="space-y-1">
          {entry.emails.map((email, i) => {
            const isBannedUser = entry.banned?.[i];
            const sc = statusColor(entry.statuses[i], isBannedUser);
            const displayStatus = isBannedUser ? "BANNED" : (entry.statuses[i] || "free");
            return (
              <div key={i} className="flex items-center justify-between gap-2">
                <span
                  className="font-body text-xs truncate"
                  style={{ color: isBannedUser ? "var(--text-tertiary)" : "var(--text-primary)", textDecoration: isBannedUser ? "line-through" : "none" }}
                >
                  {email || "\u2014"}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="font-body text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ color: sc.color, background: sc.bg }}
                  >
                    {displayStatus}
                  </span>
                  <span className="font-body text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                    {entry.signup_dates[i]
                      ? format(new Date(entry.signup_dates[i]), "MMM d")
                      : "\u2014"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="font-heading text-base sm:text-lg font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <ShieldAlert className="w-5 h-5" style={{ color: "#F59E0B" }} />
          Suspicious Accounts
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

      {/* Fingerprint Duplicates */}
      {fpDupes.length > 0 && (
        <div className="surface-card p-3.5 sm:p-4">
          <h3
            className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2 mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            <Fingerprint className="w-4 h-4" style={{ color: "#F59E0B" }} />
            Same Device, Different Emails ({fpDupes.length})
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <AnimatePresence initial={false}>
              {fpDupes.map((entry, i) => renderCluster(entry, i, "fp"))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* IP Clusters (collapsible) */}
      <div className="surface-card p-3.5 sm:p-4">
        <button
          onClick={() => setShowIp(!showIp)}
          className="w-full flex items-center justify-between"
        >
          <h3
            className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}
          >
            <Wifi className="w-4 h-4" style={{ color: "#06B6D4" }} />
            IP Clusters — 3+ Accounts ({ipClusters.length})
          </h3>
          {showIp ? (
            <ChevronUp className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
          )}
        </button>

        <AnimatePresence>
          {showIp && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {ipClusters.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto mt-3">
                  {ipClusters.map((entry, i) => renderCluster(entry, i, "ip"))}
                </div>
              ) : (
                <div className="text-center py-6 font-body text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                  No IP clusters detected. IPs are a soft signal — many users share office/home IPs.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SuspiciousAccounts;
