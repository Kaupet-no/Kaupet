-- F1-ekskludering: "-sykkel" i søk fjerner ikke "Terrengsykkel 26 tommer".
--
-- Samme rotårsak som F1 (20260915100000): norsk stemming
-- (`websearch_to_tsquery('norwegian', ...)`) dekomponerer ikke sammensatte
-- ord, så "sykkel" blir aldri lexemet i "terrengsykkel". Inkluderingssiden
-- fikk en pg_trgm-fallback via `public.listings_search_term_match`, men
-- ekskluderingsgrenene i BEGGE funksjonene under bruker fortsatt et rått
-- `l.search_vector @@ websearch_to_tsquery('norwegian', term)`-predikat, uten
-- fallback:
--   - public.search_listings_page (20260812114000) — brukt av
--     src/features/listing-search/listing-search-query.ts
--   - public.search_listing_ids (baseline) — brukt av
--     src/features/listing-search/use-search-suggestions.ts og
--     use-brand-category-candidate.ts
-- Begge har de samme to rå predikatene (ett for exclude_any_terms, ett for
-- exclude_all_groups), så en fiks i bare én av dem lar den andre levende
-- kodestien stå igjen ødelagt.
--
-- Fiksen gjenbruker BEVISST IKKE `listings_search_term_match` uendret.
-- Grenen `similarity(title, term) > 0.25` i den funksjonen er målt lokalt
-- til å slå inn på rene falske positive:
--   | title | term   | similarity | slår inn |
--   |-------|--------|------------|----------|
--   | Ski   | sko    | 0.333      | ja       |
--   | Sko   | ski    | 0.333      | ja       |
--   | Lampe | klampe | 0.444      | ja       |
-- Ved inkludering koster en falsk positiv bare et litt skjevt ekstra treff.
-- Ved ekskludering FJERNER den et treff brukeren ville hatt — søk på "ski"
-- ville da skjule "Sko str 42". `word_similarity(term, title) > 0.6` slår
-- derimot ikke inn på disse, men dekker fortsatt sammensetningene vi trenger:
--   | title                   | term   | word_similarity | slår inn |
--   |-------------------------|--------|------------------|----------|
--   | Terrengsykkel 26 tommer | sykkel | 0.714            | ja       |
--   | Bilstol til barn        | bil    | 0.750            | ja       |
--   | Ski                     | sko    | 0.500            | nei      |
--   | Lampe                   | klampe | 0.571            | nei      |
--
-- Ny helper `listings_search_term_excludes` bruker derfor
-- `websearch_to_tsquery` ELLER `word_similarity(term, title) > 0.6`, med
-- samme REVOKE/GRANT-behandling som `listings_search_term_match` fikk i
-- 20260812112000 (eksplisitt her siden dette er en ny funksjon som ikke stod
-- i den migrasjonens public_names-liste).
CREATE FUNCTION public.listings_search_term_excludes(search_vector tsvector, title text, term text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT search_vector @@ websearch_to_tsquery('norwegian', term)
    OR word_similarity(term, title) > 0.6
$$;

REVOKE ALL ON FUNCTION public.listings_search_term_excludes(tsvector, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listings_search_term_excludes(tsvector, text, text)
  TO anon, authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.search_listing_ids(include_groups jsonb DEFAULT '[]'::jsonb, exclude_any_terms text[] DEFAULT NULL::text[], exclude_all_groups jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(id uuid, rank real)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $function$
  SELECT l.id, ts_rank(l.search_vector, q.query) AS rank
  FROM public.listings l
  CROSS JOIN LATERAL (
    SELECT websearch_to_tsquery(
      'norwegian',
      array_to_string(
        (SELECT array_agg(DISTINCT t) FROM jsonb_array_elements(include_groups) g,
          jsonb_array_elements_text(g->'terms') t),
        ' '
      )
    ) AS query
  ) q
  WHERE l.status = 'active'
    AND (
      include_groups = '[]'::jsonb
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(include_groups) g
        WHERE NOT (
          CASE WHEN g->>'mode' = 'all' THEN
            NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(g->'terms') t
              WHERE NOT public.listings_search_term_match(l.search_vector, l.title, t)
            )
          ELSE
            EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(g->'terms') t
              WHERE public.listings_search_term_match(l.search_vector, l.title, t)
            )
          END
        )
      )
    )
    AND (
      exclude_any_terms IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM unnest(exclude_any_terms) t
        WHERE public.listings_search_term_excludes(l.search_vector, l.title, t)
      )
    )
    AND (
      exclude_all_groups = '[]'::jsonb
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(exclude_all_groups) g
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(g) t
          WHERE NOT public.listings_search_term_excludes(l.search_vector, l.title, t)
        )
      )
    )
  ORDER BY rank DESC
  LIMIT 1000;
$function$
;
