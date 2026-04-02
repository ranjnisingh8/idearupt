export interface TodayStats {
  page_views: number;
  unique_sessions: number;
  unique_users: number;
  signups_today: number;
  saves_today: number;
  views_today: number;
  validations_today: number;
  blueprints_today: number;
  competitors_today: number;
  waitlist_today: number;
  total_users: number;
  total_ideas: number;
  total_signals: number;
  total_use_cases: number;
  total_waitlist: number;
  onboarding_completed: number;
  onboarding_rate: number;
  avg_idea_score: number;
  trending_ideas: number;
  // Pipeline health
  ideas_scraped_today: number;
  signals_scraped_today: number;
  use_cases_generated_today: number;
  ideas_by_source_today: Record<string, number>;
  avg_score_today: number | null;
  tiers_today: Record<string, number>;
}

export interface LiveEvent {
  id: string;
  event_name: string;
  event_data: any;
  page_url: string;
  session_id: string;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
}

export interface TopIdea {
  id: string;
  title: string;
  category: string;
  overall_score: number;
  views_today: number;
  saves_today: number;
}

export interface RecentSignup {
  id: string;
  email: string;
  display_name: string | null;
  onboarding_completed: boolean;
  created_at: string;
}

export interface FeatureUsage {
  feature: string;
  total_uses: number;
  unique_users: number;
}

export interface EngagementFunnel {
  landing_visitors: number;
  signups: number;
  onboarding_completed: number;
  first_actions: number;
  cta_hero_clicks: number;
  cta_explore_clicks: number;
  cta_validate_clicks: number;
  cta_get_started_clicks: number;
  cta_claim_pro_clicks: number;
  waitlist_from_pricing: number;
  waitlist_from_limit: number;
  waitlist_from_banner: number;
}

export interface HourlyBucket {
  hour_bucket: string;
  hour_label: string;
  event_count: number;
  unique_users: number;
  unique_sessions: number;
}

export interface ActiveUser {
  user_id: string | null;
  user_email: string | null;
  last_event: string;
  last_page: string;
  last_seen: string;
  event_count: number;
}

export interface UserJourneyEvent {
  id: string;
  event_name: string;
  event_data: any;
  page_url: string;
  session_id: string;
  created_at: string;
}

export interface DropoffStep {
  name: string;
  count: number;
  drop_off_pct: number;
}

export interface DropoffFunnel {
  steps: DropoffStep[];
  total_conversion_pct: number;
}

export interface ErrorSummary {
  error_type: string;
  error_message: string;
  occurrence_count: number;
  affected_users: number;
  affected_pages: string[];
  last_seen: string;
}

export interface ConfusionSignal {
  signal_type: string;
  page: string;
  element: string;
  occurrence_count: number;
  affected_users: number;
  last_seen: string;
}

// ─── Advanced Analytics Types ──────────────────────────────

export interface LeaderboardUser {
  user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_streak: number;
  xp: number;
  level: number;
  total_views: number;
  total_saves: number;
  total_shares: number;
  sessions_count: number;
  last_active: string | null;
  validations_used: number;
  engagement_score: number;
}

export interface DauDataPoint {
  day: string;
  dau: number;
  wau: number;
}

export interface HeatmapCell {
  day_of_week: number;
  hour_of_day: number;
  event_count: number;
}

export interface RetentionWeek {
  week_number: number;
  active_users: number;
  retention_pct: number;
}

export interface RetentionCohort {
  cohort_week: string;
  cohort_size: number;
  retention: RetentionWeek[];
}

export interface ConversionSignalUser {
  user_id: string;
  email: string | null;
  display_name: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  created_at: string;
  current_streak: number;
  saves_count: number;
  validations_count: number;
  blueprints_count: number;
  ideas_viewed: number;
  active_days: number;
  features_used: string[];
  conversion_score: number;
  is_hot_lead: boolean;
}

export type DateRangePreset = "today" | "yesterday" | "last7" | "last30" | "custom";

export interface DateRange {
  preset: DateRangePreset;
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
  label: string;
}
