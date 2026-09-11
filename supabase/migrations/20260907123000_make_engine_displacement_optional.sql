-- Slagvolum er ikke relevant for alle drivstofftyper og skal derfor aldri
-- blokkere lagring eller publisering av en kjøretøyannonse.
UPDATE public.category_filters
SET is_optional = true
WHERE key = 'engine_displacement_cc'
  AND is_optional = false;
