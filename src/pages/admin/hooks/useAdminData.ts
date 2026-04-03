import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import type {
  TodayStats, LiveEvent, TopIdea, RecentSignup,
  FeatureUsage, EngagementFunnel, HourlyBucket,
  ActiveUser, DateRange, DateRangePreset,
  DropoffFunnel, ErrorSummary, ConfusionSignal,
} from "../types";

export function computeDateRange(preset: DateRangePreset, customStart?: Date, customEnd?: Date): DateRange {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;
  let previousStartDate: Date;
  let previousEndDate: Date;
  let label: string;

  switch (preset) {
    case "today":
      startDate = startOfDay(now);
      endDate = now;
      previousStartDate = startOfDay(subDays(now, 1));
      previousEndDate = endOfDay(subDays(now, 1));
      label = "Today";
      break;
    case "yesterday":
      startDate = startOfDay(subDays(now, 1));
      endDate = endOfDay(subDays(now, 1));
      previousStartDate = startOfDay(subDays(now, 2));
      previousEndDate = endOfDay(subDays(now, 2));
      label = "Yesterday";
      break;
    case "last7":
      startDate = startOfDay(subDays(now, 6));
      endDate = now;
      previousStartDate = startOfDay(subDays(now, 13));
      previousEndDate = endOfDay(subDays(now, 7));
      label = "Last 7 Days";
      break;
    case "last30":
      startDate = startOfDay(subDays(now, 29));
      endDate = now;
      previousStartDate = startOfDay(subDays(now, 59));
      previousEndDate = endOfDay(subDays(now, 30));
      label = "Last 30 Days";
      break;
    case "custom": {
      startDate = customStart ? startOfDay(customStart) : startOfDay(now);
      endDate = customEnd ? endOfDay(customEnd) : now;
      const durationMs = endDate.getTime() - startDate.getTime();
      previousEndDate = new Date(startDate.getTime() - 1);
      previousStartDate = new Date(previousEndDate.getTime() - durationMs);
      label = `${format(startDate, "MMM d")} - ${format(endDate, "MMM d")}`;
      break;
    }
    default:
      startDate = startOfDay(now);
      endDate = now;
      previousStartDate = startOfDay(subDays(now, 1));
      previousEndDate = endOfDay(subDays(now, 1));
      label = "Today";
  }

  return { preset, startDate, endDate, previousStartDate, previousEndDate, label };
}

export function useAdminData() {
  const [dateRange, setDateRangeState] = useState<DateRange>(computeDateRange("today"));
  const dateRangeRef = useRef(dateRange);

  const [stats, setStats] = useState<TodayStats | null>(null);
  const [previousStats, setPreviousStats] = useState<TodayStats | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [topIdeas, setTopIdeas] = useState<TopIdea[]>([]);
  const [recentSignups, setRecentSignups] = useState<RecentSignup[]>([]);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsage[]>([]);
  const [funnel, setFunnel] = useState<EngagementFunnel | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyBucket[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [dropoffFunnel, setDropoffFunnel] = useState<DropoffFunnel | null>(null);
  const [errorSummary, setErrorSummary] = useState<ErrorSummary[]>([]);
  const [confusionSignals, setConfusionSignals] = useState<ConfusionSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const setDateRange = (preset: DateRangePreset, customStart?: Date, customEnd?: Date) => {
    const range = computeDateRange(preset, customStart, customEnd);
    dateRangeRef.current = range;
    setDateRangeState(range);
  };

  const fetchAll = useCallback(async () => {
    const { startDate, endDate, previousStartDate, previousEndDate } = dateRangeRef.current;
    try {
      const [statsRes, prevStatsRes, eventsRes, ideasRes, signupsRes, usageRes, funnelRes, hourlyRes] =
        await Promise.all([
          supabase.rpc("admin_get_today_stats", {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
          }),
          supabase.rpc("admin_get_today_stats", {
            start_date: previousStartDate.toISOString(),
            end_date: previousEndDate.toISOString(),
          }),
          supabase.rpc("admin_get_live_events", {
            event_limit: 50,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
          }),
          supabase.rpc("admin_get_top_ideas_today", {
            result_limit: 10,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
          }),
          supabase.rpc("admin_get_recent_signups", {
            result_limit: 20,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
          }),
          supabase.rpc("admin_get_feature_usage", {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
          }),
          supabase.rpc("admin_get_engagement_funnel", {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
          }),
          supabase.rpc("admin_get_hourly_breakdown", {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
          }),
        ]);

      if (statsRes.data) setStats(statsRes.data);
      if (prevStatsRes.data) setPreviousStats(prevStatsRes.data);
      if (eventsRes.data) setLiveEvents(eventsRes.data);
      if (ideasRes.data) setTopIdeas(ideasRes.data);
      if (signupsRes.data) setRecentSignups(signupsRes.data);
      if (usageRes.data) setFeatureUsage(usageRes.data);
      if (funnelRes.data) setFunnel(funnelRes.data);
      if (hourlyRes.data) {
        setHourlyData(
          (hourlyRes.data as any[]).map((row: any) => ({
            ...row,
            hour_label: format(new Date(row.hour_bucket), "ha"),
          }))
        );
      }

      // Fetch new V3 RPCs (non-blocking — don't break if migration not run yet)
      const isoStart = startDate.toISOString();
      const isoEnd = endDate.toISOString();

      Promise.all([
        supabase.rpc("admin_get_drop_off_funnel", { start_date: isoStart, end_date: isoEnd }),
        supabase.rpc("admin_get_error_summary", { start_date: isoStart, end_date: isoEnd }),
        supabase.rpc("admin_get_confusion_signals", { start_date: isoStart, end_date: isoEnd }),
      ]).then(([dropoffRes, errorsRes, confusionRes]) => {
        if (dropoffRes.data) setDropoffFunnel(dropoffRes.data);
        if (errorsRes.data) setErrorSummary(errorsRes.data);
        if (confusionRes.data) setConfusionSignals(confusionRes.data);
      }).catch(() => {
        // V3 migration not yet applied — silently skip
      });
      setLastRefreshed(new Date());
    } catch {
      // Admin data fetch failed silently
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + refetch when date range changes
  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [dateRange.preset, dateRange.startDate.getTime(), dateRange.endDate.getTime()]);

  // Auto-refresh every 30s only when viewing "today"
  useEffect(() => {
    if (dateRange.preset !== "today") return;
    const interval = setInterval(() => {
      fetchAll();
    }, 30000);
    return () => clearInterval(interval);
  }, [dateRange.preset, fetchAll]);

  // Active users polling (always runs, regardless of date range)
  useEffect(() => {
    const fetchActive = async () => {
      try {
        const { data } = await supabase.rpc("admin_get_active_users", { minutes_threshold: 5 });
        if (data) setActiveUsers(data);
      } catch { /* ignore */ }
    };
    fetchActive();
    const interval = setInterval(fetchActive, 15000);
    return () => clearInterval(interval);
  }, []);

  // Realtime subscriptions — only push new data when viewing "today"
  useEffect(() => {
    const channel = supabase
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "page_events" },
        (payload) => {
          if (dateRangeRef.current.preset !== "today") return;
          const evt = payload.new as any;
          // Filter out auth-noise events from the live feed
          if (evt.event_name === "signup_completed" || evt.event_name === "login_completed") return;
          setLiveEvents((prev) => {
            if (prev.some((e) => e.id === evt.id)) return prev;
            return [
              {
                id: evt.id,
                event_name: evt.event_name,
                event_data: evt.event_data,
                page_url: evt.page_url,
                session_id: evt.session_id,
                user_id: evt.user_id,
                user_email: null,
                created_at: evt.created_at,
              },
              ...prev,
            ].slice(0, 100);
          });
          setStats((prev) => {
            if (!prev) return prev;
            const updates: Partial<TodayStats> = {};
            if (evt.event_name === "page_view") updates.page_views = prev.page_views + 1;
            if (evt.event_name === "validation_completed")
              updates.validations_today = prev.validations_today + 1;
            if (evt.event_name === "blueprint_viewed")
              updates.blueprints_today = prev.blueprints_today + 1;
            return { ...prev, ...updates };
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "users" },
        (payload) => {
          if (dateRangeRef.current.preset !== "today") return;
          const newUser = payload.new as any;

          // Guard: only count as a new signup if created_at is within the last 60 seconds
          // The ensure_user_row RPC does ON CONFLICT DO UPDATE which triggers INSERT events
          // for existing users — this guard prevents counting those as new signups
          const createdAt = newUser.created_at ? new Date(newUser.created_at).getTime() : 0;
          const isActuallyNew = Date.now() - createdAt < 60_000;
          if (!isActuallyNew) return;

          setRecentSignups((prev) => {
            // Deduplicate — don't add if already in list
            if (prev.some((s) => s.id === newUser.id)) return prev;
            return [
              {
                id: newUser.id,
                email: newUser.email,
                display_name: newUser.display_name,
                onboarding_completed: newUser.onboarding_completed || false,
                created_at: newUser.created_at,
              },
              ...prev,
            ].slice(0, 20);
          });
          setStats((prev) =>
            prev
              ? { ...prev, signups_today: prev.signups_today + 1, total_users: prev.total_users + 1 }
              : prev
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_interactions" },
        (payload) => {
          if (dateRangeRef.current.preset !== "today") return;
          const interaction = payload.new as any;
          setStats((prev) => {
            if (!prev) return prev;
            if (interaction.action === "saved") return { ...prev, saves_today: prev.saves_today + 1 };
            if (interaction.action === "viewed") return { ...prev, views_today: prev.views_today + 1 };
            return prev;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pro_waitlist" },
        (payload) => {
          if (dateRangeRef.current.preset !== "today") return;
          setStats((prev) =>
            prev
              ? { ...prev, waitlist_today: prev.waitlist_today + 1, total_waitlist: prev.total_waitlist + 1 }
              : prev
          );
        }
      )
      // Pipeline: new ideas scraped
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ideas" },
        (payload) => {
          if (dateRangeRef.current.preset !== "today") return;
          const idea = payload.new as any;
          setStats((prev) => {
            if (!prev) return prev;
            const updates: Partial<TodayStats> = {
              ideas_scraped_today: (prev.ideas_scraped_today ?? 0) + 1,
              total_ideas: prev.total_ideas + 1,
            };
            if (idea.source_type && prev.ideas_by_source_today) {
              const src = { ...prev.ideas_by_source_today };
              src[idea.source_type] = (src[idea.source_type] || 0) + 1;
              updates.ideas_by_source_today = src;
            }
            if (idea.tier && prev.tiers_today) {
              const tiers = { ...prev.tiers_today };
              tiers[idea.tier] = (tiers[idea.tier] || 0) + 1;
              updates.tiers_today = tiers;
            }
            return { ...prev, ...updates };
          });
        }
      )
      // Pipeline: new pain signals
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pain_signals" },
        () => {
          if (dateRangeRef.current.preset !== "today") return;
          setStats((prev) =>
            prev
              ? { ...prev, signals_scraped_today: (prev.signals_scraped_today ?? 0) + 1, total_signals: prev.total_signals + 1 }
              : prev
          );
        }
      )
      // Pipeline: new use cases generated
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "use_cases" },
        () => {
          if (dateRangeRef.current.preset !== "today") return;
          setStats((prev) =>
            prev
              ? { ...prev, use_cases_generated_today: (prev.use_cases_generated_today ?? 0) + 1, total_use_cases: prev.total_use_cases + 1 }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  return {
    dateRange,
    setDateRange,
    stats,
    previousStats,
    liveEvents,
    topIdeas,
    recentSignups,
    featureUsage,
    funnel,
    hourlyData,
    activeUsers,
    dropoffFunnel,
    errorSummary,
    confusionSignals,
    loading,
    refreshing,
    lastRefreshed,
    handleRefresh,
  };
}
