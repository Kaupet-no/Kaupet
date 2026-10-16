-- Eldre mobilklienter tømmer fritakskriteriet ved å slette det boolske feltet.
-- Behold eksplisitte nye statusvalg og all tidligere kompatibilitetslogikk.
CREATE OR REPLACE FUNCTION public.sync_legacy_eu_control_attributes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  attrs jsonb := COALESCE(NEW.attributes, '{}'::jsonb);
  previous jsonb := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.attributes, '{}'::jsonb)
                        ELSE '{}'::jsonb END;
  is_wtb boolean := TG_TABLE_NAME = 'wtb_listings';
  canonical_changed boolean := attrs->'eu_control_status' IS DISTINCT FROM previous->'eu_control_status';
  legacy_changed boolean := attrs->'eu_control_exempt' IS DISTINCT FROM previous->'eu_control_exempt';
BEGIN
  IF NOT (attrs ?| ARRAY['eu_control_status', 'eu_control_exempt'])
    AND NOT (previous ?| ARRAY['eu_control_status', 'eu_control_exempt']) THEN
    RETURN NEW;
  END IF;

  -- Et eksplisitt nytt statusvalg vinner. Ellers oversettes gamle klienters
  -- boolske svar, også når bare fritaket endres på en eksisterende annonse.
  IF legacy_changed AND NOT canonical_changed THEN
    IF attrs->'eu_control_exempt' = 'true'::jsonb THEN
      attrs := jsonb_set(attrs, '{eu_control_status}',
        CASE WHEN is_wtb THEN '["exempt"]'::jsonb ELSE '"exempt"'::jsonb END);
    ELSIF (attrs->'eu_control_exempt' = 'false'::jsonb
      OR (is_wtb AND NOT (attrs ? 'eu_control_exempt')))
      AND attrs->'eu_control_status' = (CASE WHEN is_wtb THEN '["exempt"]'::jsonb ELSE '"exempt"'::jsonb END) THEN
      attrs := attrs - 'eu_control_status';
    END IF;
  END IF;

  IF is_wtb THEN
    -- Ikke legg til «false»: et kjøpsønske uten kriterium skal være ubegrenset.
    IF attrs->'eu_control_status' = '["exempt"]'::jsonb THEN
      attrs := attrs || '{"eu_control_exempt":true}'::jsonb;
    ELSIF canonical_changed THEN
      attrs := attrs - 'eu_control_exempt';
    END IF;
  ELSE
    -- En gyldig frist har forrang over et gammelt Mangler/Fritatt-valg.
    IF attrs->>'next_eu_control' ~ '^\d{4}-\d{2}-\d{2}$'
      AND pg_input_is_valid(attrs->>'next_eu_control', 'date')
      AND attrs->>'next_eu_control' >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Oslo')::date::text THEN
      attrs := attrs - 'eu_control_status';
    END IF;
    attrs := attrs || jsonb_build_object('eu_control_exempt',
      COALESCE(attrs->>'eu_control_status' = 'exempt', false));
  END IF;

  NEW.attributes := attrs;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_legacy_eu_control_attributes()
  FROM PUBLIC, anon, authenticated, service_role;
