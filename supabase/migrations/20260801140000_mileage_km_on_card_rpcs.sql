-- Kilometerstand skal vises på annonsekortet for kjøretøykategorier. De to
-- RPC-ene som mater "Populært akkurat nå" og kategori-feeden på forsiden må
-- derfor også returnere mileage_km (hentet fra attributes-jsonb). CREATE OR
-- REPLACE kan ikke endre OUT-parametrene, så begge må droppes eksplisitt.

DROP FUNCTION IF EXISTS public.popular_listings_last_week(int);

CREATE FUNCTION public.popular_listings_last_week(_limit int DEFAULT 8)
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
  views_last_week bigint,
  mileage_km numeric
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
         AND e.created_at > now() - interval '7 days') AS views_last_week,
    (l.attributes->>'mileage_km')::numeric AS mileage_km
  FROM public.listings l
  WHERE l.status = 'active'
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 50));
$$;

GRANT EXECUTE ON FUNCTION public.popular_listings_last_week(int) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.popular_listings_by_category(uuid[], int, int);

CREATE FUNCTION public.popular_listings_by_category(
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
  views_last_week bigint,
  mileage_km numeric
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
         AND e.created_at > now() - interval '7 days') AS views_last_week,
    (l.attributes->>'mileage_km')::numeric AS mileage_km
  FROM public.listings l
  WHERE l.status = 'active'
    AND l.category_id = ANY(_category_ids)
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 12), 60))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.popular_listings_by_category(uuid[], int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.popular_listings_by_category(uuid[], int, int) TO anon, authenticated;
