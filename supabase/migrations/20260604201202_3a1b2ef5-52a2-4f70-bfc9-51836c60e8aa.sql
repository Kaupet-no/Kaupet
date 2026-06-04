
-- Account deletions: 7-day soft delete with scheduled hard delete
CREATE TABLE public.account_deletions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_purge_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  confirmation_email text NOT NULL
);

GRANT SELECT, DELETE ON public.account_deletions TO authenticated;
GRANT ALL ON public.account_deletions TO service_role;

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own deletion request"
  ON public.account_deletions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own deletion request"
  ON public.account_deletions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Request account deletion (verifies email, archives listings, inserts row)
CREATE OR REPLACE FUNCTION public.request_account_deletion(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _actual_email text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _actual_email FROM auth.users WHERE id = _uid;
  IF _actual_email IS NULL OR lower(_actual_email) <> lower(trim(_email)) THEN
    RAISE EXCEPTION 'E-postadressen stemmer ikke';
  END IF;

  -- Soft-delete: archive all listings
  UPDATE public.listings
  SET status = 'archived'
  WHERE seller_id = _uid AND status <> 'archived';

  INSERT INTO public.account_deletions (user_id, confirmation_email)
  VALUES (_uid, _actual_email)
  ON CONFLICT (user_id) DO UPDATE
    SET requested_at = now(),
        scheduled_purge_at = now() + interval '7 days',
        confirmation_email = EXCLUDED.confirmation_email;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated;

-- Cancel deletion (when user signs in within 7 days)
CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existed boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM public.account_deletions WHERE user_id = _uid
  RETURNING true INTO _existed;
  RETURN COALESCE(_existed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_account_deletion() FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;

-- Hard-delete expired accounts (called by pg_cron)
CREATE OR REPLACE FUNCTION public.purge_expired_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _row record;
BEGIN
  FOR _row IN
    SELECT user_id FROM public.account_deletions WHERE scheduled_purge_at <= now()
  LOOP
    DELETE FROM auth.users WHERE id = _row.user_id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_accounts() FROM public;

-- Schedule daily purge via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'purge-expired-accounts-daily',
  '0 3 * * *',
  $$ SELECT public.purge_expired_accounts(); $$
);
