-- Fase 1.1 av Proff-integrasjonen (grunnmur): en varig kobling
-- kunde-ID -> annonse, slik at Excel-/API-/MCP-synk kan gjøre ekte upsert
-- (opprett/oppdater/uendret/fornyelse) i stedet for kun engangsopprettelse.
-- create_listing_from_import_row() (20260902100000 + 20260911100000) er IKKE
-- endret her og fortsetter å virke som før; den nye RPC-en dekker upsert.

-- 1) Varig ekstern referanse på annonsen ------------------------------------

ALTER TABLE public.listings
  ADD COLUMN external_ref text,
  ADD CONSTRAINT listings_external_ref_length CHECK (
    external_ref IS NULL OR length(trim(external_ref)) BETWEEN 1 AND 120
  );

-- Klienter (authenticated) kan ikke sette external_ref: GRANT UPDATE på
-- public.listings til authenticated er allerede kolonnevis (se
-- 20260909180000_complete_data_api_cutover.sql) og external_ref er bevisst
-- utelatt fra den listen, så en vanlig RLS-oppdatering fra klienten kan ikke
-- skrive denne kolonnen selv om den treffer raden. Kun service_role (RPC-ene
-- under) kan sette den.

-- Backfill: knytt eksisterende Proff-importerte annonser til sin
-- external_id, slik at en fremtidig synk på samme referanse blir en ekte
-- upsert i stedet for en ny duplikatannonse. organization_listing_imports
-- kan inneholde flere rader for samme (organization_id, external_id) på
-- tvers av ulike import_id (f.eks. filen lastet opp flere ganger før denne
-- migrasjonen fantes) — velg da nyeste ikke-slettede annonse. listing_id
-- settes til NULL av FK-en (ON DELETE SET NULL) når annonsen er slettet, så
-- "listing_id IS NOT NULL" holder unna slettede annonser uten eget filter.
WITH candidates AS (
  SELECT
    oli.organization_id,
    oli.external_id,
    oli.listing_id,
    l.created_at,
    row_number() OVER (
      PARTITION BY oli.organization_id, oli.external_id
      ORDER BY l.created_at DESC, oli.listing_id DESC
    ) AS rn
  FROM public.organization_listing_imports oli
  JOIN public.listings l ON l.id = oli.listing_id
  WHERE oli.status = 'created'
    AND oli.listing_id IS NOT NULL
    AND length(trim(oli.external_id)) BETWEEN 1 AND 120
)
UPDATE public.listings l
SET external_ref = c.external_id
FROM candidates c
WHERE c.rn = 1
  AND l.id = c.listing_id
  AND l.organization_id = c.organization_id
  AND l.external_ref IS NULL;

CREATE UNIQUE INDEX listings_organization_external_ref_key
  ON public.listings (organization_id, external_ref)
  WHERE organization_id IS NOT NULL AND external_ref IS NOT NULL;

-- 2) Utvid organization_listing_imports for flere kanaler og utfall --------

ALTER TABLE public.organization_listing_imports
  ADD COLUMN source text NOT NULL DEFAULT 'excel' CHECK (source IN ('excel', 'api', 'mcp'));

ALTER TABLE public.organization_listing_imports
  DROP CONSTRAINT organization_listing_imports_status_check,
  ADD CONSTRAINT organization_listing_imports_status_check CHECK (
    status IN ('processing', 'created', 'updated', 'unchanged', 'renewed', 'status_changed', 'failed')
  );

-- 3) upsert_listing_from_external: opprett eller oppdater via ekstern ref --
--
-- _mode = 'create': oppfører seg som dagens import for nye referanser, men
--   returnerer 'duplicate' (uten feltendring) hvis referansen allerede
--   finnes for organisasjonen. 'duplicate' logges som 'unchanged' siden
--   organization_listing_imports.status ikke har en egen 'duplicate'-verdi.
-- _mode = 'upsert': sammenligner feltene og oppdaterer ved avvik.
-- Fornyelse: en annonse som ender som 'active' i dette kallet, og som ikke
--   nettopp ble (re)aktivert av kallet selv (triggeren listings_set_expiry
--   dekker den reaktiveringen), får expires_at flyttet 30 dager frem — også
--   når resultatet er 'unchanged'/'duplicate'. Dette er selve
--   fornyelsesmekanismen for maskinell synk.
CREATE OR REPLACE FUNCTION public.upsert_listing_from_external(
  _organization_id uuid,
  _user_id uuid,
  _location_id uuid,
  _import_id uuid,
  _source text,
  _external_ref text,
  _listing jsonb,
  _mode text,
  _show_visiting_address boolean DEFAULT false,
  _dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ref text := trim(_external_ref);
  _existing public.listings%ROWTYPE;
  _previous_status public.listing_status;
  _location public.organization_locations%ROWTYPE;
  _result jsonb;
  _listing_id uuid;
  _new_category uuid;
  _changed boolean;
  _create_status text;
  _explicit_status text;
  _target_status public.listing_status;
  _just_activated boolean;
  _may_transition boolean;
  _log_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;
  IF _mode NOT IN ('create', 'upsert') THEN
    RAISE EXCEPTION 'Invalid mode';
  END IF;
  IF _ref IS NULL OR length(_ref) < 1 OR length(_ref) > 120 THEN
    RETURN jsonb_build_object('status', 'failed', 'error', 'Ugyldig ekstern referanse.');
  END IF;

  SELECT * INTO _existing
  FROM public.listings
  WHERE organization_id = _organization_id AND external_ref = _ref
  FOR UPDATE;

  IF NOT FOUND THEN
    BEGIN
      IF NOT public.organization_has_proff_access(_organization_id) THEN
        RAISE EXCEPTION 'Proff access is required';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = _organization_id AND user_id = _user_id AND status = 'active'
      ) THEN
        RAISE EXCEPTION 'Not authorized';
      END IF;
      SELECT * INTO _location
      FROM public.organization_locations
      WHERE id = _location_id AND organization_id = _organization_id AND active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found';
      END IF;
      _new_category := NULLIF(_listing->>'category_id', '')::uuid;
      IF NOT public.can_create_organization_listing(_organization_id, _location_id, _new_category, _user_id) THEN
        RAISE EXCEPTION 'Not authorized';
      END IF;
      _create_status := COALESCE(NULLIF(_listing->>'status', ''), 'active');
      IF _create_status NOT IN ('active', 'draft') THEN
        RAISE EXCEPTION 'Invalid status';
      END IF;

      IF _dry_run THEN
        RETURN jsonb_build_object('status', 'created');
      END IF;

      INSERT INTO public.listings (
        seller_id, organization_id, organization_location_id, external_ref,
        title, subtitle, description, category_id, condition, is_free, price_nok,
        postal_code, city, lat, lng, can_ship, known_issues, no_known_issues,
        maintenance_history, attributes, show_visiting_address, status, published_at
      ) VALUES (
        _user_id,
        _organization_id,
        _location_id,
        _ref,
        _listing->>'title',
        NULLIF(_listing->>'subtitle', ''),
        _listing->>'description',
        _new_category,
        NULLIF(_listing->>'condition', '')::public.listing_condition,
        COALESCE((_listing->>'is_free')::boolean, false),
        NULLIF(_listing->>'price_nok', '')::integer,
        COALESCE(_location.postal_code, ''),
        COALESCE(_location.city, ''),
        _location.lat,
        _location.lng,
        NULLIF(_listing->>'can_ship', '')::boolean,
        NULLIF(_listing->>'known_issues', ''),
        COALESCE((_listing->>'no_known_issues')::boolean, false),
        NULLIF(_listing->>'maintenance_history', ''),
        COALESCE(_listing->'attributes', '{}'::jsonb),
        _show_visiting_address,
        _create_status::public.listing_status,
        CASE WHEN _create_status = 'active' THEN now() ELSE NULL END
      ) RETURNING id INTO _listing_id;

      IF _show_visiting_address AND _location.address_line IS NOT NULL
        AND _location.postal_code IS NOT NULL AND _location.city IS NOT NULL THEN
        INSERT INTO public.listing_visiting_addresses (listing_id, address_line, postal_code, city)
        VALUES (_listing_id, _location.address_line, _location.postal_code, _location.city)
        ON CONFLICT (listing_id) DO UPDATE
          SET address_line = EXCLUDED.address_line, postal_code = EXCLUDED.postal_code, city = EXCLUDED.city;
      END IF;

      INSERT INTO public.organization_listing_imports (
        organization_id, user_id, import_id, external_id, source, status, listing_id
      ) VALUES (
        _organization_id, _user_id, _import_id, _ref, _source, 'created', _listing_id
      )
      ON CONFLICT (organization_id, import_id, external_id) DO UPDATE
        SET status = 'created', listing_id = _listing_id, source = _source, error_code = NULL;

      RETURN jsonb_build_object('status', 'created', 'listing_id', _listing_id);
    EXCEPTION WHEN OTHERS THEN
      IF NOT _dry_run THEN
        INSERT INTO public.organization_listing_imports (
          organization_id, user_id, import_id, external_id, source, status, error_code
        ) VALUES (
          _organization_id, _user_id, _import_id, _ref, _source, 'failed', 'listing_insert_failed'
        )
        ON CONFLICT (organization_id, import_id, external_id) DO UPDATE
          SET status = 'failed', error_code = 'listing_insert_failed', source = _source;
      END IF;
      RETURN jsonb_build_object('status', 'failed', 'error', 'Annonsen kunne ikke opprettes. Kontroller feltene.');
    END;
  END IF;

  -- Referansen finnes fra før.
  _previous_status := _existing.status;
  BEGIN
    IF _mode = 'create' THEN
      _result := jsonb_build_object('status', 'duplicate', 'listing_id', _existing.id, 'previous_status', _previous_status);
      -- Ingen egen tilgangssjekk for det rene duplikat-utfallet (som
      -- dagens create_listing_from_import_row), men vi krever samme
      -- grunnleggende Proff-/medlemskapssjekk som ved opprettelse før vi lar
      -- status-/fornyelseslogikken under røre annonsen.
      _may_transition := public.organization_has_proff_access(_organization_id)
        AND EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE organization_id = _organization_id AND user_id = _user_id AND status = 'active'
        );
    ELSE
      IF NOT public.can_update_organization_listing(
        _organization_id, _existing.organization_location_id, _existing.seller_id,
        _existing.status, _existing.category_id, _user_id
      ) THEN
        RAISE EXCEPTION 'Not authorized';
      END IF;

      IF _existing.status = 'disabled' THEN
        IF NOT _dry_run THEN
          INSERT INTO public.organization_listing_imports (
            organization_id, user_id, import_id, external_id, source, status, listing_id, error_code
          ) VALUES (
            _organization_id, _user_id, _import_id, _ref, _source, 'failed', _existing.id, 'listing_disabled'
          )
          ON CONFLICT (organization_id, import_id, external_id) DO UPDATE
            SET status = 'failed', listing_id = _existing.id, source = _source, error_code = 'listing_disabled';
        END IF;
        RETURN jsonb_build_object(
          'status', 'failed',
          'error', 'Annonsen er deaktivert av moderator og kan ikke oppdateres.',
          'previous_status', _previous_status
        );
      END IF;

      _new_category := NULLIF(_listing->>'category_id', '')::uuid;
      IF _new_category IS DISTINCT FROM _existing.category_id THEN
        IF NOT public.can_create_organization_listing(_organization_id, _existing.organization_location_id, _new_category, _user_id) THEN
          RAISE EXCEPTION 'Not authorized';
        END IF;
      END IF;

      _changed := (
        _listing->>'title' IS DISTINCT FROM _existing.title
        OR NULLIF(_listing->>'subtitle', '') IS DISTINCT FROM _existing.subtitle
        OR _listing->>'description' IS DISTINCT FROM _existing.description
        OR _new_category IS DISTINCT FROM _existing.category_id
        OR NULLIF(_listing->>'condition', '')::public.listing_condition IS DISTINCT FROM _existing.condition
        OR COALESCE((_listing->>'is_free')::boolean, false) IS DISTINCT FROM _existing.is_free
        OR NULLIF(_listing->>'price_nok', '')::integer IS DISTINCT FROM _existing.price_nok
        OR NULLIF(_listing->>'can_ship', '')::boolean IS DISTINCT FROM _existing.can_ship
        OR NULLIF(_listing->>'known_issues', '') IS DISTINCT FROM _existing.known_issues
        OR COALESCE((_listing->>'no_known_issues')::boolean, false) IS DISTINCT FROM _existing.no_known_issues
        OR NULLIF(_listing->>'maintenance_history', '') IS DISTINCT FROM _existing.maintenance_history
        OR COALESCE(_listing->'attributes', '{}'::jsonb) IS DISTINCT FROM _existing.attributes
      );

      IF _changed AND NOT _dry_run THEN
        -- Lokasjonen (organization_location_id/postal_code/city/lat/lng)
        -- endres bevisst ikke ved oppdatering.
        UPDATE public.listings SET
          title = _listing->>'title',
          subtitle = NULLIF(_listing->>'subtitle', ''),
          description = _listing->>'description',
          category_id = _new_category,
          condition = NULLIF(_listing->>'condition', '')::public.listing_condition,
          is_free = COALESCE((_listing->>'is_free')::boolean, false),
          price_nok = NULLIF(_listing->>'price_nok', '')::integer,
          can_ship = NULLIF(_listing->>'can_ship', '')::boolean,
          known_issues = NULLIF(_listing->>'known_issues', ''),
          no_known_issues = COALESCE((_listing->>'no_known_issues')::boolean, false),
          maintenance_history = NULLIF(_listing->>'maintenance_history', ''),
          attributes = COALESCE(_listing->'attributes', '{}'::jsonb)
        WHERE id = _existing.id;
      END IF;

      _result := jsonb_build_object(
        'status', CASE WHEN _changed THEN 'updated' ELSE 'unchanged' END,
        'listing_id', _existing.id,
        'previous_status', _previous_status
      );
      _may_transition := true;
    END IF;

    -- Delt status-/fornyelseslogikk for både 'duplicate' (mode=create) og
    -- upsert. Rører aldri en 'disabled'-annonse.
    IF _previous_status <> 'disabled' AND _may_transition THEN
      _explicit_status := NULLIF(_listing->>'status', '');
      IF _explicit_status IS NOT NULL THEN
        IF _explicit_status NOT IN ('active', 'sold', 'archived') THEN
          RAISE EXCEPTION 'Invalid status';
        END IF;
        _target_status := _explicit_status::public.listing_status;
      ELSIF _previous_status = 'expired' THEN
        _target_status := 'active';
      ELSE
        _target_status := _previous_status;
      END IF;

      IF _target_status <> _previous_status THEN
        IF NOT _dry_run THEN
          UPDATE public.listings SET status = _target_status WHERE id = _existing.id;
        END IF;
        _just_activated := (_target_status = 'active');
      ELSE
        _just_activated := false;
      END IF;

      -- Reaktivering (nettopp blitt 'active' i dette kallet) håndteres
      -- allerede av listings_set_expiry-triggeren. Ellers: fornyelse.
      IF _target_status = 'active' AND NOT _just_activated AND NOT _dry_run THEN
        UPDATE public.listings SET expires_at = now() + interval '30 days' WHERE id = _existing.id;
      END IF;
    END IF;

    IF NOT _dry_run THEN
      _log_status := CASE WHEN _result->>'status' IN ('updated', 'unchanged') THEN _result->>'status' ELSE 'unchanged' END;
      INSERT INTO public.organization_listing_imports (
        organization_id, user_id, import_id, external_id, source, status, listing_id
      ) VALUES (
        _organization_id, _user_id, _import_id, _ref, _source, _log_status, _existing.id
      )
      ON CONFLICT (organization_id, import_id, external_id) DO UPDATE
        SET status = _log_status, listing_id = _existing.id, source = _source, error_code = NULL;
    END IF;

    RETURN _result;
  EXCEPTION WHEN OTHERS THEN
    IF NOT _dry_run THEN
      INSERT INTO public.organization_listing_imports (
        organization_id, user_id, import_id, external_id, source, status, listing_id, error_code
      ) VALUES (
        _organization_id, _user_id, _import_id, _ref, _source, 'failed', _existing.id, 'listing_update_failed'
      )
      ON CONFLICT (organization_id, import_id, external_id) DO UPDATE
        SET status = 'failed', listing_id = _existing.id, source = _source, error_code = 'listing_update_failed';
    END IF;
    RETURN jsonb_build_object('status', 'failed', 'error', 'Annonsen kunne ikke oppdateres. Kontroller feltene.');
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_listing_from_external(uuid, uuid, uuid, uuid, text, text, jsonb, text, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_listing_from_external(uuid, uuid, uuid, uuid, text, text, jsonb, text, boolean, boolean)
  TO service_role;

-- 4) set_listing_status_by_external_ref ------------------------------------

CREATE OR REPLACE FUNCTION public.set_listing_status_by_external_ref(
  _organization_id uuid,
  _user_id uuid,
  _external_ref text,
  _status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ref text := trim(_external_ref);
  _existing public.listings%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;
  IF _status NOT IN ('active', 'sold', 'archived') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO _existing
  FROM public.listings
  WHERE organization_id = _organization_id AND external_ref = _ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF NOT public.can_update_organization_listing(
    _organization_id, _existing.organization_location_id, _existing.seller_id,
    _existing.status, _existing.category_id, _user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _existing.status = 'disabled' THEN
    RETURN jsonb_build_object('status', 'failed', 'error', 'Annonsen er deaktivert av moderator og kan ikke oppdateres.');
  END IF;

  IF _existing.status = _status::public.listing_status THEN
    RETURN jsonb_build_object('status', 'unchanged', 'listing_id', _existing.id, 'listing_status', _existing.status);
  END IF;

  UPDATE public.listings SET status = _status::public.listing_status WHERE id = _existing.id;

  RETURN jsonb_build_object('status', 'status_changed', 'listing_id', _existing.id, 'listing_status', _status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_listing_status_by_external_ref(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_listing_status_by_external_ref(uuid, uuid, text, text)
  TO service_role;

-- 5) renew_listings_by_external_ref ----------------------------------------

CREATE OR REPLACE FUNCTION public.renew_listings_by_external_ref(
  _organization_id uuid,
  _user_id uuid,
  _import_id uuid,
  _source text,
  _external_refs text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _renewed integer := 0;
  _reactivated integer := 0;
  _skipped integer := 0;
  _not_found text[] := '{}';
  _ref text;
  _existing public.listings%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;
  IF NOT public.organization_has_proff_access(_organization_id) THEN
    RAISE EXCEPTION 'Proff access is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _organization_id AND user_id = _user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _external_refs IS NULL OR array_length(_external_refs, 1) IS NULL THEN
    RETURN jsonb_build_object('renewed', 0, 'reactivated', 0, 'skipped', 0, 'not_found', '[]'::jsonb);
  END IF;
  IF array_length(_external_refs, 1) > 1000 THEN
    RAISE EXCEPTION 'Too many external refs';
  END IF;

  FOREACH _ref IN ARRAY _external_refs LOOP
    _ref := trim(_ref);
    SELECT * INTO _existing
    FROM public.listings
    WHERE organization_id = _organization_id AND external_ref = _ref
    FOR UPDATE;

    IF NOT FOUND THEN
      _not_found := array_append(_not_found, _ref);
      CONTINUE;
    END IF;

    IF _existing.status = 'active' THEN
      UPDATE public.listings SET expires_at = now() + interval '30 days' WHERE id = _existing.id;
      _renewed := _renewed + 1;
      INSERT INTO public.organization_listing_imports (
        organization_id, user_id, import_id, external_id, source, status, listing_id
      ) VALUES (
        _organization_id, _user_id, _import_id, _ref, _source, 'renewed', _existing.id
      )
      ON CONFLICT (organization_id, import_id, external_id) DO UPDATE
        SET status = 'renewed', listing_id = _existing.id, source = _source, error_code = NULL;
    ELSIF _existing.status = 'expired' THEN
      -- listings_set_expiry-triggeren setter published_at/expires_at når
      -- status går til 'active'.
      UPDATE public.listings SET status = 'active' WHERE id = _existing.id;
      _reactivated := _reactivated + 1;
      INSERT INTO public.organization_listing_imports (
        organization_id, user_id, import_id, external_id, source, status, listing_id
      ) VALUES (
        _organization_id, _user_id, _import_id, _ref, _source, 'renewed', _existing.id
      )
      ON CONFLICT (organization_id, import_id, external_id) DO UPDATE
        SET status = 'renewed', listing_id = _existing.id, source = _source, error_code = NULL;
    ELSE
      _skipped := _skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'renewed', _renewed,
    'reactivated', _reactivated,
    'skipped', _skipped,
    'not_found', to_jsonb(_not_found)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.renew_listings_by_external_ref(uuid, uuid, uuid, text, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_listings_by_external_ref(uuid, uuid, uuid, text, text[])
  TO service_role;
