-- Personbil sine brand/model-filtre ble på et tidspunkt (trolig via
-- admin/kategorier-UI) tilbakestilt til vanlig 'select' med tom options-liste,
-- i strid med 20260702000000_vehicle_brands_models.sql som satte dem til de
-- koblede 'brand_select'/'model_select'-typene. Alle andre kjøretøykategorier
-- (varebil, motorsykkel, bobil-og-campingvogn, moped-og-scooter,
-- atv-og-snoscooter) har fortsatt riktig type — retter kun Personbil tilbake
-- til samme oppsett.
UPDATE public.category_filters cf
SET type = 'brand_select', unit = 'bil', options = NULL
FROM public.categories c
WHERE cf.category_id = c.id AND c.slug = 'personbil' AND cf.key = 'brand';

UPDATE public.category_filters cf
SET type = 'model_select', options = NULL
FROM public.categories c
WHERE cf.category_id = c.id AND c.slug = 'personbil' AND cf.key = 'model';
