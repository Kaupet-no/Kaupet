-- KG-14-F01: listing_visiting_addresses er et gammelt øyeblikksbilde som appen
-- ikke leser lenger (se 20260924120000). Policyen fulgte
-- listings.show_visiting_address, som ikke oppdateres når bedriften skjuler
-- adressen på lokasjonen, så en skjult gateadresse kunne fortsatt leses
-- anonymt. Gjeldende kontaktdata går via listing_business_contact.
-- Importskriverne er SECURITY DEFINER og påvirkes ikke.
DROP POLICY IF EXISTS listing_visiting_addresses_public_select ON public.listing_visiting_addresses;
REVOKE ALL ON TABLE public.listing_visiting_addresses FROM PUBLIC, anon, authenticated;
