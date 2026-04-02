-- Bulk-expire organic free trials where trial_ends_at is in the past
-- Targets users who signed up for a trial but never connected a payment method
-- (ls_subscription_id IS NULL = never went through Lemon Squeezy checkout)
UPDATE public.users
SET
  plan_status         = 'free',
  subscription_status = 'free'
WHERE
  (plan_status = 'trial' OR subscription_status = 'trial')
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at < NOW()
  AND (ls_subscription_id IS NULL OR ls_subscription_id = '');
