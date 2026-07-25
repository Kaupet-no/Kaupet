-- QR-koden for 360°-opptak skal være den samme gjennom hele annonsens
-- utkast-levetid — ikke en tidsbegrenset engangskode brukeren må generere på
-- nytt. Gjør expires_at valgfri (brukes ikke lenger til å avvise gamle
-- økter) og legg til én-økt-per-annonse slik at gjentatte kall er idempotente
-- (samme token gjenbrukes i stedet for å opprette en ny rad).
ALTER TABLE public.listing_360_capture_sessions ALTER COLUMN expires_at DROP NOT NULL;

-- Rydd bort duplikater fra før idempotens (flere økter kunne opprettes per
-- annonse mens hver QR-generering laget en ny rad) — behold kun den eldste
-- raden per annonse, slik at unik-begrensningen under kan legges på.
DELETE FROM public.listing_360_capture_sessions a
  USING public.listing_360_capture_sessions b
  WHERE a.listing_id = b.listing_id
    AND (a.created_at, a.id) > (b.created_at, b.id);

ALTER TABLE public.listing_360_capture_sessions
  ADD CONSTRAINT listing_360_capture_sessions_listing_id_key UNIQUE (listing_id);
