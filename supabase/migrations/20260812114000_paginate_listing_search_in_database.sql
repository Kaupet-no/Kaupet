CREATE FUNCTION public.listing_matches_attribute_filters(
  _attributes jsonb,
  _filters jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_each(COALESCE(_filters, '{}'::jsonb)) AS entry(key, filter)
    WHERE NOT CASE filter->>'kind'
      WHEN 'select' THEN
        COALESCE(_attributes @> jsonb_build_object(key, filter->'value'), false)
      WHEN 'boolean' THEN
        COALESCE(_attributes @> jsonb_build_object(key, filter->'value'), false)
      WHEN 'multiselect' THEN
        COALESCE(
          _attributes->>key = ANY (
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(filter->'values', '[]'::jsonb)))
          ),
          false
        )
      WHEN 'range' THEN
        jsonb_typeof(_attributes->key) = 'number'
        AND (NOT (filter ? 'min') OR (_attributes->key) >= (filter->'min'))
        AND (NOT (filter ? 'max') OR (_attributes->key) <= (filter->'max'))
      WHEN 'text' THEN
        COALESCE(_attributes->>key ILIKE '%' || (filter->>'value') || '%', false)
      WHEN 'date_min' THEN
        COALESCE(_attributes->>key >= filter->>'value', false)
      WHEN 'exclude' THEN
        _attributes->key IS NULL
        OR NOT COALESCE(
          _attributes->>key = ANY (
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(filter->'values', '[]'::jsonb)))
          ),
          false
        )
      ELSE true
    END
  );
$$;

CREATE FUNCTION public.search_listings_page(
  _include_groups jsonb DEFAULT '[]'::jsonb,
  _exclude_any_terms text[] DEFAULT NULL,
  _exclude_all_groups jsonb DEFAULT '[]'::jsonb,
  _category_ids uuid[] DEFAULT NULL,
  _conditions public.listing_condition[] DEFAULT NULL,
  _include_free boolean DEFAULT true,
  _min_price integer DEFAULT NULL,
  _max_price integer DEFAULT NULL,
  _attribute_filters jsonb DEFAULT '{}'::jsonb,
  _center_lat double precision DEFAULT NULL,
  _center_lng double precision DEFAULT NULL,
  _radius_km double precision DEFAULT 10,
  _sort text DEFAULT 'new',
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  kaupet_code character,
  title text,
  subtitle text,
  price_nok integer,
  is_free boolean,
  city text,
  display_lat double precision,
  display_lng double precision,
  created_at timestamptz,
  attributes jsonb,
  category_slug text,
  cover_path text,
  relevance real,
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
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
          WHERE l.search_vector @@ websearch_to_tsquery('norwegian', term)
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
            WHERE NOT (l.search_vector @@ websearch_to_tsquery('norwegian', term))
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
$$;

REVOKE ALL ON FUNCTION public.listing_matches_attribute_filters(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_listings_page(
  jsonb, text[], jsonb, uuid[], public.listing_condition[], boolean,
  integer, integer, jsonb, double precision, double precision,
  double precision, text, integer, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.listing_matches_attribute_filters(jsonb, jsonb)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_listings_page(
  jsonb, text[], jsonb, uuid[], public.listing_condition[], boolean,
  integer, integer, jsonb, double precision, double precision,
  double precision, text, integer, integer
) TO anon, authenticated, service_role;

