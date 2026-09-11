-- Contract phase for the Data API hardening and category-flow simplification.
-- Deploy this only after the Worker containing the corresponding server-function
-- callers has been deployed. The preceding 2026090912/14/15 migrations are the
-- backwards-compatible expand phase.

-- Route side-effecting writes through validated server functions while retaining
-- the authenticated listing fields that are intentionally editable via RLS.
REVOKE INSERT, UPDATE ON TABLE public.listings FROM anon, authenticated;
GRANT UPDATE (
  title,
  subtitle,
  description,
  price_nok,
  is_free,
  category_id,
  condition,
  postal_code,
  city,
  lat,
  lng,
  can_ship,
  attributes,
  known_issues,
  no_known_issues,
  maintenance_history
) ON TABLE public.listings TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.wtb_listings FROM anon, authenticated;
REVOKE INSERT ON TABLE public.reports FROM anon, authenticated;
REVOKE INSERT ON TABLE public.vehicle_brands FROM anon, authenticated;
REVOKE INSERT ON TABLE public.vehicle_models FROM anon, authenticated;
REVOKE INSERT ON TABLE public.vehicle_model_classes FROM anon, authenticated;
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM anon, authenticated;
REVOKE INSERT ON TABLE public.messages FROM anon, authenticated;

-- Search internals are consumed only through server-side functions after cutover.
DROP POLICY IF EXISTS "Category word stats are viewable by everyone"
  ON public.listing_category_word_stats;
DROP POLICY IF EXISTS "Keyword stats are viewable by everyone"
  ON public.listing_keyword_stats;
REVOKE ALL ON TABLE public.listing_category_word_stats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.listing_keyword_stats FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.compute_wtb_matches(uuid, integer, boolean, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wtb_match_count(uuid, integer, boolean, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attribute_range_bounds(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attribute_value_suggestions(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suggest_category_for_title(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suggest_keywords_for_listing(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listing_filter_facet_counts(uuid[], text[], numeric, numeric, boolean, uuid[], jsonb, text[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.compute_wtb_matches(uuid, integer, boolean, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.wtb_match_count(uuid, integer, boolean, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.attribute_range_bounds(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.attribute_value_suggestions(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.suggest_category_for_title(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.suggest_keywords_for_listing(text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.listing_filter_facet_counts(uuid[], text[], numeric, numeric, boolean, uuid[], jsonb, text[])
  TO service_role;

-- The replacement Worker and sync RPC no longer read or write these columns.
-- Fail rather than silently discarding a non-standard module configuration.
DO $$
DECLARE
  divergent_count integer;
BEGIN
  SELECT count(*) INTO divergent_count
  FROM public.category_flows
  WHERE modules IS DISTINCT FROM ARRAY['generic-attributes'::text];

  IF divergent_count > 0 THEN
    RAISE EXCEPTION
      'category_flows.modules has % row(s) outside {generic-attributes}; resolve them before dropping the column',
      divergent_count;
  END IF;
END $$;

ALTER TABLE public.category_flows DROP COLUMN steps;
ALTER TABLE public.category_flows DROP COLUMN modules;
