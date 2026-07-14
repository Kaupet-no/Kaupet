-- Kilometerstand er ikke tilgjengelig fra Statens vegvesen sitt
-- enkeltoppslag-API, og må derfor oppgis av selger. Legges til som en vanlig
-- category_filters-rad (type 'number') slik at den automatisk vises som
-- eget felt i category-attributes-steget i vehicle-first-flyten, og
-- håndheves som påkrevd av getMissingRequiredFilters før publisering, på
-- samme måte som de øvrige Vegvesenet-feltene (se
-- 20260707100000_wtb_subtitle_and_vehicle_filters.sql). sort_order=5 plasserer
-- feltet rett etter model/fuel_type/transmission og før power_hk/weight_kg på
-- alle kjøretøy-kategoriene, uten å måtte omnummerere eksisterende rader
-- (som varierer i sort_order per kategori).
--
-- Tilhenger er utelatt: en tilhenger har ingen egen kilometerteller.
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
SELECT c.id, 'mileage_km', 'Kilometerstand', 'number', 'km', NULL, 5
FROM public.categories c
WHERE c.slug IN (
  'personbil',
  'varebil',
  'bobil-og-campingvogn',
  'motorsykkel',
  'moped-og-scooter',
  'atv-og-snoscooter'
)
AND NOT EXISTS (
  SELECT 1 FROM public.category_filters cf WHERE cf.category_id = c.id AND cf.key = 'mileage_km'
);
