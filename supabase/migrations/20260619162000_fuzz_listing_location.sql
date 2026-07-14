-- listings RLS exposes exact lat/lng to everyone for active listings, which
-- leaks the seller's precise home location (GDPR-relevant). Add a snapped
-- display_lat/display_lng (~400m grid) for public consumption, and lock
-- down the exact lat/lng columns so only the table owner (service_role /
-- SECURITY DEFINER functions) and the listing's own seller can read them.

ALTER TABLE public.listings
  ADD COLUMN display_lat double precision,
  ADD COLUMN display_lng double precision;

-- ~400m grid: 1 degree latitude is ~111.32km everywhere; 1 degree longitude
-- shrinks by cos(latitude). Snap each axis to its own ~400m cell so the
-- displayed point never lands more than ~280m from the cell center.
CREATE OR REPLACE FUNCTION public.fuzz_listing_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _cell_lat constant double precision := 400.0 / 111320.0;
  _cell_lng double precision;
BEGIN
  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    NEW.display_lat := NULL;
    NEW.display_lng := NULL;
    RETURN NEW;
  END IF;
  _cell_lng := 400.0 / (111320.0 * GREATEST(cos(radians(NEW.lat)), 0.01));
  NEW.display_lat := round(NEW.lat / _cell_lat) * _cell_lat;
  NEW.display_lng := round(NEW.lng / _cell_lng) * _cell_lng;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listings_fuzz_location
BEFORE INSERT OR UPDATE OF lat, lng ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.fuzz_listing_location();

-- Backfill existing rows with the same formula.
UPDATE public.listings
SET
  display_lat = round(lat / (400.0 / 111320.0)) * (400.0 / 111320.0),
  display_lng = round(lng / (400.0 / (111320.0 * GREATEST(cos(radians(lat)), 0.01))))
    * (400.0 / (111320.0 * GREATEST(cos(radians(lat)), 0.01)))
WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- Lock down exact coordinates: revoke column-level access for anon and
-- authenticated. display_lat/display_lng remain covered by the existing
-- table-level GRANT SELECT. The table owner (migrations run as it) and
-- service_role keep full access regardless of these revokes.
REVOKE SELECT (lat, lng) ON public.listings FROM anon, authenticated;

-- Let an owner read their own exact coordinates (e.g. to prefill the
-- location picker when editing a listing) without granting the column
-- to everyone.
CREATE OR REPLACE FUNCTION public.get_listing_owner_location(_listing_id uuid)
RETURNS TABLE (lat double precision, lng double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.lat, l.lng
  FROM public.listings l
  WHERE l.id = _listing_id AND l.seller_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_listing_owner_location(uuid) TO authenticated;

-- listings_within_radius reads exact lat/lng for distance math and is called
-- directly by anon/authenticated; switch it to SECURITY DEFINER so it keeps
-- working after the column revoke above (it still only ever returns
-- id + distance_km, never the coordinates themselves).
CREATE OR REPLACE FUNCTION public.listings_within_radius(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision
)
RETURNS TABLE(id uuid, distance_km double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
