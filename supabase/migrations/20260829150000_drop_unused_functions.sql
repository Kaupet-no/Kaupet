-- Fire funksjoner uten kallere i kildekoden, verifisert ved statisk
-- analyse (ingen .rpc()-kall, ingen intern SQL-referanse fra andre
-- funksjoner/views/triggere):
--
-- demo_activate_promotion, get_listing_owner_location og
-- listings_within_radius har eksistert siden baseline-squashen og fikk
-- eksplisitt GRANT EXECUTE i 20260812112000_harden_function_privileges_
-- and_search_logging.sql, men ingen appkode kaller dem — listings_within_
-- radius sin Haversine-beregning er siden reimplementert direkte i
-- search_listings_page (20260812114000_paginate_listing_search_in_
-- database.sql).
--
-- listings_assign_kaupet_code() er en trigger-funksjon som aldri ble
-- bundet til noen CREATE TRIGGER — kolonnen listings.kaupet_code får i
-- stedet sin verdi fra DEFAULT public.generate_kaupet_code() direkte i
-- tabelldefinisjonen, som er den faktiske mekanismen i bruk.
DROP FUNCTION IF EXISTS public.demo_activate_promotion(uuid, integer);
DROP FUNCTION IF EXISTS public.get_listing_owner_location(uuid);
DROP FUNCTION IF EXISTS public.listings_within_radius(double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.listings_assign_kaupet_code();
