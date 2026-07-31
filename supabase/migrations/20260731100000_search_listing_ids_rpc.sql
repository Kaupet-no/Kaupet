-- Wires up the already-existing listings.search_vector (GIN-indexed,
-- Norwegian-weighted tsvector maintained since migration 20260604073224) to
-- an RPC the app can call instead of the ILIKE-based text search it has been
-- using. Also expresses "exclude if ALL words present" natively in SQL,
-- removing the need for the client-side over-fetch-and-filter workaround
-- that PostgREST's chained filters couldn't express.
--
-- include_groups: jsonb array of {"mode": "all"|"any", "terms": string[]}.
--   A row must match every group (AND between groups). Within a group,
--   "all" requires every term to match, "any" requires at least one.
-- exclude_any_terms: rows matching any of these terms (any field weight)
--   are excluded.
-- exclude_all_groups: jsonb array of string[] term groups; a row is
--   excluded if ALL terms in any one group match.
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
              WHERE NOT (l.search_vector @@ websearch_to_tsquery('norwegian', t))
            )
          ELSE
            EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(g->'terms') t
              WHERE l.search_vector @@ websearch_to_tsquery('norwegian', t)
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

GRANT EXECUTE ON FUNCTION public.search_listing_ids(jsonb, text[], jsonb) TO anon, authenticated;
