CREATE OR REPLACE FUNCTION public.listings_within_radius(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision
)
RETURNS TABLE(id uuid, distance_km double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    l.id,
    (
      6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(center_lat)) * cos(radians(l.lat)) *
          cos(radians(l.lng) - radians(center_lng)) +
          sin(radians(center_lat)) * sin(radians(l.lat))
        ))
      )
    ) AS distance_km
  FROM public.listings l
  WHERE l.lat IS NOT NULL
    AND l.lng IS NOT NULL
    AND l.status = 'active'
    AND (
      6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(center_lat)) * cos(radians(l.lat)) *
          cos(radians(l.lng) - radians(center_lng)) +
          sin(radians(center_lat)) * sin(radians(l.lat))
        ))
      )
    ) <= radius_km;
$$;

GRANT EXECUTE ON FUNCTION public.listings_within_radius(double precision, double precision, double precision) TO anon, authenticated;