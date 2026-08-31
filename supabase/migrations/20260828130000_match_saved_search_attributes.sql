-- Saved-search criteria now persist category attributes as structured JSONB.
-- Match those predicates before creating a notification; otherwise a saved
-- search with brand/condition equipment would notify for unrelated listings.

CREATE OR REPLACE FUNCTION public.match_listing_to_saved_searches(_listing_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l RECORD;
  s RECORD;
  c jsonb;
  cats jsonb;
  conds jsonb;
  terms jsonb;
  attrs jsonb;
  attr_key text;
  attr_value jsonb;
  attr_kind text;
  attr_item text;
  q_mode text;
  cat_mode text;
  min_price int;
  max_price int;
  include_free boolean;
  center_lat double precision;
  center_lng double precision;
  radius_km double precision;
  dist double precision;
  cat_slug text;
  term text;
  pattern text;
  term_matches boolean;
  all_match boolean;
  any_match boolean;
  numeric_value numeric;
  minimum_value numeric;
  maximum_value numeric;
BEGIN
  SELECT l2.*, cc.slug AS cat_slug
  INTO l
  FROM public.listings l2
  LEFT JOIN public.categories cc ON cc.id = l2.category_id
  WHERE l2.id = _listing_id AND l2.status = 'active';

  IF NOT FOUND THEN RETURN; END IF;

  <<search_loop>> FOR s IN
    SELECT * FROM public.saved_searches WHERE notify = true
  LOOP
    c := s.criteria;

    cats := COALESCE(c->'categories', '[]'::jsonb);
    cat_mode := COALESCE(c->>'catMode', 'any');
    IF jsonb_array_length(cats) > 0 THEN
      IF l.cat_slug IS NULL THEN CONTINUE search_loop; END IF;
      IF cat_mode = 'all' AND jsonb_array_length(cats) > 1 THEN CONTINUE search_loop; END IF;
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(cats) x WHERE x.value = l.cat_slug) THEN
        CONTINUE search_loop;
      END IF;
    END IF;

    conds := COALESCE(c->'conditions', '[]'::jsonb);
    IF jsonb_array_length(conds) > 0 THEN
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(conds) x WHERE x.value = l.condition::text) THEN
        CONTINUE search_loop;
      END IF;
    END IF;

    min_price := NULLIF(c->>'min','')::int;
    max_price := NULLIF(c->>'max','')::int;
    include_free := COALESCE((c->>'includeFree')::boolean, true);
    IF l.is_free THEN
      IF NOT include_free THEN CONTINUE search_loop; END IF;
    ELSE
      IF min_price IS NOT NULL AND (l.price_nok IS NULL OR l.price_nok < min_price) THEN CONTINUE search_loop; END IF;
      IF max_price IS NOT NULL AND (l.price_nok IS NULL OR l.price_nok > max_price) THEN CONTINUE search_loop; END IF;
    END IF;

    terms := COALESCE(c->'terms', '[]'::jsonb);
    IF jsonb_array_length(terms) = 0 AND COALESCE(c->>'q','') <> '' THEN
      terms := to_jsonb(regexp_split_to_array(trim(c->>'q'), '\s+'));
    END IF;
    q_mode := COALESCE(c->>'qMode','all');
    IF jsonb_array_length(terms) > 0 THEN
      all_match := true;
      any_match := false;
      FOR term IN SELECT x.value FROM jsonb_array_elements_text(terms) x LOOP
        IF term IS NULL OR length(trim(term)) = 0 THEN CONTINUE; END IF;
        pattern := '%' || trim(term) || '%';
        term_matches := (COALESCE(l.title,'') ILIKE pattern)
                     OR (COALESCE(l.description,'') ILIKE pattern)
                     OR (COALESCE(l.city,'') ILIKE pattern);
        IF term_matches THEN any_match := true; ELSE all_match := false; END IF;
      END LOOP;
      IF q_mode = 'all' AND NOT all_match THEN CONTINUE search_loop; END IF;
      IF q_mode = 'any' AND NOT any_match THEN CONTINUE search_loop; END IF;
    END IF;

    attrs := COALESCE(c->'attributes', '{}'::jsonb);
    FOR attr_key, attr_value IN SELECT key, value FROM jsonb_each(attrs) LOOP
      attr_kind := attr_value->>'kind';

      IF attr_kind = 'boolean' THEN
        IF COALESCE(l.attributes->>attr_key, 'false') <> COALESCE(attr_value->>'value', 'false') THEN
          CONTINUE search_loop;
        END IF;
      ELSIF attr_kind = 'select' OR attr_kind = 'text' OR attr_kind = 'date_min' THEN
        IF attr_value->>'value' IS NULL THEN CONTINUE; END IF;
        IF attr_kind = 'select' AND l.attributes->>attr_key IS DISTINCT FROM attr_value->>'value' THEN
          CONTINUE search_loop;
        ELSIF attr_kind = 'text' AND COALESCE(l.attributes->>attr_key, '') NOT ILIKE '%' || (attr_value->>'value') || '%' THEN
          CONTINUE search_loop;
        ELSIF attr_kind = 'date_min' AND COALESCE(l.attributes->>attr_key, '') < (attr_value->>'value') THEN
          CONTINUE search_loop;
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
            CONTINUE search_loop;
          ELSIF attr_kind = 'exclude' AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(l.attributes->attr_key) listing_value
            WHERE listing_value.value IN (
              SELECT value FROM jsonb_array_elements_text(COALESCE(attr_value->'values', '[]'::jsonb))
            )
          ) THEN
            CONTINUE search_loop;
          END IF;
        ELSIF attr_kind = 'multiselect' AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(attr_value->'values', '[]'::jsonb)) wanted
          WHERE wanted.value = l.attributes->>attr_key
        ) THEN
          CONTINUE search_loop;
        ELSIF attr_kind = 'exclude' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(attr_value->'values', '[]'::jsonb)) unwanted
          WHERE unwanted.value = l.attributes->>attr_key
        ) THEN
          CONTINUE search_loop;
        END IF;
      ELSIF attr_kind = 'range' THEN
        IF COALESCE(l.attributes->>attr_key, '') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
          CONTINUE search_loop;
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
        IF minimum_value IS NOT NULL AND numeric_value < minimum_value THEN CONTINUE search_loop; END IF;
        IF maximum_value IS NOT NULL AND numeric_value > maximum_value THEN CONTINUE search_loop; END IF;
      END IF;
    END LOOP;

    center_lat := NULLIF(c->>'lat','')::double precision;
    center_lng := NULLIF(c->>'lng','')::double precision;
    radius_km := COALESCE(NULLIF(c->>'radius','')::double precision, 10);
    IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
      IF l.lat IS NULL OR l.lng IS NULL THEN CONTINUE search_loop; END IF;
      dist := 6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(center_lat)) * cos(radians(l.lat)) *
        cos(radians(l.lng) - radians(center_lng)) +
        sin(radians(center_lat)) * sin(radians(l.lat))
      )));
      IF dist > radius_km THEN CONTINUE search_loop; END IF;
    END IF;

    IF s.user_id <> l.seller_id THEN
      INSERT INTO public.saved_search_notifications (saved_search_id, user_id, listing_id)
      VALUES (s.id, s.user_id, l.id)
      ON CONFLICT (saved_search_id, listing_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;
