-- Add category_slug and attributes to the popular-listings RPCs so the
-- client can compute the omregistreringsavgift-inclusive total price on
-- listing cards (same calc already used on the listing detail page).

DROP FUNCTION IF EXISTS public.popular_listings_last_week(integer);

CREATE FUNCTION public.popular_listings_last_week(_limit integer DEFAULT 8) RETURNS TABLE(listing_id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, created_at timestamp with time zone, cover_path text, total_views bigint, views_last_week bigint, mileage_km numeric, category_slug text, attributes jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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
    (l.attributes->>'mileage_km')::numeric AS mileage_km,
    c.slug AS category_slug,
    l.attributes AS attributes
  FROM public.listings l
  LEFT JOIN public.categories c ON c.id = l.category_id
  WHERE l.status = 'active'
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 50));
$$;

DROP FUNCTION IF EXISTS public.popular_listings_by_category(uuid[], integer, integer);

CREATE FUNCTION public.popular_listings_by_category(_category_ids uuid[], _limit integer DEFAULT 12, _offset integer DEFAULT 0) RETURNS TABLE(listing_id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, created_at timestamp with time zone, cover_path text, total_views bigint, views_last_week bigint, mileage_km numeric, category_slug text, attributes jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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
    (l.attributes->>'mileage_km')::numeric AS mileage_km,
    c.slug AS category_slug,
    l.attributes AS attributes
  FROM public.listings l
  LEFT JOIN public.categories c ON c.id = l.category_id
  WHERE l.status = 'active'
    AND l.category_id = ANY(_category_ids)
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 12), 60))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;
