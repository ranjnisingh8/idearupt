-- ═══════════════════════════════════════════════════════════════
-- FIX: "permission denied for table users" error
-- Run in Supabase SQL Editor. Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════

-- ─── STEP 1: GRANT table-level privileges ───────────────────
-- Without these, RLS policies are irrelevant — queries fail before
-- RLS is even evaluated.
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT ON TABLE public.users TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.builder_dna TO authenticated;

-- user_interactions: needed for Save/Unsave/View tracking
GRANT SELECT, INSERT, DELETE ON TABLE public.user_interactions TO authenticated;

-- usage_tracking: needed for daily limit checks (useUsage hook fallback query)
GRANT SELECT, INSERT, UPDATE ON TABLE public.usage_tracking TO authenticated;


-- ─── STEP 2: ensure_user_row — called from AuthContext on every sign-in ───
CREATE OR REPLACE FUNCTION ensure_user_row(
  p_user_id UUID,
  p_email TEXT DEFAULT ''
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (p_user_id, p_email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── STEP 3: save_builder_dna — called from Onboarding.tsx ──
CREATE OR REPLACE FUNCTION save_builder_dna(
  p_tech_level TEXT DEFAULT NULL,
  p_budget_range TEXT DEFAULT NULL,
  p_time_commitment TEXT DEFAULT NULL,
  p_industries TEXT[] DEFAULT '{}',
  p_risk_tolerance TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  INSERT INTO public.builder_dna (user_id, tech_level, budget_range, time_commitment, industries, risk_tolerance)
  VALUES (v_user_id, p_tech_level, p_budget_range, p_time_commitment, p_industries, p_risk_tolerance)
  ON CONFLICT (user_id) DO UPDATE SET
    tech_level = EXCLUDED.tech_level,
    budget_range = EXCLUDED.budget_range,
    time_commitment = EXCLUDED.time_commitment,
    industries = EXCLUDED.industries,
    risk_tolerance = EXCLUDED.risk_tolerance;

  UPDATE public.users
  SET onboarding_completed = TRUE
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.users (id, onboarding_completed)
    VALUES (v_user_id, TRUE)
    ON CONFLICT (id) DO UPDATE SET onboarding_completed = TRUE;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── STEP 4: mark_onboarding_complete — called from Skip button ──
CREATE OR REPLACE FUNCTION mark_onboarding_complete()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  UPDATE public.users
  SET onboarding_completed = TRUE
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.users (id, onboarding_completed)
    VALUES (v_user_id, TRUE)
    ON CONFLICT (id) DO UPDATE SET onboarding_completed = TRUE;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
