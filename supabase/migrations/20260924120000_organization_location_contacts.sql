-- Kontaktinfo per bedriftslokasjon: telefonnumre (med navn og, for Proff,
-- profilbilde) og besøksadresse som bedriften selv velger å vise i annonser.
--
-- Erstatter per-annonse-valget listings.show_visiting_address /
-- listing_visiting_addresses (øyeblikksbilde). Kolonnen og tabellen blir
-- liggende urørt, men leses ikke lenger av appen.

ALTER TABLE public.organization_locations
  ADD COLUMN IF NOT EXISTS show_visiting_address boolean NOT NULL DEFAULT false,
  -- Eksakte koordinater for gateadressen. lat/lng er postnummerpresisjon og
  -- brukes som omtrentlig annonseposisjon; de to må ikke blandes.
  ADD COLUMN IF NOT EXISTS visiting_lat double precision,
  ADD COLUMN IF NOT EXISTS visiting_lng double precision;

-- Bevar dagens atferd: lokasjoner med minst én aktiv annonse som viser
-- besøksadressen, fortsetter å vise den.
UPDATE public.organization_locations loc
SET show_visiting_address = true
WHERE EXISTS (
  SELECT 1 FROM public.listings l
  WHERE l.organization_location_id = loc.id
    AND l.status = 'active'::public.listing_status
    AND l.show_visiting_address
);

CREATE TABLE public.organization_location_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  avatar_path text,
  show_in_listings boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_location_contacts_location_fk
    FOREIGN KEY (location_id, organization_id)
    REFERENCES public.organization_locations(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT organization_location_contacts_name_length
    CHECK (length(trim(name)) BETWEEN 1 AND 120),
  -- Normalisert på serveren: valgfri «+» og 8–15 siffer, ingen mellomrom.
  CONSTRAINT organization_location_contacts_phone_format
    CHECK (phone ~ '^\+?[0-9]{8,15}$'),
  CONSTRAINT organization_location_contacts_avatar_path_scope
    CHECK (avatar_path IS NULL OR avatar_path LIKE organization_id::text || '/contact-%')
);
CREATE INDEX organization_location_contacts_location_idx
  ON public.organization_location_contacts (location_id, sort_order);
CREATE TRIGGER organization_location_contacts_set_updated_at
  BEFORE UPDATE ON public.organization_location_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Skrives og leses kun via serverfunksjoner (service role) og RPC-en under.
ALTER TABLE public.organization_location_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_location_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_location_contacts TO service_role;

-- Offentlig kontaktinfo for én annonse. Returnerer bare det bedriften har
-- valgt å vise, og bare for aktive annonser (eller for medlemmer som uansett
-- kan se annonsen). Profilbilder krever aktiv Proff på lesetidspunktet, slik
-- at de forsvinner når Proff utløper uten at lagrede data slettes.
CREATE OR REPLACE FUNCTION public.listing_business_contact(_listing_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'visiting_address', CASE
      WHEN loc.show_visiting_address AND loc.address_line IS NOT NULL THEN jsonb_build_object(
        'address_line', loc.address_line,
        'postal_code', loc.postal_code,
        'city', loc.city,
        'lat', loc.visiting_lat,
        'lng', loc.visiting_lng
      )
    END,
    'contacts', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'phone', c.phone,
          'avatar_path', CASE WHEN public.organization_has_proff_access(l.organization_id) THEN c.avatar_path END
        )
        ORDER BY c.sort_order, c.created_at
      )
      FROM public.organization_location_contacts c
      WHERE c.location_id = loc.id AND c.show_in_listings
    ), '[]'::jsonb)
  )
  FROM public.listings l
  JOIN public.organization_locations loc
    ON loc.id = l.organization_location_id AND loc.organization_id = l.organization_id
  WHERE l.id = _listing_id
    AND loc.active
    AND (
      l.status = 'active'::public.listing_status
      OR public.can_view_organization_listing(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.listing_business_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_business_contact(uuid) TO anon, authenticated, service_role;
