-- Ytelsestiltak for /annonser-søket (public.search_listings_page).
--
-- Tre målte problemer:
--   1. Geofilteret regner haversine direkte på l.lat/l.lng, uten noen indeks
--      planleggeren kan bruke gjennom uttrykket. Hvert radius-søk blir en
--      seq scan over alle aktive annonser med trigonometri per rad.
--   2. listings_status_idx (status, published_at DESC) matcher ikke
--      standardsorteringen: alle ORDER BY i søkefunksjonene sorterer på
--      created_at, ikke published_at.
--   3. Ingen indeks på lat/lng i det hele tatt.
--
-- listings_status_idx røres ikke — den kan ha andre lesere enn søket.

-- A. Indeks på breddegrad for geofilteret. Partial på status = 'active' fordi
-- BÅDE public.search_listings_page (under) og public.match_listing_to_saved_searches
-- (20260828130000) filtrerer status = 'active' før geosjekken — det finnes
-- ingen kall som trenger andre statuser gjennom denne stien.
CREATE INDEX IF NOT EXISTS listings_active_lat_idx
  ON public.listings USING btree (lat)
  WHERE status = 'active' AND lat IS NOT NULL;

-- B. Indeks som matcher den faktiske sorteringen (created_at, ikke
-- published_at). listings_status_idx (status, published_at DESC) står urørt.
CREATE INDEX IF NOT EXISTS listings_active_created_at_idx
  ON public.listings USING btree (status, created_at DESC);

-- C. Bounding box-forfilter i søket, kopiert ord for ord fra den nyeste
-- definisjonen (20260916130000_fix_search_exclusion_compound_words.sql) med
-- kun geo-forfilteret lagt til.
CREATE OR REPLACE FUNCTION public.search_listings_page(_include_groups jsonb DEFAULT '[]'::jsonb, _exclude_any_terms text[] DEFAULT NULL::text[], _exclude_all_groups jsonb DEFAULT '[]'::jsonb, _category_ids uuid[] DEFAULT NULL::uuid[], _conditions listing_condition[] DEFAULT NULL::listing_condition[], _include_free boolean DEFAULT true, _min_price integer DEFAULT NULL::integer, _max_price integer DEFAULT NULL::integer, _attribute_filters jsonb DEFAULT '{}'::jsonb, _center_lat double precision DEFAULT NULL::double precision, _center_lng double precision DEFAULT NULL::double precision, _radius_km double precision DEFAULT 10, _sort text DEFAULT 'new'::text, _limit integer DEFAULT 20, _offset integer DEFAULT 0) RETURNS TABLE(id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, display_lat double precision, display_lng double precision, created_at timestamp with time zone, attributes jsonb, category_slug text, cover_path text, relevance real, total_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $function$
  WITH matching AS (
    SELECT
      l.*,
      c.slug AS category_slug,
      CASE
        WHEN jsonb_array_length(COALESCE(_include_groups, '[]'::jsonb)) = 0 THEN 0::real
        ELSE ts_rank(
          l.search_vector,
          websearch_to_tsquery(
            'norwegian',
            COALESCE(
              (
                SELECT string_agg(DISTINCT term, ' ')
                FROM jsonb_array_elements(COALESCE(_include_groups, '[]'::jsonb)) AS groups(group_value)
                CROSS JOIN LATERAL jsonb_array_elements_text(group_value->'terms') AS terms(term)
              ),
              ''
            )
          )
        )
      END AS relevance
    FROM public.listings l
    LEFT JOIN public.categories c ON c.id = l.category_id
    WHERE l.status = 'active'
      AND (
        COALESCE(_include_groups, '[]'::jsonb) = '[]'::jsonb
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(_include_groups) AS groups(group_value)
          WHERE NOT CASE WHEN group_value->>'mode' = 'all' THEN
            NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(group_value->'terms') AS terms(term)
              WHERE NOT public.listings_search_term_match(l.search_vector, l.title, term)
            )
          ELSE
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(group_value->'terms') AS terms(term)
              WHERE public.listings_search_term_match(l.search_vector, l.title, term)
            )
          END
        )
      )
      AND (
        _exclude_any_terms IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(_exclude_any_terms) AS terms(term)
          WHERE public.listings_search_term_excludes(l.search_vector, l.title, term)
        )
      )
      AND (
        COALESCE(_exclude_all_groups, '[]'::jsonb) = '[]'::jsonb
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(_exclude_all_groups) AS groups(group_value)
          WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(group_value) AS terms(term)
            WHERE NOT public.listings_search_term_excludes(l.search_vector, l.title, term)
          )
        )
      )
      AND (_category_ids IS NULL OR l.category_id = ANY(_category_ids))
      AND (_conditions IS NULL OR l.condition = ANY(_conditions))
      AND (_include_free OR NOT l.is_free)
      AND (
        _min_price IS NULL
        OR (_include_free AND l.is_free)
        OR l.price_nok >= _min_price
      )
      AND (
        _max_price IS NULL
        OR (_include_free AND l.is_free)
        OR l.price_nok <= _max_price
      )
      AND public.listing_matches_attribute_filters(l.attributes, _attribute_filters)
      AND (
        _center_lat IS NULL
        OR _center_lng IS NULL
        OR (
          l.lat IS NOT NULL
          AND l.lng IS NOT NULL
          -- Bounding box-forfilter på breddegrad, brukt av planleggeren via
          -- listings_active_lat_idx. En breddegrad er minst 110.574 km
          -- overalt på jorden; vi deler på 110.5 (litt mindre enn det reelle
          -- minimumet), så boksen blir garantert litt for STOR, aldri for
          -- liten. Boksen er dermed et bevislig supersett av sirkelen, og
          -- AND-et med det eksakte haversine-uttrykket under gir nøyaktig
          -- samme resultatsett som før — bare med et smalt range-scan i
          -- stedet for full scan. Radius-klampingen må være identisk med
          -- den i haversine-uttrykket, ellers kunne boksen kuttet vekk treff
          -- sirkelen fortsatt skulle inkludert.
          AND l.lat BETWEEN
                _center_lat - (LEAST(GREATEST(COALESCE(_radius_km, 10), 1), 100) / 110.5)
            AND _center_lat + (LEAST(GREATEST(COALESCE(_radius_km, 10), 1), 100) / 110.5)
          AND 6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(_center_lat)) * cos(radians(l.lat)) *
              cos(radians(l.lng) - radians(_center_lng)) +
              sin(radians(_center_lat)) * sin(radians(l.lat))
            ))
          ) <= LEAST(GREATEST(COALESCE(_radius_km, 10), 1), 100)
        )
      )
  ), counted AS (
    SELECT matching.*, count(*) OVER () AS total_count
    FROM matching
  )
  SELECT
    counted.id,
    counted.kaupet_code,
    counted.title,
    counted.subtitle,
    counted.price_nok,
    counted.is_free,
    counted.city,
    counted.display_lat,
    counted.display_lng,
    counted.created_at,
    counted.attributes,
    counted.category_slug,
    (
      SELECT image.storage_path
      FROM public.listing_images image
      WHERE image.listing_id = counted.id
      ORDER BY image.sort_order
      LIMIT 1
    ) AS cover_path,
    counted.relevance,
    counted.total_count
  FROM counted
  ORDER BY
    CASE WHEN _sort = 'relevance' THEN counted.relevance END DESC NULLS LAST,
    CASE WHEN _sort = 'price_asc' THEN counted.price_nok END ASC NULLS LAST,
    CASE WHEN _sort = 'price_desc' THEN counted.price_nok END DESC NULLS LAST,
    CASE WHEN _sort NOT IN ('relevance', 'price_asc', 'price_desc') THEN counted.created_at END DESC,
    counted.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$function$
;
