-- Bruk samme komplette predikat for gammel og ny annonseversjon.
-- Eksplisitte rettigheter bevarer hardening når funksjoner opprettes på nytt.
CREATE FUNCTION public.saved_search_matches_listing(c jsonb, l public.listings, cat_slug text)
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
BEGIN
  IF NOT public.saved_search_basic_match(c, cat_slug, l.condition::text, l.is_free, l.price_nok) THEN
    RETURN false;
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
    IF q_mode = 'all' AND NOT all_match THEN RETURN false; END IF;
    IF q_mode = 'any' AND NOT any_match THEN RETURN false; END IF;
  END IF;

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

CREATE OR REPLACE FUNCTION public.match_listing_to_saved_searches(
  _listing_id uuid, _previous jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.listings;
  previous_listing public.listings;
  cat_slug text;
  previous_cat_slug text;
  s record;
BEGIN
  SELECT * INTO l FROM public.listings WHERE id = _listing_id AND status = 'active';
  IF NOT FOUND THEN RETURN; END IF;
  SELECT slug INTO cat_slug FROM public.categories WHERE id = l.category_id;

  IF _previous IS NOT NULL THEN
    previous_listing := jsonb_populate_record(NULL::public.listings, _previous);
    SELECT slug INTO previous_cat_slug FROM public.categories WHERE id = previous_listing.category_id;
  END IF;

  FOR s IN SELECT * FROM public.saved_searches WHERE notify = true AND user_id <> l.seller_id LOOP
    IF public.saved_search_matches_listing(s.criteria, l, cat_slug)
       AND (_previous IS NULL OR NOT public.saved_search_matches_listing(s.criteria, previous_listing, previous_cat_slug)) THEN
      INSERT INTO public.saved_search_notifications (saved_search_id, user_id, listing_id)
      VALUES (s.id, s.user_id, l.id)
      ON CONFLICT (saved_search_id, listing_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Triggeren må kunne kalle den interne funksjonen også når selgeren redigerer
-- direkte med RLS-klienten. Klienter får fortsatt ikke kalle RPC-en selv.
CREATE OR REPLACE FUNCTION public.listings_match_saved_searches_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.match_listing_to_saved_searches(NEW.id);
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM public.match_listing_to_saved_searches(NEW.id);
    ELSIF ROW(OLD.price_nok, OLD.is_free, OLD.category_id, OLD.condition,
              OLD.title, OLD.description, OLD.city, OLD.attributes, OLD.lat, OLD.lng)
          IS DISTINCT FROM
          ROW(NEW.price_nok, NEW.is_free, NEW.category_id, NEW.condition,
              NEW.title, NEW.description, NEW.city, NEW.attributes, NEW.lat, NEW.lng) THEN
      PERFORM public.match_listing_to_saved_searches(NEW.id, to_jsonb(OLD));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER listings_match_saved_searches ON public.listings;
CREATE TRIGGER listings_match_saved_searches
AFTER INSERT OR UPDATE OF status, price_nok, is_free, category_id, condition,
  title, description, city, attributes, lat, lng ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_match_saved_searches_trigger();

REVOKE ALL ON FUNCTION public.match_listing_to_saved_searches(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_listing_to_saved_searches(uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.saved_search_matches_listing(jsonb, public.listings, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.saved_search_basic_match(jsonb, text, text, boolean, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.listings_match_saved_searches_trigger()
  FROM PUBLIC, anon, authenticated, service_role;

-- Den andre match-triggeren kjøres ved de samme inline-endringene og må
-- også kunne kalle sin interne, serverbeskyttede matchfunksjon.
ALTER FUNCTION public.listings_match_wtb_listings_trigger() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.listings_match_wtb_listings_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
