import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw } from "lucide-react";

import { useAdminData } from "./admin/hooks/useAdminData";
import DateRangePicker from "./admin/components/DateRangePicker";
import StatsGrid from "./admin/components/StatsGrid";
import LiveActivityFeed from "./admin/components/LiveActivityFeed";
import ActiveUsersPanel from "./admin/components/ActiveUsersPanel";
import PlatformStats from "./admin/components/PlatformStats";
import HourlyActivityChart from "./admin/components/HourlyActivityChart";
import EngagementFunnel from "./admin/components/EngagementFunnel";
import TopIdeasTable from "./admin/components/TopIdeasTable";
import RecentSignupsTable from "./admin/components/RecentSignupsTable";
import FeatureUsageChart from "./admin/components/FeatureUsageChart";
import PipelineHealth from "./admin/components/PipelineHealth";
import DropoffFunnelChart from "./admin/components/DropoffFunnelChart";
import ErrorDashboard from "./admin/components/ErrorDashboard";
import ConfusionPanel from "./admin/components/ConfusionPanel";
import TrialAnalytics from "./admin/components/TrialAnalytics";
import CardTrialAnalytics from "./admin/components/CardTrialAnalytics";
import SuspiciousAccounts from "./admin/components/SuspiciousAccounts";
import UserJourneyDialog from "./admin/components/UserJourneyDialog";
import DauChart from "./admin/components/DauChart";
import ActivityHeatmap from "./admin/components/ActivityHeatmap";
import EngagementLeaderboard from "./admin/components/EngagementLeaderboard";
import RetentionCohortMatrix from "./admin/components/RetentionCohortMatrix";
import ConversionSignals from "./admin/components/ConversionSignals";
import AcquisitionPanel from "./admin/components/AcquisitionPanel";

const AdminDashboard = () => {
  const {
    dateRange, setDateRange,
    stats, previousStats,
    liveEvents, topIdeas, recentSignups,
    featureUsage, funnel, hourlyData, activeUsers,
    dropoffFunnel, errorSummary, confusionSignals,
    loading, refreshing, lastRefreshed,
    handleRefresh,
  } = useAdminData();

  const [journeyUser, setJourneyUser] = useState<{ id: string; email: string | null } | null>(null);

  const handleUserClick = (userId: string, email: string | null) => {
    setJourneyUser({ id: userId, email });
  };

  const timeAgo = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>

        <div className="flex items-center justify-center h-[80vh]">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin" style={{ color: "var(--accent-purple)" }} />
            <span className="font-body text-sm" style={{ color: "var(--text-secondary)" }}>
              Loading admin dashboard...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h1
              className="font-heading text-xl sm:text-2xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Admin Command Center
            </h1>
            <p
              className="font-body text-xs sm:text-sm mt-0.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              {dateRange.label} {"\u00B7"} Updated {timeAgo(lastRefreshed.toISOString())}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker dateRange={dateRange} onRangeChange={setDateRange} />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="surface-card px-3 py-2 flex items-center gap-2 text-sm font-body hover:opacity-80 transition-opacity"
              style={{ color: "var(--text-secondary)" }}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <StatsGrid stats={stats} previousStats={previousStats} />

        {/* Live Feed + Active Users + Platform Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="lg:col-span-3">
            <LiveActivityFeed
              events={liveEvents}
              isLive={dateRange.preset === "today"}
              onUserClick={handleUserClick}
            />
          </div>
          <div className="lg:col-span-2 space-y-3 sm:space-y-4">
            <ActiveUsersPanel activeUsers={activeUsers} onUserClick={handleUserClick} />
            <PlatformStats stats={stats} />
            <PipelineHealth stats={stats} />
            <FeatureUsageChart data={featureUsage} />
          </div>
        </div>

        {/* Hourly Activity Chart */}
        <HourlyActivityChart data={hourlyData} />

        {/* DAU / WAU Chart */}
        <DauChart />

        {/* Activity Heatmap */}
        <ActivityHeatmap />

        {/* Engagement Funnel */}
        {funnel && <EngagementFunnel funnel={funnel} />}

        {/* Drop-off Funnel */}
        <div className="mb-4 sm:mb-6">
          <DropoffFunnelChart data={dropoffFunnel} />
        </div>

        {/* Top Ideas + Recent Signups */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <TopIdeasTable ideas={topIdeas} />
          <RecentSignupsTable signups={recentSignups} onUserClick={handleUserClick} />
        </div>

        {/* Error Dashboard + Confusion Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <ErrorDashboard errors={errorSummary} />
          <ConfusionPanel signals={confusionSignals} />
        </div>

        {/* Trial & Subscription Analytics (Legacy) */}
        <TrialAnalytics />

        {/* Card-Required Trial Analytics (New) */}
        <div className="mt-4 sm:mt-6">
          <CardTrialAnalytics />
        </div>

        {/* User Engagement Leaderboard */}
        <div className="mt-4 sm:mt-6">
          <EngagementLeaderboard onUserClick={handleUserClick} />
        </div>

        {/* Retention Cohort Matrix */}
        <div className="mt-4 sm:mt-6">
          <RetentionCohortMatrix />
        </div>

        {/* Conversion Signals */}
        <div className="mt-4 sm:mt-6">
          <ConversionSignals onUserClick={handleUserClick} />
        </div>

        {/* Acquisition & Referrals */}
        <div className="mt-4 sm:mt-6">
          <AcquisitionPanel onUserClick={handleUserClick} />
        </div>

        {/* Suspicious Accounts (Trial Abuse Detection) */}
        <div className="mt-4 sm:mt-6">
          <SuspiciousAccounts />
        </div>
      </div>

      {/* User Journey Dialog */}
      {journeyUser && (
        <UserJourneyDialog
          userId={journeyUser.id}
          userEmail={journeyUser.email}
          onClose={() => setJourneyUser(null)}
        />
      )}
    </div>
  );
};

export default AdminDashboard;
