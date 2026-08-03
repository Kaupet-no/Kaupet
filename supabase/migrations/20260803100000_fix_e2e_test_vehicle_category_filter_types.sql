-- Fixes 20260803090000_e2e_test_vehicle_category.sql: "is this a vehicle
-- category" (isVehicle/vehicleCategoryGroupFor, see src/lib/category-
-- filters.ts) is driven entirely by whether the category has a
-- `brand_select`-type filter — not by being a descendant of "Bil og MC".
-- The previous migration used plain `text` filters, so the wizard never
-- recognized the test category as a vehicle one: it rendered the generic
-- attributes flow (Merke/Modell as plain fields, plus an unrelated
-- "Teknisk" equipment checklist) instead of the vehicle-facts/
-- vehicle-condition steps this test exists to cover.
--
-- Switches to the same brand_select/model_select types real vehicle
-- categories use, in the "bil" reference-data group — Volvo/XC60 are part
-- of the curated seed data in 20260702000000_vehicle_brands_models.sql, so
-- no new reference rows are needed.
UPDATE public.category_filters cf
SET type = 'brand_select', unit = 'bil'
FROM public.categories c
WHERE cf.category_id = c.id AND c.slug = 'e2e-test-vehicle' AND cf.key = 'brand';

UPDATE public.category_filters cf
SET type = 'model_select'
FROM public.categories c
WHERE cf.category_id = c.id AND c.slug = 'e2e-test-vehicle' AND cf.key = 'model';
