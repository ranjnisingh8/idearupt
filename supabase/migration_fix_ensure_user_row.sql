-- ═══════════════════════════════════════════════════════════════
-- Fix ensure_user_row to NOT trigger false realtime INSERT events
--
-- Problem: The old version used INSERT ... ON CONFLICT DO UPDATE
-- which PostgreSQL treats as an INSERT for realtime subscriptions,
-- causing the admin dashboard to count every page refresh as a new signup.
--
-- Fix: Check if user exists first, only INSERT for genuinely new users.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ensure_user_row(
  p_user_id UUID,
  p_email TEXT DEFAULT ''
)
RETURNS VOID AS $$
BEGIN
  -- Only insert if user doesn't exist yet — avoids triggering
  -- realtime INSERT events for existing users on every page refresh
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    INSERT INTO public.users (id, email)
    VALUES (p_user_id, p_email)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    -- Update email only if it changed (rare — e.g. user changed email in Supabase Auth)
    UPDATE public.users SET email = p_email WHERE id = p_user_id AND email IS DISTINCT FROM p_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
