-- Utvider settet med kjøretøy-filtre som alltid vises i filter-raden på
-- søkeresultatsiden (is_primary = true) med Drivstoff. Merke, Modell,
-- Årsmodell og Kilometerstand var primary fra før
-- (20260710120000_vehicle_filters_primary_curation.sql); Drivstoff lå bak
-- "Se flere filter" selv om det er et av de mest brukte søkefiltrene på bil.
--
-- Førstegangsregistrering håndteres i neste migrasjon
-- (20260729130000_first_registration_year_numeric.sql), som konverterer det
-- fra fritekst-dato til et numerisk år og setter is_primary der.

UPDATE public.category_filters cf
SET is_primary = true
FROM public.categories c
WHERE cf.category_id = c.id
  AND c.slug IN (
    'personbil',
    'varebil',
    'bobil-og-campingvogn',
    'motorsykkel',
    'moped-og-scooter',
    'atv-og-snoscooter',
    'lastebil-og-henger',
    'buss-og-minibuss',
    'traktor-og-redskap'
  )
  AND cf.key = 'fuel_type';