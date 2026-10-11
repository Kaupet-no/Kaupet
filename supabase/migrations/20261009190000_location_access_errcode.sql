-- Gi tilgangsfeilen en egen SQLSTATE (42501) slik at serveren kan svare 403
-- uten å sammenligne feilteksten. Ellers identisk med 20260904110000.
CREATE OR REPLACE FUNCTION public.create_organization_location(
  _organization_id uuid, _name text, _address_line text, _postal_code text, _city text
)
RETURNS public.organization_locations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.organization_locations; _interval integer := 1; _next timestamptz;
BEGIN
  IF NOT public.is_organization_superuser(_organization_id, auth.uid()) THEN RAISE EXCEPTION 'Du har ikke tilgang til dette' USING ERRCODE = '42501'; END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 OR _address_line IS NULL OR length(trim(_address_line)) = 0 OR _postal_code !~ '^[0-9]{4}$' OR _city IS NULL OR length(trim(_city)) = 0 THEN RAISE EXCEPTION 'Ugyldig lokasjon'; END IF;
  SELECT CASE WHEN po.term = 'yearly' THEN 12 ELSE 1 END INTO _interval FROM public.proff_orders po WHERE po.organization_id = _organization_id AND po.status IN ('pending', 'invoiced', 'paid') ORDER BY po.created_at DESC LIMIT 1;
  _next := (SELECT CASE WHEN proff_access_until > now() THEN proff_access_until ELSE date_trunc('month', now()) + interval '1 month' END FROM public.organizations WHERE id = _organization_id);
  INSERT INTO public.organization_locations (organization_id, name, address_line, postal_code, city, is_default, active) VALUES (_organization_id, trim(_name), trim(_address_line), _postal_code, trim(_city), false, true) RETURNING * INTO _row;
  INSERT INTO public.organization_location_subscriptions (location_id, billing_interval_months, next_period_start) VALUES (_row.id, COALESCE(_interval, 1), _next);
  RETURN _row;
END;
$$;
