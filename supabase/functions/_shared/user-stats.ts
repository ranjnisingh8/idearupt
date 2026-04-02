import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface UserStats {
  totalViews: number;
  totalSaves: number;
  totalShares: number;
  engagementLevel: "ghost" | "light" | "medium" | "heavy";
  topCategory: string | null;
  savedIdeaTitles: string[];
  daysSinceLastLogin: number | null;
}

/**
 * Get engagement stats for a single user.
 * Queries user_interactions table (action: 'viewed' | 'saved' | 'shared')
 * and joins on ideas to get category info.
 */
export async function getUserStats(
  adminClient: SupabaseClient,
  userId: string,
  lastActiveDate?: string | null,
): Promise<UserStats> {
  // Count interactions by action type
  const { count: viewCountNum } = await adminClient
    .from("user_interactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "viewed");

  const { count: saveCountNum } = await adminClient
    .from("user_interactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "saved");

  const { count: shareCountNum } = await adminClient
    .from("user_interactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "shared");

  const totalViews = viewCountNum ?? 0;
  const totalSaves = saveCountNum ?? 0;
  const totalShares = shareCountNum ?? 0;

  // Determine engagement level
  let engagementLevel: UserStats["engagementLevel"] = "ghost";
  if (totalViews >= 10 && totalSaves >= 3) engagementLevel = "heavy";
  else if (totalViews >= 3) engagementLevel = "medium";
  else if (totalViews >= 1) engagementLevel = "light";

  // Get top category from viewed ideas
  let topCategory: string | null = null;
  try {
    const { data: interactions } = await adminClient
      .from("user_interactions")
      .select("idea_id")
      .eq("user_id", userId)
      .eq("action", "viewed")
      .limit(50);

    if (interactions && interactions.length > 0) {
      const ideaIds = interactions.map((i: any) => i.idea_id).filter(Boolean);
      if (ideaIds.length > 0) {
        const { data: ideas } = await adminClient
          .from("ideas")
          .select("category")
          .in("id", ideaIds.slice(0, 30));

        if (ideas && ideas.length > 0) {
          const catCounts: Record<string, number> = {};
          for (const idea of ideas) {
            const cat = idea.category || "Other";
            catCounts[cat] = (catCounts[cat] || 0) + 1;
          }
          topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        }
      }
    }
  } catch { /* non-blocking */ }

  // Get saved idea titles (up to 3)
  let savedIdeaTitles: string[] = [];
  try {
    const { data: savedInteractions } = await adminClient
      .from("user_interactions")
      .select("idea_id")
      .eq("user_id", userId)
      .eq("action", "saved")
      .order("created_at", { ascending: false })
      .limit(3);

    if (savedInteractions && savedInteractions.length > 0) {
      const savedIds = savedInteractions.map((i: any) => i.idea_id).filter(Boolean);
      if (savedIds.length > 0) {
        const { data: savedIdeas } = await adminClient
          .from("ideas")
          .select("title")
          .in("id", savedIds);

        savedIdeaTitles = (savedIdeas || []).map((i: any) => i.title).filter(Boolean);
      }
    }
  } catch { /* non-blocking */ }

  // Days since last login
  let daysSinceLastLogin: number | null = null;
  if (lastActiveDate) {
    const lastActive = new Date(lastActiveDate);
    const now = new Date();
    daysSinceLastLogin = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    totalViews,
    totalSaves,
    totalShares,
    engagementLevel,
    topCategory,
    savedIdeaTitles,
    daysSinceLastLogin,
  };
}

/**
 * Lightweight batch stats: get interaction counts for multiple users at once.
 * Returns a map of userId → { views, saves }.
 * More efficient than calling getUserStats() per user.
 */
export async function getBatchInteractionCounts(
  adminClient: SupabaseClient,
  userIds: string[],
): Promise<Map<string, { views: number; saves: number }>> {
  const result = new Map<string, { views: number; saves: number }>();

  if (userIds.length === 0) return result;

  // Initialize all users
  for (const uid of userIds) {
    result.set(uid, { views: 0, saves: 0 });
  }

  try {
    // Process in batches of 200 to handle large user lists
    for (let i = 0; i < userIds.length; i += 200) {
      const batch = userIds.slice(i, i + 200);

      // Get view counts for this batch
      const { data: viewInteractions } = await adminClient
        .from("user_interactions")
        .select("user_id")
        .in("user_id", batch)
        .in("action", ["viewed"]);

      if (viewInteractions) {
        for (const row of viewInteractions) {
          const entry = result.get(row.user_id);
          if (entry) entry.views++;
        }
      }

      // Get save counts for this batch
      const { data: saveInteractions } = await adminClient
        .from("user_interactions")
        .select("user_id")
        .in("user_id", batch)
        .in("action", ["saved"]);

      if (saveInteractions) {
        for (const row of saveInteractions) {
          const entry = result.get(row.user_id);
          if (entry) entry.saves++;
        }
      }
    }
  } catch {
    // Return defaults on error
  }

  return result;
}
