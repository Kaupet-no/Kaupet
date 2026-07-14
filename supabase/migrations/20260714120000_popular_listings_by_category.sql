-- Kategori-feed på forsiden: paginert liste over annonser i en valgt kategori,
-- sortert etter popularitet siste 7 dager (samme mål som
-- popular_listings_last_week), med offset for "last inn flere". "Nyest"-sortering
-- trenger ingen egen RPC — den er en vanlig .order("created_at") mot
-- public.listings gjort direkte i klienten.
CREATE OR REPLACE FUNCTION public.popular_listings_by_category(
  _category_ids uuid[],
  _limit int DEFAULT 12,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  listing_id uuid,
  kaupet_code char(8),
  title text,
  subtitle text,
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
    l.subtitle,
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
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e
       WHERE e.listing_id = l.id
         AND e.created_at > now() - interval '7 days') AS views_last_week
  FROM public.listings l
  WHERE l.status = 'active'
    AND l.category_id = ANY(_category_ids)
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 12), 60))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.popular_listings_by_category(uuid[], int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.popular_listings_by_category(uuid[], int, int) TO anon, authenticated;
