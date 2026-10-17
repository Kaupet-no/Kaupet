-- SUP-B15-01: lagret-søk-varsler skiller «alle ord» fra «minst ett» i
-- ekskluderingsgrupper.
--
-- 20261013160000 slo ordene i alle ekskluderingsgrupper sammen og skjulte
-- annonsen hvis ett av dem fantes, også når brukeren valgte «alle ord».
-- Det levende søket sender nå slike grupper som _exclude_all_groups til
-- search_listings_page (som allerede støtter dem). Kropp kopiert fra
-- 20261013160000; eneste endring er ekskluderingen.

CREATE OR REPLACE FUNCTION public.saved_search_matches_listing(c jsonb, l public.listings, cat_slug text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  terms jsonb;
  attrs jsonb;
  attr_key text;
  attr_value jsonb;
  attr_kind text;
  q_mode text;
  center_lat double precision;
  center_lng double precision;
  radius_km double precision;
  dist double precision;
  term text;
  pattern text;
  term_matches boolean;
  all_match boolean;
  any_match boolean;
  numeric_value numeric;
  minimum_value numeric;
  maximum_value numeric;
  extra_groups jsonb;
  include_all jsonb;
  include_any jsonb;
  exclude_any jsonb;
  exclude_group jsonb;
BEGIN
  IF NOT public.saved_search_basic_match(c, cat_slug, l.condition::text, l.is_free, l.price_nok) THEN
    RETURN false;
  END IF;

  terms := COALESCE(c->'terms', '[]'::jsonb);
  IF jsonb_array_length(terms) = 0 AND COALESCE(c->>'q','') <> '' THEN
    terms := to_jsonb(regexp_split_to_array(trim(c->>'q'), '\s+'));
  END IF;
  q_mode := COALESCE(c->>'qMode','all');

  -- Ekstra søkegrupper (KG-26-F02), med samme kontrakt som det levende
  -- søket (buildListingsSearchRpcArgs): hovedordene og inkluderingsgruppene
  -- slås sammen per modus («all»: alle ord må finnes, «any»: minst ett).
  -- En «any»-ekskludering skjuler annonsen hvis ett av ordene finnes, en
  -- «all»-ekskludering bare hvis alle gruppens ord finnes (SUP-B15-01).
  extra_groups := CASE
    WHEN jsonb_typeof(c->'extraGroups') = 'array' THEN c->'extraGroups'
    ELSE '[]'::jsonb
  END;
  include_all := CASE WHEN q_mode = 'all' THEN terms ELSE '[]'::jsonb END
    || COALESCE((
      SELECT jsonb_agg(t.value)
      FROM jsonb_array_elements(extra_groups) g
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(g.value->'terms', '[]'::jsonb)) t
      WHERE NOT COALESCE((g.value->>'exclude')::boolean, false)
        AND COALESCE(g.value->>'mode', 'any') = 'all'
    ), '[]'::jsonb);
  include_any := CASE WHEN q_mode = 'any' THEN terms ELSE '[]'::jsonb END
    || COALESCE((
      SELECT jsonb_agg(t.value)
      FROM jsonb_array_elements(extra_groups) g
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(g.value->'terms', '[]'::jsonb)) t
      WHERE NOT COALESCE((g.value->>'exclude')::boolean, false)
        AND COALESCE(g.value->>'mode', 'any') = 'any'
    ), '[]'::jsonb);
  exclude_any := COALESCE((
    SELECT jsonb_agg(t.value)
    FROM jsonb_array_elements(extra_groups) g
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(g.value->'terms', '[]'::jsonb)) t
    WHERE COALESCE((g.value->>'exclude')::boolean, false)
      AND COALESCE(g.value->>'mode', 'any') = 'any'
  ), '[]'::jsonb);

  -- Samme ordtreff som før: tittel, beskrivelse eller sted.
  FOR term IN SELECT x.value FROM jsonb_array_elements_text(include_all) x LOOP
    IF term IS NULL OR length(trim(term)) = 0 THEN CONTINUE; END IF;
    pattern := '%' || trim(term) || '%';
    IF NOT ((COALESCE(l.title,'') ILIKE pattern)
         OR (COALESCE(l.description,'') ILIKE pattern)
         OR (COALESCE(l.city,'') ILIKE pattern)) THEN
      RETURN false;
    END IF;
  END LOOP;

  any_match := NULL;
  FOR term IN SELECT x.value FROM jsonb_array_elements_text(include_any) x LOOP
    IF term IS NULL OR length(trim(term)) = 0 THEN CONTINUE; END IF;
    pattern := '%' || trim(term) || '%';
    term_matches := (COALESCE(l.title,'') ILIKE pattern)
                 OR (COALESCE(l.description,'') ILIKE pattern)
                 OR (COALESCE(l.city,'') ILIKE pattern);
    any_match := COALESCE(any_match, false) OR term_matches;
  END LOOP;
  IF any_match = false THEN RETURN false; END IF;

  FOR term IN SELECT x.value FROM jsonb_array_elements_text(exclude_any) x LOOP
    IF term IS NULL OR length(trim(term)) = 0 THEN CONTINUE; END IF;
    pattern := '%' || trim(term) || '%';
    IF (COALESCE(l.title,'') ILIKE pattern)
       OR (COALESCE(l.description,'') ILIKE pattern)
       OR (COALESCE(l.city,'') ILIKE pattern) THEN
      RETURN false;
    END IF;
  END LOOP;

  FOR exclude_group IN
    SELECT g.value FROM jsonb_array_elements(extra_groups) g
    WHERE COALESCE((g.value->>'exclude')::boolean, false)
      AND g.value->>'mode' = 'all'
  LOOP
    all_match := NULL;
    FOR term IN
      SELECT x.value FROM jsonb_array_elements_text(COALESCE(exclude_group->'terms', '[]'::jsonb)) x
    LOOP
      IF term IS NULL OR length(trim(term)) = 0 THEN CONTINUE; END IF;
      pattern := '%' || trim(term) || '%';
      term_matches := (COALESCE(l.title,'') ILIKE pattern)
                   OR (COALESCE(l.description,'') ILIKE pattern)
                   OR (COALESCE(l.city,'') ILIKE pattern);
      all_match := COALESCE(all_match, true) AND term_matches;
    END LOOP;
    IF all_match THEN RETURN false; END IF;
  END LOOP;

  attrs := COALESCE(c->'attributes', '{}'::jsonb);
  FOR attr_key, attr_value IN SELECT key, value FROM jsonb_each(attrs) LOOP
    attr_kind := attr_value->>'kind';

    IF attr_kind = 'boolean' THEN
      IF COALESCE(l.attributes->>attr_key, 'false') <> COALESCE(attr_value->>'value', 'false') THEN
        RETURN false;
      END IF;
    ELSIF attr_kind = 'select' OR attr_kind = 'text' OR attr_kind = 'date_min' THEN
      IF attr_value->>'value' IS NULL THEN CONTINUE; END IF;
      IF attr_kind = 'select' AND l.attributes->>attr_key IS DISTINCT FROM attr_value->>'value' THEN
        RETURN false;
      ELSIF attr_kind = 'text' AND COALESCE(l.attributes->>attr_key, '') NOT ILIKE '%' || (attr_value->>'value') || '%' THEN
        RETURN false;
      ELSIF attr_kind = 'date_min' AND COALESCE(l.attributes->>attr_key, '') < (attr_value->>'value') THEN
        RETURN false;
      END IF;
    ELSIF attr_kind = 'multiselect' OR attr_kind = 'exclude' THEN
      IF jsonb_typeof(l.attributes->attr_key) = 'array' THEN
        IF attr_kind = 'multiselect' AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(l.attributes->attr_key) listing_value
          WHERE listing_value.value IN (
            SELECT value FROM jsonb_array_elements_text(COALESCE(attr_value->'values', '[]'::jsonb))
          )
        ) THEN
          RETURN false;
        ELSIF attr_kind = 'exclude' AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(l.attributes->attr_key) listing_value
          WHERE listing_value.value IN (
            SELECT value FROM jsonb_array_elements_text(COALESCE(attr_value->'values', '[]'::jsonb))
          )
        ) THEN
          RETURN false;
        END IF;
      ELSIF attr_kind = 'multiselect' AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(attr_value->'values', '[]'::jsonb)) wanted
        WHERE wanted.value = l.attributes->>attr_key
      ) THEN
        RETURN false;
      ELSIF attr_kind = 'exclude' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(attr_value->'values', '[]'::jsonb)) unwanted
        WHERE unwanted.value = l.attributes->>attr_key
      ) THEN
        RETURN false;
      END IF;
    ELSIF attr_kind = 'range' THEN
      IF COALESCE(l.attributes->>attr_key, '') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        RETURN false;
      END IF;
      numeric_value := (l.attributes->>attr_key)::numeric;
      minimum_value := CASE
        WHEN attr_value->>'min' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (attr_value->>'min')::numeric
        ELSE NULL
      END;
      maximum_value := CASE
        WHEN attr_value->>'max' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (attr_value->>'max')::numeric
        ELSE NULL
      END;
      IF minimum_value IS NOT NULL AND numeric_value < minimum_value THEN RETURN false; END IF;
      IF maximum_value IS NOT NULL AND numeric_value > maximum_value THEN RETURN false; END IF;
    END IF;
  END LOOP;

  center_lat := NULLIF(c->>'lat','')::double precision;
  center_lng := NULLIF(c->>'lng','')::double precision;
  radius_km := COALESCE(NULLIF(c->>'radius','')::double precision, 10);
  IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
    IF l.lat IS NULL OR l.lng IS NULL THEN RETURN false; END IF;
    dist := 6371 * acos(LEAST(1.0, GREATEST(-1.0,
      cos(radians(center_lat)) * cos(radians(l.lat)) *
      cos(radians(l.lng) - radians(center_lng)) +
      sin(radians(center_lat)) * sin(radians(l.lat))
    )));
    IF dist > radius_km THEN RETURN false; END IF;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.saved_search_matches_listing(jsonb, public.listings, text)
  FROM PUBLIC, anon, authenticated, service_role;
