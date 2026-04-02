import {
  Eye, Users, UserPlus, Bookmark, FlaskConical,
  FileText, Building2, Target,
} from "lucide-react";
import StatCard from "./StatCard";
import type { TodayStats } from "../types";

interface StatsGridProps {
  stats: TodayStats | null;
  previousStats: TodayStats | null;
}

const StatsGrid = ({ stats: s, previousStats: p }: StatsGridProps) => {
  const delta = (current: number | undefined, previous: number | undefined) => {
    if (current === undefined || previous === undefined) return undefined;
    return current - previous;
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
      <StatCard
        label="Page Views"
        value={s?.page_views ?? 0}
        icon={<Eye className="w-4 h-4" />}
        color="#8B5CF6"
        subtitle={`${s?.unique_sessions ?? 0} sessions`}
        delta={delta(s?.page_views, p?.page_views)}
      />
      <StatCard
        label="Unique Users"
        value={s?.unique_users ?? 0}
        icon={<Users className="w-4 h-4" />}
        color="#06B6D4"
        subtitle={`${s?.total_users ?? 0} total`}
        delta={delta(s?.unique_users, p?.unique_users)}
      />
      <StatCard
        label="New Signups"
        value={s?.signups_today ?? 0}
        icon={<UserPlus className="w-4 h-4" />}
        color="#10B981"
        subtitle={`${s?.onboarding_rate ?? 0}% onboarded`}
        delta={delta(s?.signups_today, p?.signups_today)}
      />
      <StatCard
        label="Ideas Saved"
        value={s?.saves_today ?? 0}
        icon={<Bookmark className="w-4 h-4" />}
        color="#F59E0B"
        subtitle={`${s?.views_today ?? 0} views`}
        delta={delta(s?.saves_today, p?.saves_today)}
      />
      <StatCard
        label="Validations"
        value={s?.validations_today ?? 0}
        icon={<FlaskConical className="w-4 h-4" />}
        color="#A855F7"
        delta={delta(s?.validations_today, p?.validations_today)}
      />
      <StatCard
        label="Blueprints"
        value={s?.blueprints_today ?? 0}
        icon={<FileText className="w-4 h-4" />}
        color="#06B6D4"
        delta={delta(s?.blueprints_today, p?.blueprints_today)}
      />
      <StatCard
        label="Competitors"
        value={s?.competitors_today ?? 0}
        icon={<Building2 className="w-4 h-4" />}
        color="#F59E0B"
        delta={delta(s?.competitors_today, p?.competitors_today)}
      />
      <StatCard
        label="Waitlist Joins"
        value={s?.waitlist_today ?? 0}
        icon={<Target className="w-4 h-4" />}
        color="#EF4444"
        subtitle={`${s?.total_waitlist ?? 0} total`}
        delta={delta(s?.waitlist_today, p?.waitlist_today)}
      />
    </div>
  );
};

export default StatsGrid;
