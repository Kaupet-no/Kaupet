
CREATE OR REPLACE FUNCTION public.listing_stats(_listing_id uuid)
RETURNS TABLE(total_views bigint, unique_visitors bigint, favorite_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = _listing_id AND l.seller_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.listing_views v WHERE v.listing_id = _listing_id),
    (SELECT count(DISTINCT v.visitor_key) FROM public.listing_views v WHERE v.listing_id = _listing_id),
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = _listing_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.listing_stats(uuid) TO authenticated;
