-- Fixes a search gap reported by a user: searching "stasjonsvogn" found no
-- results for a listing whose title was "2021 Volvo V90 cross country" even
-- though it IS a stasjonsvogn (station wagon) — the SVV vehicle lookup
-- stores that as attributes.vehicle_lookup.body_type_hint (e.g. "Stasjonsvogn
-- (AC)"), but listings_search_vector_trigger() (see
-- 20260604073224_a10f3947-4fe1-4155-af75-6d24084ab7df.sql) only indexes
-- title/description/city, so vehicle-lookup data was never searchable.
--
-- attributes.vehicle_lookup is itself a JSON-encoded *string* (not a nested
-- JSONB object — see parseVehicleLookup / vehicle-lookup.functions.ts),
-- so it needs an extra cast; wrapped in an exception handler since it's
-- absent for non-vehicle listings and, in principle, could be malformed.
CREATE OR REPLACE FUNCTION public.listings_search_vector_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  body_type_hint text;
BEGIN
  BEGIN
    body_type_hint := (NEW.attributes->>'vehicle_lookup')::jsonb ->> 'body_type_hint';
  EXCEPTION WHEN OTHERS THEN
    body_type_hint := NULL;
  END;

  NEW.search_vector :=
    setweight(to_tsvector('norwegian', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('norwegian', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('norwegian', coalesce(NEW.city, '')), 'C') ||
    setweight(to_tsvector('norwegian', coalesce(body_type_hint, '')), 'C');
  RETURN NEW;
END;
$$;

-- Re-fire on attribute changes too (a vehicle-lookup re-run updates
-- attributes without necessarily touching title/description/city).
DROP TRIGGER IF EXISTS listings_search_vector_update ON public.listings;
CREATE TRIGGER listings_search_vector_update
BEFORE INSERT OR UPDATE OF title, description, city, attributes ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_search_vector_trigger();

-- Backfill: recompute search_vector for every existing row, since the
-- trigger only runs going forward and this listing (among others) was
-- inserted before this fix.
UPDATE public.listings SET attributes = attributes;
