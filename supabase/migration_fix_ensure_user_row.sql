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
  p_email TEXT DEFAULT ''
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id) THEN
    INSERT INTO public.users (id, email)
    VALUES (v_user_id, p_email)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    UPDATE public.users SET email = p_email WHERE id = v_user_id AND email IS DISTINCT FROM p_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
