-- Admin-facing view into search_query_stats (see
-- 20260731130000_search_query_stats.sql), so zero-result search phrases —
-- the signal that catches the next "Volvo med cruisecontrol"-style gap in
-- the text-to-filter pipeline — are actually visible somewhere, instead of
-- only queryable via the Supabase SQL editor.
CREATE OR REPLACE FUNCTION public.admin_zero_result_searches(_limit INT DEFAULT 50)
RETURNS TABLE(
  query TEXT,
  search_count INT,
  zero_result_count INT,
  last_searched_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    s.query,
    s.search_count,
    s.zero_result_count,
    s.last_searched_at
  FROM public.search_query_stats s
  WHERE s.zero_result_count > 0
  ORDER BY s.zero_result_count DESC, s.last_searched_at DESC
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_zero_result_searches(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_zero_result_searches(INT) TO authenticated;
