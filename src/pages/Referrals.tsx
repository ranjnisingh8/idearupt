import { useState } from "react";
import { motion } from "framer-motion";
import { Gift, Copy, Check, Users, MousePointerClick, DollarSign, TrendingUp, ArrowRight, RefreshCw } from "lucide-react";
import { useReferral } from "@/hooks/useReferral";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

const Referrals = () => {
  const { stats, history, loading, refresh } = useReferral();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const referralLink = stats.referral_code
    ? `https://idearupt.ai/?ref=${stats.referral_code}`
    : "";

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast({ title: "Link copied!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "paid":
        return { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)", color: "#34D399" };
      case "approved":
        return { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)", color: "#60A5FA" };
      default:
        return { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", color: "#FBBF24" };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "var(--accent-purple)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <div className="container mx-auto px-4 py-6 sm:py-8 max-w-3xl">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1
                className="font-heading text-2xl sm:text-3xl font-bold tracking-[-0.02em]"
                style={{ color: "var(--text-primary)" }}
              >
                Referrals
              </h1>
              <p className="font-body text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                Earn 20% commission on every referral that converts
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg transition-opacity hover:opacity-80"
              style={{ color: "var(--text-tertiary)" }}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </motion.div>

        {/* Referral Link Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="surface-card p-5 sm:p-6 mb-5"
          style={{ border: "1px solid var(--accent-purple)", boxShadow: "0 0 30px rgba(124,106,237,0.08)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-5 h-5" style={{ color: "var(--accent-purple-light)" }} strokeWidth={1.5} />
            <span className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Your Referral Link
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 px-3 py-2.5 rounded-lg font-mono text-sm truncate"
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              {referralLink || "Loading..."}
            </div>
            <button
              onClick={handleCopy}
              disabled={!referralLink}
              className="px-4 py-2.5 rounded-lg font-heading text-xs font-semibold text-white flex items-center gap-1.5 transition-all hover:opacity-90 shrink-0"
              style={{ background: copied ? "#10B981" : "var(--accent-purple)" }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="font-body text-xs mt-2.5" style={{ color: "var(--text-tertiary)" }}>
            Share this link. When someone signs up and subscribes, you earn 20% of their payment.
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Clicks", value: stats.total_clicks, icon: MousePointerClick, color: "#60A5FA" },
            { label: "Signups", value: stats.total_signups, icon: Users, color: "#A78BFA" },
            { label: "Conversions", value: stats.total_conversions, icon: TrendingUp, color: "#34D399" },
            { label: "Earnings", value: `$${stats.total_earnings.toFixed(2)}`, icon: DollarSign, color: "#FBBF24" },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
                className="surface-card p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: `${stat.color}10` }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: stat.color }} strokeWidth={1.5} />
                  </div>
                </div>
                <p className="font-mono text-xl sm:text-2xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {stat.value}
                </p>
                <p className="font-body text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {stat.label}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Earnings Breakdown */}
        {stats.total_earnings > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="surface-card p-4 sm:p-5 mb-5"
          >
            <h3 className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Earnings Breakdown
            </h3>
            <div className="flex items-center gap-4">
              <div>
                <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>Pending</p>
                <p className="font-mono text-lg font-bold" style={{ color: "#FBBF24" }}>
                  ${stats.pending_earnings.toFixed(2)}
                </p>
              </div>
              <div className="w-px h-8" style={{ background: "var(--border-subtle)" }} />
              <div>
                <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>Paid</p>
                <p className="font-mono text-lg font-bold" style={{ color: "#34D399" }}>
                  ${stats.paid_earnings.toFixed(2)}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Commission History */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="surface-card p-4 sm:p-5 mb-6"
        >
          <h3 className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Referral History
          </h3>

          {history.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--text-tertiary)" }} strokeWidth={1} />
              <p className="font-body text-sm" style={{ color: "var(--text-secondary)" }}>
                No referrals yet
              </p>
              <p className="font-body text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                Share your link to start earning
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((event) => {
                const statusStyle = getStatusStyle(event.commission_status);
                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: event.event_type === "conversion" ? "rgba(16,185,129,0.08)" : "rgba(139,92,246,0.08)",
                        }}
                      >
                        {event.event_type === "conversion" ? (
                          <DollarSign className="w-3.5 h-3.5" style={{ color: "#34D399" }} strokeWidth={1.5} />
                        ) : (
                          <Users className="w-3.5 h-3.5" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-body text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {event.referred_email}
                        </p>
                        <p className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                          {event.event_type === "conversion" ? "Converted" : "Signed up"} {"\u00B7"}{" "}
                          {format(new Date(event.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {event.event_type === "conversion" && (
                        <span className="font-mono text-xs font-bold" style={{ color: "#34D399" }}>
                          +${event.commission_amount.toFixed(2)}
                        </span>
                      )}
                      <span
                        className="font-body text-[10px] font-medium px-2 py-0.5 rounded-full capitalize"
                        style={{
                          background: statusStyle.bg,
                          border: `1px solid ${statusStyle.border}`,
                          color: statusStyle.color,
                        }}
                      >
                        {event.commission_status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* How It Works */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="surface-card p-5 sm:p-6"
        >
          <h3 className="font-heading text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            How It Works
          </h3>
          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "Share your link",
                desc: "Send your referral link to friends, post it on social media, or include it in your content.",
              },
              {
                step: "2",
                title: "They sign up",
                desc: "When someone clicks your link and creates an account, they're tracked as your referral.",
              },
              {
                step: "3",
                title: "Earn 20% commission",
                desc: "When your referral subscribes to Pro, you earn 20% of every payment they make.",
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "rgba(124,106,237,0.1)" }}
                >
                  <span className="font-heading text-xs font-bold" style={{ color: "var(--accent-purple-light)" }}>
                    {item.step}
                  </span>
                </div>
                <div>
                  <p className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {item.title}
                  </p>
                  <p className="font-body text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
};

export default Referrals;
