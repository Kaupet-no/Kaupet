-- F08 del 2: durable UTC-day quotas for organization integrations.
-- Counts charge actual inserted external listings and image jobs. Deletions do not refund.
BEGIN;

LOCK TABLE public.listings, public.listing_image_jobs IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.organization_daily_quotas (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  new_listings integer NOT NULL DEFAULT 0 CHECK (new_listings >= 0),
  new_images integer NOT NULL DEFAULT 0 CHECK (new_images >= 0)
);
ALTER TABLE public.organization_daily_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_daily_quotas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_daily_quotas TO service_role;

CREATE OR REPLACE FUNCTION public.charge_organization_daily_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date;
  _quota public.organization_daily_quotas%ROWTYPE;
BEGIN
  INSERT INTO public.organization_daily_quotas (organization_id, usage_date)
  VALUES (NEW.organization_id, (clock_timestamp() AT TIME ZONE 'UTC')::date)
  ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO STRICT _quota
  FROM public.organization_daily_quotas
  WHERE organization_id = NEW.organization_id
  FOR UPDATE;
  -- Compute the date after obtaining the per-organization lock so a transaction
  -- waiting across UTC midnight cannot roll a newer day's counters backward.
  _today := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  IF _quota.usage_date <> _today THEN
    _quota.new_listings := 0;
    _quota.new_images := 0;
  END IF;

  IF TG_TABLE_NAME = 'listings' THEN
    IF _quota.new_listings >= 1000 THEN
      RAISE EXCEPTION 'organization_new_listings_daily_quota_exceeded';
    END IF;
    UPDATE public.organization_daily_quotas
    SET usage_date = _today, new_listings = _quota.new_listings + 1, new_images = _quota.new_images
    WHERE organization_id = NEW.organization_id;
  ELSE
    IF _quota.new_images >= 2000 THEN
      RAISE EXCEPTION 'organization_new_images_daily_quota_exceeded';
    END IF;
    UPDATE public.organization_daily_quotas
    SET usage_date = _today, new_listings = _quota.new_listings, new_images = _quota.new_images + 1
    WHERE organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.charge_organization_daily_quota() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER listings_charge_organization_daily_quota
  AFTER INSERT ON public.listings
  FOR EACH ROW WHEN (NEW.organization_id IS NOT NULL AND NEW.external_ref IS NOT NULL)
  EXECUTE FUNCTION public.charge_organization_daily_quota();
CREATE TRIGGER listing_image_jobs_charge_organization_daily_quota
  AFTER INSERT ON public.listing_image_jobs
  FOR EACH ROW EXECUTE FUNCTION public.charge_organization_daily_quota();

-- Seed from surviving rows and retained successful import logs. Older deletions
-- and import logs rewritten by a later sync cannot be reconstructed.
WITH seed AS MATERIALIZED (
  SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date AS usage_date
)
INSERT INTO public.organization_daily_quotas (organization_id, usage_date, new_listings, new_images)
SELECT org.id, seed.usage_date,
       GREATEST(COALESCE(listings.count, 0), COALESCE(imports.count, 0))::integer,
       COALESCE(images.count, 0)::integer
FROM public.organizations org
CROSS JOIN seed
LEFT JOIN LATERAL (
  SELECT count(*) AS count FROM public.listings l
  WHERE l.organization_id = org.id AND l.external_ref IS NOT NULL
    AND l.created_at >= seed.usage_date AT TIME ZONE 'UTC'
) listings ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS count FROM public.organization_listing_imports i
  WHERE i.organization_id = org.id AND i.status = 'created'
    AND i.created_at >= seed.usage_date AT TIME ZONE 'UTC'
) imports ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS count FROM public.listing_image_jobs j
  WHERE j.organization_id = org.id
    AND j.created_at >= seed.usage_date AT TIME ZONE 'UTC'
) images ON true
WHERE COALESCE(listings.count, 0) > 0 OR COALESCE(imports.count, 0) > 0 OR COALESCE(images.count, 0) > 0;

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
  _error_message text;
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
      GET STACKED DIAGNOSTICS _error_message = MESSAGE_TEXT;
      IF NOT _dry_run THEN
        INSERT INTO public.organization_listing_imports (
          organization_id, user_id, import_id, external_id, source, status, error_code
        ) VALUES (
          _organization_id, _user_id, _import_id, _ref, _source, 'failed', 'listing_insert_failed'
        )
        ON CONFLICT (organization_id, import_id, external_id) DO UPDATE
          SET status = 'failed', error_code = 'listing_insert_failed', source = _source;
      END IF;
      IF _error_message = 'organization_new_listings_daily_quota_exceeded' THEN
        RETURN jsonb_build_object('status', 'failed', 'error_code', 'daily_listing_quota', 'error', 'Dagens grense for nye annonser er nådd.');
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
    GET STACKED DIAGNOSTICS _error_message = MESSAGE_TEXT;
    IF NOT _dry_run THEN
      INSERT INTO public.organization_listing_imports (
        organization_id, user_id, import_id, external_id, source, status, listing_id, error_code
      ) VALUES (
        _organization_id, _user_id, _import_id, _ref, _source, 'failed', _existing.id, 'listing_update_failed'
      )
      ON CONFLICT (organization_id, import_id, external_id) DO UPDATE
        SET status = 'failed', listing_id = _existing.id, source = _source, error_code = 'listing_update_failed';
    END IF;
    IF _error_message = 'organization_new_listings_daily_quota_exceeded' THEN
      RETURN jsonb_build_object('status', 'failed', 'error_code', 'daily_listing_quota', 'error', 'Dagens grense for nye annonser er nådd.');
    END IF;
    RETURN jsonb_build_object('status', 'failed', 'error', 'Annonsen kunne ikke oppdateres. Kontroller feltene.');
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_listing_from_external(uuid, uuid, uuid, uuid, text, text, jsonb, text, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_listing_from_external(uuid, uuid, uuid, uuid, text, text, jsonb, text, boolean, boolean)
  TO service_role;

COMMIT;
