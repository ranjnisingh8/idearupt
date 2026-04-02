-- Add email_unsubscribed column to users table
-- When TRUE, ALL email functions skip this user
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN DEFAULT FALSE;

-- Index for fast filtering in bulk email queries
CREATE INDEX IF NOT EXISTS idx_users_email_unsubscribed
  ON public.users (email_unsubscribed)
  WHERE email_unsubscribed = TRUE;

-- Unsubscribe the following users (requested 2026-02-27)
UPDATE public.users
SET email_unsubscribed = TRUE
WHERE email IN (
  'stelios@pegos.net',
  'david.l.adell11@gmail.com',
  'androsk@gmail.com',
  'artemgolub@gmail.com',
  'kaganb78@gmail.com',
  'sal.jefford@gmail.com',
  'krishna@voidcore.in',
  'steven.sheeley@gmail.com',
  'mwpodgorni@gmail.com',
  'pranavmittal611@gmail.com',
  'willsuosuo@gmail.com',
  'sebastian.schlabs@outlook.de',
  'joeydafforn@yahoo.com',
  'srijansathish@gmail.com',
  'irsham-saudulla-xd@ynu.jp'
);
