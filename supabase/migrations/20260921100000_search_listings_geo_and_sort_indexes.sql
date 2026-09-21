-- Ytelsestiltak for /annonser-søket (public.search_listings_page): to
-- indekser.
--
-- To målte problemer:
--   1. Geofilteret regner haversine direkte på l.lat/l.lng, uten noen indeks
--      planleggeren kan bruke gjennom uttrykket. Hvert radius-søk blir en
--      seq scan over alle aktive annonser med trigonometri per rad.
--   2. listings_status_idx (status, published_at DESC) matcher ikke
--      standardsorteringen: alle ORDER BY i søkefunksjonene sorterer på
--      created_at, ikke published_at.
--
-- listings_status_idx røres ikke — den kan ha andre lesere enn søket.
--
-- Selve bounding box-forfilteret i public.search_listings_page som tar i
-- bruk listings_active_lat_idx, ligger i 20260921120000 — ikke her. To
-- CREATE OR REPLACE av samme funksjon i to parallelle grener er en
-- deploy-felle: den som anvendes sist vinner hele definisjonen, og Supabase
-- anvender migrasjoner etter hva som mangler i schema_migrations, ikke etter
-- tidsstempel-rekkefølge. 20260921120000 eier derfor funksjonskroppen alene.
-- Inntil den migrasjonen er anvendt, står listings_active_lat_idx ubrukt.

-- A. Indeks på breddegrad for geofilteret. Partial på status = 'active' fordi
-- BÅDE public.search_listings_page (20260921120000) og
-- public.match_listing_to_saved_searches (20260828130000) filtrerer
-- status = 'active' før geosjekken — det finnes ingen kall som trenger andre
-- statuser gjennom denne stien.
CREATE INDEX IF NOT EXISTS listings_active_lat_idx
  ON public.listings USING btree (lat)
  WHERE status = 'active' AND lat IS NOT NULL;

-- B. Indeks som matcher den faktiske sorteringen (created_at, ikke
-- published_at). listings_status_idx (status, published_at DESC) står urørt.
CREATE INDEX IF NOT EXISTS listings_active_created_at_idx
  ON public.listings USING btree (status, created_at DESC);
