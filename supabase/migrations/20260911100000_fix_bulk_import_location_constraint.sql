-- create_listing_from_import_row() inserts organization-owned listings with
-- status='active' but never sets organization_location_id in that same
-- INSERT — the 7-arg wrapper (added later, same day) only patches it in via
-- an UPDATE run *after* the base function returns. listings_organization_location_status_check
-- (20260902130000) requires organization_location_id to be set already for
-- any non-draft organization listing, so the INSERT itself violates the
-- constraint and every organization bulk import row fails with
-- "new row for relation listings violates check constraint
-- listings_organization_location_status_check". Fix: let the wrapper pass
-- the location id through the same jsonb payload it already uses for
-- postal_code/city/lat/lng, and set it in the initial INSERT.

CREATE OR REPLACE FUNCTION public.create_listing_from_import_row(
  _organization_id uuid,
  _user_id uuid,
  _import_id uuid,
  _external_id text,
  _listing jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reservation public.organization_listing_imports%ROWTYPE;
  _listing_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;

  INSERT INTO public.organization_listing_imports (
    organization_id, user_id, import_id, external_id, status
  ) VALUES (
    _organization_id, _user_id, _import_id, trim(_external_id), 'processing'
  )
  ON CONFLICT (organization_id, import_id, external_id) DO NOTHING;

  SELECT * INTO _reservation
  FROM public.organization_listing_imports
  WHERE organization_id = _organization_id
    AND import_id = _import_id
    AND external_id = trim(_external_id)
  FOR UPDATE;

  IF _reservation.status = 'created' THEN
    RETURN jsonb_build_object('status', 'duplicate', 'listing_id', _reservation.listing_id);
  END IF;
  IF _reservation.status = 'processing' AND _reservation.user_id <> _user_id THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;
  IF _reservation.status = 'failed' THEN
    RETURN jsonb_build_object('status', 'failed', 'error', 'Raden feilet ved forrige forsøk.');
  END IF;

  BEGIN
    IF NOT public.organization_has_proff_access(_organization_id) THEN
      RAISE EXCEPTION 'Proff access is required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = _organization_id
        AND user_id = _user_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    INSERT INTO public.listings (
      seller_id, organization_id, organization_location_id, title, subtitle,
      description, category_id, condition, is_free, price_nok, postal_code,
      city, lat, lng, can_ship, known_issues, no_known_issues,
      maintenance_history, attributes, status, published_at
    ) VALUES (
      _user_id,
      _organization_id,
      NULLIF(_listing->>'organization_location_id', '')::uuid,
      _listing->>'title',
      NULLIF(_listing->>'subtitle', ''),
      _listing->>'description',
      (_listing->>'category_id')::uuid,
      NULLIF(_listing->>'condition', '')::public.listing_condition,
      COALESCE((_listing->>'is_free')::boolean, false),
      NULLIF(_listing->>'price_nok', '')::integer,
      NULLIF(_listing->>'postal_code', ''),
      NULLIF(_listing->>'city', ''),
      NULLIF(_listing->>'lat', '')::double precision,
      NULLIF(_listing->>'lng', '')::double precision,
      NULLIF(_listing->>'can_ship', '')::boolean,
      NULLIF(_listing->>'known_issues', ''),
      COALESCE((_listing->>'no_known_issues')::boolean, false),
      NULLIF(_listing->>'maintenance_history', ''),
      COALESCE(_listing->'attributes', '{}'::jsonb),
      'active',
      now()
    ) RETURNING id INTO _listing_id;

    UPDATE public.organization_listing_imports
    SET status = 'created', listing_id = _listing_id, error_code = NULL
    WHERE id = _reservation.id;
    RETURN jsonb_build_object('status', 'created', 'listing_id', _listing_id);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.organization_listing_imports
    SET status = 'failed', error_code = 'listing_insert_failed'
    WHERE id = _reservation.id;
    RETURN jsonb_build_object('status', 'failed', 'error', 'Annonsen kunne ikke opprettes. Kontroller feltene.');
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_listing_from_import_row(
  _organization_id uuid,
  _user_id uuid,
  _import_id uuid,
  _external_id text,
  _listing jsonb,
  _location_id uuid,
  _show_visiting_address boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _result jsonb; _listing_id uuid; _location public.organization_locations%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Server access required'; END IF;
  SELECT * INTO _location FROM public.organization_locations
  WHERE id = _location_id AND organization_id = _organization_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
  IF NOT public.can_create_organization_listing(_organization_id, _location_id, (_listing->>'category_id')::uuid, _user_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  _result := public.create_listing_from_import_row(
    _organization_id, _user_id, _import_id, _external_id,
    _listing || jsonb_build_object(
      'organization_location_id', _location_id,
      'postal_code', COALESCE(_location.postal_code, ''),
      'city', COALESCE(_location.city, ''),
      'lat', _location.lat,
      'lng', _location.lng
    )
  );
  _listing_id := NULLIF(_result->>'listing_id', '')::uuid;
  IF _listing_id IS NOT NULL AND _result->>'status' = 'created' THEN
    UPDATE public.listings
    SET organization_location_id = _location_id,
        show_visiting_address = _show_visiting_address,
        postal_code = _location.postal_code,
        city = _location.city,
        lat = _location.lat,
        lng = _location.lng
    WHERE id = _listing_id;
    IF _show_visiting_address AND _location.address_line IS NOT NULL
      AND _location.postal_code IS NOT NULL AND _location.city IS NOT NULL THEN
      INSERT INTO public.listing_visiting_addresses(listing_id, address_line, postal_code, city)
      VALUES (_listing_id, _location.address_line, _location.postal_code, _location.city)
      ON CONFLICT (listing_id) DO UPDATE SET address_line = EXCLUDED.address_line, postal_code = EXCLUDED.postal_code, city = EXCLUDED.city;
    END IF;
  END IF;
  RETURN _result;
END;
$$;
