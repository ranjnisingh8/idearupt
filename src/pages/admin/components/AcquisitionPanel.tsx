import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Globe, Users, MousePointerClick, DollarSign, TrendingUp, RefreshCw, Eye, BarChart3, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ExportButton from "./ExportButton";

interface SourceRow {
  source: string;
  total_signups: number;
  trial_or_active: number;
  conversions: number;
  from_referral: number;
  trial_rate: number;
}

interface TopReferrer {
  user_id: string;
  email: string;
  referral_code: string;
  clicks: number;
  signups: number;
  conversions: number;
  total_earnings: number;
  pending_earnings: number;
  paid_earnings: number;
}

interface ReferralOverview {
  total_clicks: number;
  total_referred_signups: number;
  total_conversions: number;
  total_commission_pending: number;
  total_commission_paid: number;
  total_commission_all: number;
  total_referral_revenue: number;
  active_referrers: number;
  signup_to_conversion_rate: number;
}

interface VisitorSource {
  source: string;
  total_visits: number;
  unique_sessions: number;
  unique_users: number;
  auth_rate: number;
}

interface TrafficDay {
  day: string;
  total_events: number;
  unique_sessions: number;
  unique_users: number;
  page_views: number;
}

interface TopPage {
  page_url: string;
  views: number;
  unique_sessions: number;
  unique_users: number;
}

interface SignupReferrerRow {
  source: string;
  total_signups: number;
  trial_or_active: number;
  conversions: number;
  trial_rate: number;
}

interface Props {
  onUserClick: (userId: string, email: string | null) => void;
}

const AcquisitionPanel = ({ onUserClick }: Props) => {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [referrers, setReferrers] = useState<TopReferrer[]>([]);
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [visitorSources, setVisitorSources] = useState<VisitorSource[]>([]);
  const [traffic, setTraffic] = useState<TrafficDay[]>([]);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [signupReferrers, setSignupReferrers] = useState<SignupReferrerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [srcRes, refRes, ovRes, vSrcRes, trafRes, pgRes, srRes] = await Promise.all([
        supabase.rpc("admin_get_signups_by_source"),
        supabase.rpc("admin_get_top_referrers", { result_limit: 15 }),
        supabase.rpc("admin_get_referral_overview"),
        supabase.rpc("admin_get_visitor_sources").catch(() => ({ data: null })),
        supabase.rpc("admin_get_visitor_traffic").catch(() => ({ data: null })),
        supabase.rpc("admin_get_top_pages", { result_limit: 15 }).catch(() => ({ data: null })),
        supabase.rpc("admin_get_signups_by_referrer").catch(() => ({ data: null })),
      ]);

      if (srcRes.data) setSources((srcRes.data as SourceRow[]) || []);
      if (refRes.data) setReferrers((refRes.data as TopReferrer[]) || []);
      if (ovRes.data) setOverview(ovRes.data as ReferralOverview);
      if (vSrcRes.data) setVisitorSources((vSrcRes.data as VisitorSource[]) || []);
      if (trafRes.data) setTraffic((trafRes.data as TrafficDay[]) || []);
      if (pgRes.data) setTopPages((pgRes.data as TopPage[]) || []);
      if (srRes.data) setSignupReferrers((srRes.data as SignupReferrerRow[]) || []);
    } catch {
      // RPCs may not be deployed yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getSourceColor = (source: string): string => {
    const colors: Record<string, string> = {
      direct: "#94A3B8",
      reddit: "#FF4500",
      "twitter / x": "#1DA1F2",
      twitter: "#1DA1F2",
      google: "#34A853",
      bing: "#008373",
      referral: "#A78BFA",
      producthunt: "#DA552F",
      hackernews: "#FF6600",
      linkedin: "#0077B5",
      youtube: "#FF0000",
      facebook: "#1877F2",
      instagram: "#E4405F",
      tiktok: "#69C9D0",
      github: "#8B5CF6",
      organic: "#71717A",
      pinterest: "#BD081C",
      duckduckgo: "#DE5833",
    };
    return colors[source.toLowerCase()] || "#71717A";
  };

  if (loading) {
    return (
      <div className="surface-card p-6 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "var(--accent-purple)" }} />
      </div>
    );
  }

  const maxSignups = Math.max(...sources.map(s => s.total_signups), 1);
  const maxVisits = Math.max(...visitorSources.map(v => v.total_visits), 1);
  const maxPageViews = Math.max(...topPages.map(p => p.views), 1);
  const maxRefSignups = Math.max(...signupReferrers.map(s => s.total_signups), 1);

  // Traffic summary from the last 7 days
  const last7Days = traffic.slice(0, 7);
  const totalEvents7d = last7Days.reduce((sum, d) => sum + d.total_events, 0);
  const totalSessions7d = last7Days.reduce((sum, d) => sum + d.unique_sessions, 0);
  const totalUsers7d = last7Days.reduce((sum, d) => sum + d.unique_users, 0);
  const totalPageViews7d = last7Days.reduce((sum, d) => sum + d.page_views, 0);

  // Max bar height for traffic sparkline
  const maxDailySessions = Math.max(...traffic.slice(0, 14).map(d => d.unique_sessions), 1);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5" style={{ color: "var(--accent-purple-light)" }} strokeWidth={1.5} />
          <h2 className="font-heading text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Acquisition & Referrals
          </h2>
        </div>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="p-2 rounded-lg transition-opacity hover:opacity-80"
          style={{ color: "var(--text-tertiary)" }}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ═══════════════════ VISITOR ANALYTICS ═══════════════════ */}

      {/* Traffic Overview (Last 7 Days) */}
      {traffic.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Events (7d)", value: totalEvents7d.toLocaleString(), icon: BarChart3, color: "#60A5FA" },
            { label: "Sessions (7d)", value: totalSessions7d.toLocaleString(), icon: Eye, color: "#A78BFA" },
            { label: "Users (7d)", value: totalUsers7d.toLocaleString(), icon: Users, color: "#34D399" },
            { label: "Page Views (7d)", value: totalPageViews7d.toLocaleString(), icon: FileText, color: "#FBBF24" },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="surface-card p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon className="w-3.5 h-3.5" style={{ color: stat.color }} strokeWidth={1.5} />
                  <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    {stat.label}
                  </span>
                </div>
                <p className="font-mono text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {stat.value}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Daily Traffic Sparkline (Last 14 Days) */}
      {traffic.length > 0 && (
        <div className="surface-card p-4 sm:p-5">
          <h3 className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Daily Sessions (Last 14 Days)
          </h3>
          <div className="flex items-end gap-1 h-20">
            {traffic.slice(0, 14).reverse().map((d, i) => {
              const height = (d.unique_sessions / maxDailySessions) * 100;
              const dateLabel = new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div
                  key={d.day}
                  className="flex-1 group relative"
                  title={`${dateLabel}: ${d.unique_sessions} sessions, ${d.unique_users} users, ${d.page_views} page views`}
                >
                  <motion.div
                    className="w-full rounded-t-sm cursor-default"
                    style={{
                      background: i === traffic.slice(0, 14).length - 1 ? "var(--accent-purple)" : "var(--accent-purple-light)",
                      opacity: i === traffic.slice(0, 14).length - 1 ? 1 : 0.5,
                      minHeight: 2,
                    }}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(height, 3)}%` }}
                    transition={{ duration: 0.4, delay: i * 0.03 }}
                  />
                  {/* Tooltip on hover */}
                  <div
                    className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 pointer-events-none"
                  >
                    <div
                      className="surface-card px-2 py-1 rounded text-center whitespace-nowrap shadow-lg"
                      style={{ border: "1px solid var(--border-subtle)" }}
                    >
                      <p className="font-mono text-[9px] font-bold" style={{ color: "var(--text-primary)" }}>
                        {d.unique_sessions} sessions
                      </p>
                      <p className="font-body text-[8px]" style={{ color: "var(--text-tertiary)" }}>
                        {dateLabel}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-body text-[9px]" style={{ color: "var(--text-tertiary)" }}>
              {traffic.length >= 14
                ? new Date(traffic[13].day).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : traffic.length > 0
                  ? new Date(traffic[traffic.length - 1].day).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : ""}
            </span>
            <span className="font-body text-[9px]" style={{ color: "var(--text-tertiary)" }}>
              {traffic.length > 0
                ? new Date(traffic[0].day).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : ""}
            </span>
          </div>
        </div>
      )}

      {/* Visitor Sources (from page_events referrer) */}
      <div className="surface-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Visitor Sources (Referrer)
          </h3>
          {visitorSources.length > 0 && (
            <ExportButton
              data={visitorSources}
              filename="visitor_sources"
              columns={["source", "total_visits", "unique_sessions", "unique_users"]}
            />
          )}
        </div>

        {visitorSources.length === 0 ? (
          <p className="font-body text-sm text-center py-6" style={{ color: "var(--text-tertiary)" }}>
            No visitor source data yet — data populates from page_events referrer
          </p>
        ) : (
          <div className="space-y-2.5">
            {visitorSources.map((src) => (
              <div key={src.source} className="flex items-center gap-3">
                <div className="w-24 sm:w-28 shrink-0">
                  <p className="font-body text-xs font-medium capitalize truncate" style={{ color: "var(--text-primary)" }}>
                    {src.source}
                  </p>
                </div>
                <div className="flex-1 h-5 rounded-full overflow-hidden relative" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: getSourceColor(src.source), opacity: 0.7 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(src.total_visits / maxVisits) * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                  <span
                    className="absolute inset-y-0 left-2 flex items-center font-mono text-[10px] font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {src.total_visits}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-3 shrink-0 w-36">
                  <span className="font-body text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                    {src.unique_sessions} sess.
                  </span>
                  <span className="font-body text-[10px] tabular-nums" style={{ color: "#60A5FA" }}>
                    {src.unique_users} users
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signups by Landing Referrer */}
      {signupReferrers.length > 0 && (
        <div className="surface-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Signups by Landing Referrer
            </h3>
            <ExportButton
              data={signupReferrers}
              filename="signups_by_referrer"
              columns={["source", "total_signups", "trial_or_active", "conversions", "trial_rate"]}
            />
          </div>
          <div className="space-y-2.5">
            {signupReferrers.map((src) => (
              <div key={src.source} className="flex items-center gap-3">
                <div className="w-24 sm:w-28 shrink-0">
                  <p className="font-body text-xs font-medium capitalize truncate" style={{ color: "var(--text-primary)" }}>
                    {src.source}
                  </p>
                </div>
                <div className="flex-1 h-5 rounded-full overflow-hidden relative" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: getSourceColor(src.source), opacity: 0.7 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(src.total_signups / maxRefSignups) * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                  <span
                    className="absolute inset-y-0 left-2 flex items-center font-mono text-[10px] font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {src.total_signups}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-3 shrink-0 w-32">
                  <span className="font-body text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                    {src.trial_or_active} trials
                  </span>
                  <span className="font-body text-[10px] tabular-nums" style={{ color: "#34D399" }}>
                    {src.trial_rate}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Pages */}
      {topPages.length > 0 && (
        <div className="surface-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Top Pages (Last 7 Days)
            </h3>
            <ExportButton
              data={topPages}
              filename="top_pages"
              columns={["page_url", "views", "unique_sessions", "unique_users"]}
            />
          </div>
          <div className="space-y-2">
            {topPages.map((pg) => (
              <div key={pg.page_url} className="flex items-center gap-3">
                <div className="w-40 sm:w-52 shrink-0">
                  <p
                    className="font-mono text-[11px] truncate"
                    style={{ color: "var(--text-primary)" }}
                    title={pg.page_url}
                  >
                    {pg.page_url}
                  </p>
                </div>
                <div className="flex-1 h-4 rounded-full overflow-hidden relative" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "var(--accent-purple)", opacity: 0.5 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(pg.views / maxPageViews) * 100}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                  <span
                    className="absolute inset-y-0 left-2 flex items-center font-mono text-[9px] font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {pg.views}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-2 shrink-0 w-24">
                  <span className="font-body text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                    {pg.unique_users} users
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════ SIGNUP SOURCES ═══════════════════ */}

      {/* Referral Overview Stats */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Ref. Clicks", value: overview.total_clicks, icon: MousePointerClick, color: "#60A5FA" },
            { label: "Referred Signups", value: overview.total_referred_signups, icon: Users, color: "#A78BFA" },
            { label: "Conversions", value: overview.total_conversions, icon: TrendingUp, color: "#34D399" },
            { label: "Commission", value: `$${overview.total_commission_all.toFixed(2)}`, icon: DollarSign, color: "#FBBF24" },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="surface-card p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon className="w-3.5 h-3.5" style={{ color: stat.color }} strokeWidth={1.5} />
                  <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    {stat.label}
                  </span>
                </div>
                <p className="font-mono text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {stat.value}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Commission Breakdown (if any) */}
      {overview && overview.total_commission_all > 0 && (
        <div className="surface-card p-4 flex items-center gap-6">
          <div>
            <p className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>Pending Payout</p>
            <p className="font-mono text-sm font-bold" style={{ color: "#FBBF24" }}>
              ${overview.total_commission_pending.toFixed(2)}
            </p>
          </div>
          <div className="w-px h-6" style={{ background: "var(--border-subtle)" }} />
          <div>
            <p className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>Paid Out</p>
            <p className="font-mono text-sm font-bold" style={{ color: "#34D399" }}>
              ${overview.total_commission_paid.toFixed(2)}
            </p>
          </div>
          <div className="w-px h-6" style={{ background: "var(--border-subtle)" }} />
          <div>
            <p className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>Referral Revenue</p>
            <p className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              ${overview.total_referral_revenue.toFixed(2)}
            </p>
          </div>
          <div className="w-px h-6" style={{ background: "var(--border-subtle)" }} />
          <div>
            <p className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>Conversion Rate</p>
            <p className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {overview.signup_to_conversion_rate}%
            </p>
          </div>
        </div>
      )}

      {/* Signups by Source (UTM) */}
      <div className="surface-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Signups by Source (UTM)
          </h3>
          {sources.length > 0 && (
            <ExportButton
              data={sources}
              filename="acquisition_sources"
              columns={["source", "total_signups", "trial_or_active", "conversions", "trial_rate"]}
            />
          )}
        </div>

        {sources.length === 0 ? (
          <p className="font-body text-sm text-center py-6" style={{ color: "var(--text-tertiary)" }}>
            No signups with source data yet
          </p>
        ) : (
          <div className="space-y-2.5">
            {sources.map((src) => (
              <div key={src.source} className="flex items-center gap-3">
                <div className="w-24 sm:w-28 shrink-0">
                  <p className="font-body text-xs font-medium capitalize truncate" style={{ color: "var(--text-primary)" }}>
                    {src.source}
                  </p>
                </div>
                <div className="flex-1 h-5 rounded-full overflow-hidden relative" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: getSourceColor(src.source), opacity: 0.7 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(src.total_signups / maxSignups) * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                  <span
                    className="absolute inset-y-0 left-2 flex items-center font-mono text-[10px] font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {src.total_signups}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-3 shrink-0 w-32">
                  <span className="font-body text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                    {src.trial_or_active} trials
                  </span>
                  <span className="font-body text-[10px] tabular-nums" style={{ color: "#34D399" }}>
                    {src.trial_rate}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Referrers */}
      <div className="surface-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Top Referrers
          </h3>
          {referrers.length > 0 && (
            <ExportButton
              data={referrers}
              filename="top_referrers"
              columns={["email", "referral_code", "clicks", "signups", "conversions", "total_earnings"]}
            />
          )}
        </div>

        {referrers.length === 0 ? (
          <p className="font-body text-sm text-center py-6" style={{ color: "var(--text-tertiary)" }}>
            No referrers yet
          </p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {["Email", "Code", "Clicks", "Signups", "Conv.", "Earnings", "Pending"].map((h) => (
                    <th
                      key={h}
                      className="font-body text-[10px] uppercase tracking-wider font-medium pb-2 pr-3 whitespace-nowrap"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {referrers.map((r) => (
                  <tr
                    key={r.user_id}
                    className="cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    onClick={() => onUserClick(r.user_id, r.email)}
                  >
                    <td className="py-2.5 pr-3">
                      <span className="font-body text-xs truncate max-w-[160px] block" style={{ color: "var(--text-primary)" }}>
                        {r.email}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono text-[11px]" style={{ color: "var(--accent-purple-light)" }}>
                        {r.referral_code}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {r.clicks}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {r.signups}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono text-xs tabular-nums font-bold" style={{ color: r.conversions > 0 ? "#34D399" : "var(--text-secondary)" }}>
                        {r.conversions}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono text-xs tabular-nums font-bold" style={{ color: r.total_earnings > 0 ? "#FBBF24" : "var(--text-secondary)" }}>
                        ${r.total_earnings.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className="font-mono text-xs tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                        ${r.pending_earnings.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcquisitionPanel;
