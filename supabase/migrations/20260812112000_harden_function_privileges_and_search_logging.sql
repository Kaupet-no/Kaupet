-- Make RPC exposure explicit. PostgreSQL grants function EXECUTE to PUBLIC
-- by default, which is too broad for a schema exposed through PostgREST.

CREATE TABLE public.search_log_rate_limits (
  key_hash text PRIMARY KEY CHECK (length(key_hash) = 64),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

ALTER TABLE public.search_log_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.search_log_rate_limits FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.log_search_query(text, integer);

CREATE FUNCTION public.log_search_query_rate_limited(
  _key_hash text,
  _query text,
  _result_count integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := trim(lower(_query));
  current_attempts integer;
BEGIN
  IF length(_key_hash) <> 64
    OR length(normalized) NOT BETWEEN 1 AND 120
    OR _result_count NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'Invalid search telemetry input';
  END IF;

  INSERT INTO public.search_log_rate_limits AS limits
    (key_hash, window_started_at, attempts)
  VALUES (_key_hash, now(), 1)
  ON CONFLICT (key_hash) DO UPDATE SET
    attempts = CASE
      WHEN limits.window_started_at < now() - interval '10 minutes' THEN 1
      ELSE limits.attempts + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at < now() - interval '10 minutes' THEN now()
      ELSE limits.window_started_at
    END
  RETURNING attempts INTO current_attempts;

  IF current_attempts > 120 THEN
    RETURN;
  END IF;

  INSERT INTO public.search_query_stats (query, search_count, zero_result_count, last_searched_at)
  VALUES (normalized, 1, CASE WHEN _result_count = 0 THEN 1 ELSE 0 END, now())
  ON CONFLICT (query) DO UPDATE SET
    search_count = search_query_stats.search_count + 1,
    zero_result_count = search_query_stats.zero_result_count
      + CASE WHEN _result_count = 0 THEN 1 ELSE 0 END,
    last_searched_at = now();

  DELETE FROM public.search_log_rate_limits
  WHERE window_started_at < now() - interval '1 day';
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Public, read-only RPC surface used by browsing/searching clients.
DO $$
DECLARE
  fn regprocedure;
  public_names text[] := ARRAY[
    'attribute_range_bounds', 'attribute_value_suggestions', 'compute_wtb_matches',
    'get_featured_listing_ids', 'listing_filter_facet_counts', 'listing_stats',
    'listings_search_term_match', 'listings_within_radius', 'match_search_synonyms',
    'popular_listings_by_category', 'popular_listings_last_week', 'search_listing_ids',
    'suggest_attribute_values', 'suggest_category_for_title',
    'suggest_keywords_for_listing', 'user_review_summary', 'wtb_match_count',
    'log_listing_view'
  ];
  authenticated_names text[] := ARRAY[
    'cancel_account_deletion', 'demo_activate_promotion', 'get_listing_owner_location',
    'has_role', 'is_user_deletion_pending',
    'my_listing_counts', 'my_moderation_status', 'request_account_deletion',
    'saved_search_unread_counts', 'submit_listing_report', 'submit_user_report',
    'sync_categories_from_payload'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(public_names)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', fn);
  END LOOP;

  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname = ANY(authenticated_names) OR p.proname LIKE 'admin_%')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.log_search_query_rate_limited(text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_search_query_rate_limited(text, text, integer)
  TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
