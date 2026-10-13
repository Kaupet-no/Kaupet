-- B16: søkets SQL-kontrakter (KG-27-F01, KG-27-F02, KG-27-F03).

-- 1) Fasettelling bruker samme attributtpredikat som selve søket ----------
--
-- KG-27-F01: listing_filter_facet_counts (20260806140000) hadde sin egen
-- kopi av filtersemantikken: date_min ble ignorert, lister ble sammenlignet
-- som hel JSON-tekst, part_fitment_year brukte andre felt enn søket, og en
-- ugyldig lagret tallverdi kastet 22P02 (KG-27-F02). Nå gjenbrukes
-- listing_matches_attribute_filters med fasettens egen nøkkel fjernet, og en
-- listeverdi telles per element. Signatur og rettigheter er uendret.
CREATE OR REPLACE FUNCTION public.listing_filter_facet_counts(
  p_category_ids uuid[] DEFAULT NULL,
  p_conditions text[] DEFAULT NULL,
  p_price_min numeric DEFAULT NULL,
  p_price_max numeric DEFAULT NULL,
  p_include_free boolean DEFAULT true,
  p_listing_ids uuid[] DEFAULT NULL,
  p_active_attrs jsonb DEFAULT '{}'::jsonb,
  p_facet_keys text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE(attr_key text, attr_value text, cnt bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT f.key, v.value, count(*)
  FROM unnest(COALESCE(p_facet_keys, ARRAY[]::text[])) AS f(key)
  JOIN public.listings l ON l.status = 'active' AND l.attributes ? f.key
  CROSS JOIN LATERAL (
    SELECT DISTINCT element.value
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(l.attributes -> f.key) = 'array'
        THEN l.attributes -> f.key
        ELSE jsonb_build_array(l.attributes ->> f.key)
      END
    ) AS element(value)
  ) v
  WHERE (p_category_ids IS NULL OR l.category_id = ANY (p_category_ids))
    AND (
      p_conditions IS NULL
      OR cardinality(p_conditions) = 0
      OR l.condition::text = ANY (p_conditions)
    )
    AND (p_listing_ids IS NULL OR l.id = ANY (p_listing_ids))
    AND (
      CASE WHEN p_include_free
        THEN (p_price_min IS NULL OR l.is_free OR l.price_nok >= p_price_min)
          AND (p_price_max IS NULL OR l.is_free OR l.price_nok <= p_price_max)
        ELSE l.is_free = false
          AND (p_price_min IS NULL OR l.price_nok >= p_price_min)
          AND (p_price_max IS NULL OR l.price_nok <= p_price_max)
      END
    )
    AND public.listing_matches_attribute_filters(
      l.attributes,
      COALESCE(p_active_attrs, '{}'::jsonb) - f.key
    )
  GROUP BY f.key, v.value;
$$;

-- 2) Typesikker lesing av kilometerstand på forsiden ------------------------
--
-- KG-27-F02: (attributes->>'mileage_km')::numeric kastet for hele
-- popularitetsutvalget når én eier hadde lagret en ikke-numerisk verdi.
-- Kropper kopiert fra 20260830000000_listings_home_visibility.sql; eneste
-- endring er mileage_km-uttrykket, som gir NULL for ugyldige verdier.
CREATE OR REPLACE FUNCTION public.popular_listings_last_week(_limit integer DEFAULT 8)
RETURNS TABLE(listing_id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, created_at timestamptz, cover_path text, total_views bigint, views_last_week bigint, mileage_km numeric, category_slug text, attributes jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.kaupet_code, l.title, l.subtitle, l.price_nok, l.is_free, l.city, l.created_at,
    (SELECT i.storage_path FROM public.listing_images i WHERE i.listing_id = l.id ORDER BY i.sort_order LIMIT 1) AS cover_path,
    COALESCE(t.total_views, 0) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id AND e.created_at > now() - interval '7 days') AS views_last_week,
    CASE WHEN l.attributes->>'mileage_km' ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (l.attributes->>'mileage_km')::numeric
    END AS mileage_km,
    c.slug AS category_slug,
    l.attributes AS attributes
  FROM public.listings l
  LEFT JOIN public.categories c ON c.id = l.category_id
  LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
  WHERE l.status = 'active'
    AND l.hidden_from_home = false
    AND EXISTS (SELECT 1 FROM public.listing_images i WHERE i.listing_id = l.id)
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 50));
$$;

CREATE OR REPLACE FUNCTION public.popular_listings_by_category(_category_ids uuid[], _limit integer DEFAULT 12, _offset integer DEFAULT 0)
RETURNS TABLE(listing_id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, created_at timestamptz, cover_path text, total_views bigint, views_last_week bigint, mileage_km numeric, category_slug text, attributes jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.kaupet_code, l.title, l.subtitle, l.price_nok, l.is_free, l.city, l.created_at,
    (SELECT i.storage_path FROM public.listing_images i WHERE i.listing_id = l.id ORDER BY i.sort_order LIMIT 1) AS cover_path,
    COALESCE(t.total_views, 0) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id AND e.created_at > now() - interval '7 days') AS views_last_week,
    CASE WHEN l.attributes->>'mileage_km' ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (l.attributes->>'mileage_km')::numeric
    END AS mileage_km,
    c.slug AS category_slug,
    l.attributes AS attributes
  FROM public.listings l
  LEFT JOIN public.categories c ON c.id = l.category_id
  LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
  WHERE l.status = 'active' AND l.category_id = ANY(_category_ids)
    AND l.hidden_from_home = false
    AND EXISTS (SELECT 1 FROM public.listing_images i WHERE i.listing_id = l.id)
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 12), 60))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;

-- Opprydding: en verdi for et intervallfilter som ikke er et tall kan aldri
-- treffe et intervall, og ble bare lest som feil. Nøkkelen fjernes
-- (manglende verdi er filtrets egen semantikk). Ekte JSON-tall og tallstrenger
-- beholdes.
UPDATE public.listings l
SET attributes = l.attributes - bad.keys
FROM (
  SELECT l2.id, array_agg(a.key) AS keys
  FROM public.listings l2
  CROSS JOIN LATERAL jsonb_each(l2.attributes) a
  WHERE jsonb_typeof(l2.attributes) = 'object'
    AND a.key IN (SELECT DISTINCT cf.key FROM public.category_filters cf WHERE cf.type = 'range')
    AND jsonb_typeof(a.value) <> 'number'
    AND NOT (jsonb_typeof(a.value) = 'string' AND a.value #>> '{}' ~ '^-?[0-9]+(\.[0-9]+)?$')
  GROUP BY l2.id
) bad
WHERE l.id = bad.id;

-- 3) Søkevektoren følger kategoriens forelder ------------------------------
--
-- KG-27-F03: arvede filteretiketter i search_vector ble stående når en
-- kategori ble flyttet, fordi bare filterendringer utløste refresh
-- (20260923130000). Samme mekanisme: SET search_vector = search_vector
-- beregner vektoren på nytt uten å endre annonsens synlige updated_at.
CREATE FUNCTION public.refresh_listing_search_vector_after_category_move() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  WITH RECURSIVE descendants AS (
    SELECT NEW.id AS id
    UNION ALL
    SELECT c.id FROM public.categories c JOIN descendants d ON c.parent_id = d.id
  )
  UPDATE public.listings
  SET search_vector = search_vector
  WHERE category_id IN (SELECT id FROM descendants);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_listing_search_vector_after_category_move()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER categories_refresh_listing_search_after_move
  AFTER UPDATE OF parent_id ON public.categories FOR EACH ROW
  WHEN (OLD.parent_id IS DISTINCT FROM NEW.parent_id)
  EXECUTE FUNCTION public.refresh_listing_search_vector_after_category_move();
