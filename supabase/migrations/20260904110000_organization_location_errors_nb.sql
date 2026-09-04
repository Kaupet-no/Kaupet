-- Oversett engelske RAISE EXCEPTION-meldinger i organization_locations-
-- funksjonene til norsk. Disse meldingene når brukeren uendret via
-- formatErrorMessage siden PostgREST-koden (P0001) ikke gir et eget
-- tilfelle i fromPostgresCode.
CREATE OR REPLACE FUNCTION public.create_organization_location(
  _organization_id uuid, _name text, _address_line text, _postal_code text, _city text
)
RETURNS public.organization_locations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.organization_locations; _interval integer := 1; _next timestamptz;
BEGIN
  IF NOT public.is_organization_superuser(_organization_id, auth.uid()) THEN RAISE EXCEPTION 'Du har ikke tilgang til dette'; END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 OR _address_line IS NULL OR length(trim(_address_line)) = 0 OR _postal_code !~ '^[0-9]{4}$' OR _city IS NULL OR length(trim(_city)) = 0 THEN RAISE EXCEPTION 'Ugyldig lokasjon'; END IF;
  SELECT CASE WHEN po.term = 'yearly' THEN 12 ELSE 1 END INTO _interval FROM public.proff_orders po WHERE po.organization_id = _organization_id AND po.status IN ('pending', 'invoiced', 'paid') ORDER BY po.created_at DESC LIMIT 1;
  _next := (SELECT CASE WHEN proff_access_until > now() THEN proff_access_until ELSE date_trunc('month', now()) + interval '1 month' END FROM public.organizations WHERE id = _organization_id);
  INSERT INTO public.organization_locations (organization_id, name, address_line, postal_code, city, is_default, active) VALUES (_organization_id, trim(_name), trim(_address_line), _postal_code, trim(_city), false, true) RETURNING * INTO _row;
  INSERT INTO public.organization_location_subscriptions (location_id, billing_interval_months, next_period_start) VALUES (_row.id, COALESCE(_interval, 1), _next);
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_organization_location_member_permissions(
  _location_id uuid, _user_id uuid, _role text, _listing_access text, _listing_edit_scope text, _chat_access text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _caller uuid := auth.uid(); _caller_role text; _target_role text; _target_status text;
BEGIN
  SELECT organization_id INTO _org FROM public.organization_locations WHERE id = _location_id AND active;
  IF _org IS NULL OR NOT public.can_manage_organization_location(_location_id, _caller) THEN RAISE EXCEPTION 'Du har ikke tilgang til dette'; END IF;
  SELECT m.role INTO _caller_role FROM public.organization_members m WHERE m.organization_id = _org AND m.user_id = _caller AND m.status = 'active';
  SELECT m.role, m.status INTO _target_role, _target_status FROM public.organization_members m WHERE m.organization_id = _org AND m.user_id = _user_id;
  IF _target_role IS NULL OR _target_status <> 'active' OR (_caller_role <> 'superuser' AND _user_id = _caller) OR _role NOT IN ('member', 'manager') THEN RAISE EXCEPTION 'Ugyldig lokasjonsmedlem'; END IF;
  IF _caller_role <> 'superuser' AND _target_role <> 'member' THEN RAISE EXCEPTION 'Du har ikke tilgang til dette'; END IF;
  INSERT INTO public.organization_location_members (location_id, organization_id, user_id, role, listing_access, listing_edit_scope, chat_access)
  VALUES (_location_id, _org, _user_id, _role, _listing_access, _listing_edit_scope, _chat_access)
  ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role, listing_access = EXCLUDED.listing_access, listing_edit_scope = EXCLUDED.listing_edit_scope, chat_access = EXCLUDED.chat_access, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_organization_location_member(_location_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _caller uuid := auth.uid(); _remaining integer;
BEGIN
  SELECT organization_id INTO _org FROM public.organization_locations WHERE id = _location_id AND active;
  IF _org IS NULL OR NOT public.can_manage_organization_location(_location_id, _caller) THEN RAISE EXCEPTION 'Du har ikke tilgang til dette'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_locations WHERE id = _location_id AND is_default) THEN RAISE EXCEPTION 'Standardlokasjonen kan ikke miste tilordning'; END IF;
  DELETE FROM public.organization_location_members WHERE location_id = _location_id AND user_id = _user_id;
  SELECT count(*) INTO _remaining FROM public.organization_location_members lm JOIN public.organization_members m ON m.user_id = lm.user_id AND m.organization_id = _org WHERE lm.user_id = _user_id AND m.status = 'active';
  IF _remaining = 0 THEN RAISE EXCEPTION 'Aktiv bruker må ha minst én lokasjon'; END IF;
END;
$$;
