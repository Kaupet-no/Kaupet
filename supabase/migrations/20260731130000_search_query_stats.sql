-- Aggregated (not per-event) search query logging, so future tuning of the
-- trigram threshold, synonym mapping, etc. has real data to work from —
-- which queries are common, and which return zero results. Keyed by
-- normalized query text rather than logging raw per-search rows, to keep
-- volume and privacy exposure low.
CREATE TABLE public.search_query_stats (
  query TEXT PRIMARY KEY,
  search_count INT NOT NULL DEFAULT 0,
  zero_result_count INT NOT NULL DEFAULT 0,
  last_searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.search_query_stats ENABLE ROW LEVEL SECURITY;
-- No direct table grants — writes only go through log_search_query below,
-- so counts can't be tampered with by calling insert/update directly.
GRANT SELECT ON public.search_query_stats TO service_role;

CREATE OR REPLACE FUNCTION public.log_search_query(_query TEXT, _result_count INT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  normalized TEXT := trim(lower(_query));
BEGIN
  IF normalized = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.search_query_stats (query, search_count, zero_result_count, last_searched_at)
  VALUES (normalized, 1, CASE WHEN _result_count = 0 THEN 1 ELSE 0 END, now())
  ON CONFLICT (query) DO UPDATE SET
    search_count = search_query_stats.search_count + 1,
    zero_result_count = search_query_stats.zero_result_count
      + CASE WHEN _result_count = 0 THEN 1 ELSE 0 END,
    last_searched_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_search_query(TEXT, INT) TO anon, authenticated;
