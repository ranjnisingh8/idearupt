import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface ReferralStats {
  referral_code: string | null;
  total_clicks: number;
  total_signups: number;
  total_conversions: number;
  total_earnings: number;
  pending_earnings: number;
  paid_earnings: number;
}

interface ReferralEvent {
  id: string;
  event_type: "signup" | "trial_start" | "conversion";
  commission_amount: number;
  payment_amount: number;
  commission_status: "pending" | "approved" | "paid";
  created_at: string;
  referred_email: string;
}

const DEFAULT_STATS: ReferralStats = {
  referral_code: null,
  total_clicks: 0,
  total_signups: 0,
  total_conversions: 0,
  total_earnings: 0,
  pending_earnings: 0,
  paid_earnings: 0,
};

export function useReferral() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReferralStats>(DEFAULT_STATS);
  const [history, setHistory] = useState<ReferralEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const [statsRes, historyRes] = await Promise.all([
        supabase.rpc("get_my_referral_stats", { p_user_id: user.id }),
        supabase.rpc("get_my_referral_history", { p_user_id: user.id, p_limit: 50 }),
      ]);

      if (statsRes.data) {
        setStats(statsRes.data as ReferralStats);
      }
      if (historyRes.data) {
        setHistory((historyRes.data as ReferralEvent[]) || []);
      }
    } catch {
      // RPCs may not be deployed yet
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { stats, history, loading, refresh: fetchData };
}
