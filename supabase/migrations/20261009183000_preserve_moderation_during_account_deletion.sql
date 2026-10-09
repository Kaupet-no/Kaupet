-- Repeated deletion requests must not overwrite a later administrator listing block.
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
  WHERE seller_id = _uid AND status NOT IN ('archived', 'disabled');

END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated;
