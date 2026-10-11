-- Restore the original sale time only from a still-pending deletion snapshot, as
-- listings_set_expiry does. Otherwise identical to 20261009120000.
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
        AND d.scheduled_purge_at > now()
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
