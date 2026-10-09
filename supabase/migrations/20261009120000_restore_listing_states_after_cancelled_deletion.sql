-- Preserve original states only for new deletion requests. Legacy requests have no recoverable snapshot.
-- Snapshots inherit account_deletions RLS: users may read/delete their own row, never write snapshots.
ALTER TABLE public.account_deletions
  ADD COLUMN listing_states jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN wtb_states jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.request_account_deletion(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _actual_email text;
  _membership public.organization_members%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _actual_email FROM auth.users WHERE id = _uid;
  IF _actual_email IS NULL OR lower(_actual_email) <> lower(trim(_email)) THEN
    RAISE EXCEPTION 'E-postadressen stemmer ikke';
  END IF;

  SELECT *
  INTO _membership
  FROM public.organization_members
  WHERE user_id = _uid;

  IF FOUND AND _membership.role = 'superuser'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = _membership.organization_id
        AND m.user_id <> _uid
        AND m.status IN ('invited', 'active')
    )
  THEN
    RAISE EXCEPTION 'Superbrukeren kan ikke slettes før øvrige bedriftsmedlemmer er fjernet';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text, 0));
  INSERT INTO public.account_deletions (user_id, confirmation_email, listing_states, wtb_states)
  VALUES (
    _uid, _actual_email,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status, 'sold_at', sold_at)) FROM public.listings WHERE seller_id = _uid), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status)) FROM public.wtb_listings WHERE user_id = _uid), '[]'::jsonb)
  )
  ON CONFLICT (user_id) DO UPDATE
    SET requested_at = now(), scheduled_purge_at = now() + interval '7 days', confirmation_email = EXCLUDED.confirmation_email;

  UPDATE public.wtb_listings SET status = 'archived' WHERE user_id = _uid AND status <> 'archived';
  UPDATE public.listings
  SET status = 'archived'
  WHERE seller_id = _uid AND status <> 'archived';

END;
$$;

CREATE OR REPLACE FUNCTION public.listings_set_sold_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _restored_sold_at timestamptz;
BEGIN
  IF NEW.status IS DISTINCT FROM 'sold' THEN
    NEW.sold_at := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sold' THEN
    -- Only the protected deletion snapshot can supply the original sale time.
    IF TG_OP = 'UPDATE' AND OLD.status = 'archived' THEN
      SELECT (s.value->>'sold_at')::timestamptz INTO _restored_sold_at
      FROM public.account_deletions d
      CROSS JOIN LATERAL jsonb_array_elements(d.listing_states) s(value)
      WHERE d.user_id = auth.uid() AND d.user_id = NEW.seller_id
        AND s.value->>'id' = NEW.id::text AND s.value->>'status' = 'sold';
    END IF;
    NEW.sold_at := COALESCE(_restored_sold_at, CASE WHEN auth.uid() IS NULL THEN COALESCE(NEW.sold_at, now()) ELSE now() END);
  ELSIF auth.uid() IS NOT NULL THEN
    NEW.sold_at := OLD.sold_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.listings_set_sold_at() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _request public.account_deletions%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text, 0));
  SELECT * INTO _request FROM public.account_deletions WHERE user_id = _uid AND scheduled_purge_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.listings l
  SET status = CASE WHEN s.value->>'status' = 'active' AND (public.is_user_banned(_uid) OR public.is_user_suspended(_uid))
      THEN 'disabled'::public.listing_status
    WHEN s.value->>'status' = 'active' AND l.expires_at <= now()
      THEN 'expired'::public.listing_status ELSE (s.value->>'status')::public.listing_status END
  FROM jsonb_array_elements(_request.listing_states) s(value)
  WHERE l.id = (s.value->>'id')::uuid AND l.seller_id = _uid AND l.status = 'archived';

  UPDATE public.wtb_listings l
  SET status = CASE WHEN s.value->>'status' = 'active' AND (public.is_user_banned(_uid) OR public.is_user_suspended(_uid))
      THEN 'archived'
    WHEN s.value->>'status' = 'active' AND l.expires_at <= now()
      THEN 'expired' ELSE s.value->>'status' END
  FROM jsonb_array_elements(_request.wtb_states) s(value)
  WHERE l.id = (s.value->>'id')::uuid AND l.user_id = _uid AND l.status = 'archived';

  DELETE FROM public.account_deletions WHERE user_id = _uid;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.request_account_deletion(text), public.cancel_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text), public.cancel_account_deletion() TO authenticated;
