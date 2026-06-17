
CREATE OR REPLACE FUNCTION public.popular_listings_last_week(_limit int DEFAULT 8)
RETURNS TABLE(
  listing_id uuid,
  kaupet_code char(8),
  title text,
  price_nok int,
  is_free boolean,
  city text,
  created_at timestamptz,
  cover_path text,
  total_views bigint,
  views_last_week bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.kaupet_code,
    l.title,
    l.price_nok,
    l.is_free,
    l.city,
    l.created_at,
    (
      SELECT i.storage_path
      FROM public.listing_images i
      WHERE i.listing_id = l.id
      ORDER BY i.sort_order ASC
      LIMIT 1
    ) AS cover_path,
    (SELECT count(*) FROM public.listing_views v WHERE v.listing_id = l.id) AS total_views,
    (SELECT count(*) FROM public.listing_views v
       WHERE v.listing_id = l.id
         AND v.created_at > now() - interval '7 days') AS views_last_week
  FROM public.listings l
  WHERE l.status = 'active'
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 50));
$$;

GRANT EXECUTE ON FUNCTION public.popular_listings_last_week(int) TO anon, authenticated;
