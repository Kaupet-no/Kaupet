-- Adds typo tolerance to search_listing_ids: websearch_to_tsquery alone
-- gives zero results for small misspellings (e.g. "sykel" vs "sykkel").
-- pg_trgm's similarity() is used as a fallback match on the title, so a
-- near-miss term still surfaces the listing (ranked lower than exact
-- full-text matches, since trigram-only hits don't contribute to ts_rank).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS listings_title_trgm_idx
  ON public.listings USING GIN (title gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.listings_search_term_match(
  search_vector tsvector,
  title text,
  term text
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT search_vector @@ websearch_to_tsquery('norwegian', term)
    OR similarity(title, term) > 0.35
$$;

CREATE OR REPLACE FUNCTION public.search_listing_ids(
  include_groups jsonb DEFAULT '[]'::jsonb,
  exclude_any_terms text[] DEFAULT NULL,
  exclude_all_groups jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(id uuid, rank real)
LANGUAGE sql STABLE SET search_path = public AS $$
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
        WHERE l.search_vector @@ websearch_to_tsquery('norwegian', t)
      )
    )
    AND (
      exclude_all_groups = '[]'::jsonb
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(exclude_all_groups) g
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(g) t
          WHERE NOT (l.search_vector @@ websearch_to_tsquery('norwegian', t))
        )
      )
    )
  ORDER BY rank DESC
  LIMIT 1000;
$$;

GRANT EXECUTE ON FUNCTION public.listings_search_term_match(tsvector, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_listing_ids(jsonb, text[], jsonb) TO anon, authenticated;
