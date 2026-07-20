-- Splits the "Bobil og campingvogn" leaf category into a level-2 parent
-- (sibling of Biler/MC og moped/Deler og tilbehør/Tilhenger under Bil og MC)
-- with two level-3 leaves under it: "Bobil" (motorized, keeps the full
-- vehicle spec set) and "Campingvogn" (towed, no engine — no mileage/fuel/
-- transmission/power/cylinder fields). Mirrors the existing Tilhenger
-- (parent) / tilhenger-leaf (leaf) pattern.
--
-- The old "bobil-og-campingvogn" category row is repurposed as the new
-- parent (same id/slug/name), so nothing referencing it by id breaks; its
-- category_filters and any existing listings/wtb_listings are moved to the
-- new "bobil" leaf, since every existing classification signal (avgiftsklasse
-- 313/316/336, EU class M1) only ever identified motorized campingbil, never
-- a towed campingvogn.

-- 1. New leaf categories under the (still leaf-shaped, for one more moment)
--    "bobil-og-campingvogn" row.
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT 'bobil', 'Bobil', 1, c.id FROM public.categories c WHERE c.slug = 'bobil-og-campingvogn'
UNION ALL
SELECT 'campingvogn', 'Campingvogn', 2, c.id FROM public.categories c WHERE c.slug = 'bobil-og-campingvogn';

-- 2. Move the existing category_filters rows (brand/model/year/length_m/
--    mileage_km/fuel_type/transmission/power_hk/weight_kg/tow_hitch/
--    max_tow_weight_kg/seats/sleeping_places/imported_used/
--    first_registration_date/color/cylinders/engine_code/next_eu_control)
--    onto the new "bobil" leaf as-is — full spec parity, it's motorized.
UPDATE public.category_filters cf
SET category_id = b.id
FROM public.categories old, public.categories b
WHERE old.slug = 'bobil-og-campingvogn' AND b.slug = 'bobil' AND cf.category_id = old.id;

-- 3. Fresh, reduced filter set for "Campingvogn" — no engine, so no mileage/
--    fuel_type/transmission/power_hk/cylinders/engine_code; also no
--    tow_hitch/max_tow_weight_kg (those describe a vehicle's own towing
--    capacity, not a trailer being towed).
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, f.key, f.label_nb, f.type, f.unit, f.options::jsonb, f.sort_order, f.is_primary
FROM (VALUES
  ('brand', 'Merke', 'brand_select', 'bobil_campingvogn', NULL, 1, true),
  ('model', 'Modell', 'model_select', NULL, NULL, 2, true),
  ('year', 'Årsmodell', 'number', NULL, NULL, 3, true),
  ('length_m', 'Lengde', 'number', 'm', NULL, 4, true),
  ('weight_kg', 'Egenvekt', 'number', 'kg', NULL, 5, false),
  ('sleeping_places', 'Soveplasser', 'number', NULL, NULL, 6, false),
  ('imported_used', 'Bruktimportert', 'boolean', NULL, NULL, 7, false),
  ('first_registration_date', 'Første registrering', 'text', NULL, NULL, 8, false),
  ('color', 'Farge', 'text', NULL, NULL, 9, false),
  ('next_eu_control', 'Neste EU-kontroll', 'text', NULL, NULL, 10, false)
) AS f(key, label_nb, type, unit, options, sort_order, is_primary)
CROSS JOIN public.categories c
WHERE c.slug = 'campingvogn';

-- 4. Reassign any existing listings/wtb_listings currently classified under
--    the old leaf onto the new "bobil" leaf (see rationale above — nothing
--    in Kaupet's classification signals has ever produced a "campingvogn"
--    result, so every pre-existing row is, by construction, a bobil).
UPDATE public.listings l
SET category_id = b.id
FROM public.categories old, public.categories b
WHERE old.slug = 'bobil-og-campingvogn' AND b.slug = 'bobil' AND l.category_id = old.id;

UPDATE public.wtb_listings l
SET category_id = b.id
FROM public.categories old, public.categories b
WHERE old.slug = 'bobil-og-campingvogn' AND b.slug = 'bobil' AND l.category_id = old.id;

-- 5. Promote the old row to a level-2 parent, sibling of Biler/MC og moped/
--    Deler og tilbehør/Tilhenger under Bil og MC.
UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL),
    sort_order = 5
WHERE slug = 'bobil-og-campingvogn';
