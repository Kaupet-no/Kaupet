-- Bedriftsannonser bruker bedriftsadressen som lokasjon, ikke en adresse
-- satt per annonse. Adressen hentes fra Brønnøysundregistrene ved
-- registrering (handle_new_user) og kan endres av en superbruker i
-- bedriftskonsollet. Koordinatene slås opp fra postnummeret første gang de
-- trengs og bufres her, slik at import av 500 annonser ikke gjør 500
-- geokodingskall.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

-- Adresseendring gjør bufrede koordinater ugyldige.
CREATE OR REPLACE FUNCTION public.clear_organization_coordinates_on_address_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.postal_code IS DISTINCT FROM OLD.postal_code
    OR NEW.city IS DISTINCT FROM OLD.city
  THEN
    IF NEW.lat IS NOT DISTINCT FROM OLD.lat AND NEW.lng IS NOT DISTINCT FROM OLD.lng THEN
      NEW.lat := NULL;
      NEW.lng := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_clear_coordinates ON public.organizations;
CREATE TRIGGER organizations_clear_coordinates
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.clear_organization_coordinates_on_address_change();
