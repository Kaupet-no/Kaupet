-- Prod drifted from staging: the "Bil og MC" main category never got renamed/
-- colored by 20260630120000_categories_color_and_restructure.sql because that
-- migration's UPDATE targeted slug 'bildeler-og-tilbehor', while prod's actual
-- row had slug 'bilrekvisita' with its own old, flatter subcategory tree. With
-- no color set, the landing page (which only shows colored root categories)
-- silently dropped this main category. This brings prod's "Bil og MC" subtree
-- in line with staging's (from 20260701100000_full_category_taxonomy.sql).

-- 1. Reassign listings from the old subtree to the main category before
--    deleting it, mirroring the pattern in 20260701100000.
UPDATE public.listings l
SET category_id = m.id
FROM public.categories c
JOIN public.categories m ON m.slug = 'bilrekvisita' AND m.parent_id IS NULL
WHERE l.category_id = c.id
  AND c.parent_id = m.id;
UPDATE public.wtb_listings l
SET category_id = m.id
FROM public.categories c
JOIN public.categories m ON m.slug = 'bilrekvisita' AND m.parent_id IS NULL
WHERE l.category_id = c.id
  AND c.parent_id = m.id;
-- 2. Delete the old level-2 subcategories (category_filters cascade with them).
DELETE FROM public.categories
WHERE parent_id IN (SELECT id FROM public.categories WHERE slug = 'bilrekvisita' AND parent_id IS NULL);
-- 3. Rename/color the root to match staging.
UPDATE public.categories
SET slug = 'bil-og-mc', name_nb = 'Bil og MC', icon = 'Car',
    color = 'oklch(0.55 0.06 260)', sort_order = 70
WHERE slug = 'bilrekvisita' AND parent_id IS NULL;
-- 4. Level-2 subcategories, matching staging.
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT v.slug, v.name_nb, v.sort_order, p.id
FROM (VALUES
  ('biler', 'Biler', 1, 'bil-og-mc'),
  ('mc-og-moped', 'MC og moped', 2, 'bil-og-mc'),
  ('deler-og-tilbehor', 'Deler og tilbehør', 3, 'bil-og-mc'),
  ('tilhenger', 'Tilhenger', 4, 'bil-og-mc')
) AS v(slug, name_nb, sort_order, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);
-- 5. Level-3 leaf categories, matching staging.
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT v.slug, v.name_nb, v.sort_order, p.id
FROM (VALUES
  ('personbil', 'Personbil', 1, 'biler'),
  ('varebil', 'Varebil', 2, 'biler'),
  ('bobil-og-campingvogn', 'Bobil og campingvogn', 3, 'biler'),
  ('motorsykkel', 'Motorsykkel', 1, 'mc-og-moped'),
  ('moped-og-scooter', 'Moped og scooter', 2, 'mc-og-moped'),
  ('atv-og-snoscooter', 'ATV og snøscooter', 3, 'mc-og-moped'),
  ('dekk-og-felg', 'Dekk og felg', 1, 'deler-og-tilbehor'),
  ('bilstereo-og-elektronikk', 'Bilstereo og elektronikk', 2, 'deler-og-tilbehor'),
  ('reservedeler', 'Reservedeler', 3, 'deler-og-tilbehor'),
  ('tilhenger-leaf', 'Tilhenger', 1, 'tilhenger')
) AS v(slug, name_nb, sort_order, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);
-- 6. Filters on the new leaf categories, matching staging.
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
SELECT c.id, f.key, f.label_nb, f.type, f.unit, f.options::jsonb, f.sort_order
FROM (VALUES
  ('personbil', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('personbil', 'model', 'Modell', 'text', NULL, NULL, 2),
  ('personbil', 'year', 'Årsmodell', 'number', NULL, NULL, 3),
  ('personbil', 'mileage_km', 'Kilometerstand', 'number', 'km', NULL, 4),
  ('personbil', 'fuel_type', 'Drivstoff', 'select', NULL,
    '[{"value":"bensin","label_nb":"Bensin"},{"value":"diesel","label_nb":"Diesel"},{"value":"el","label_nb":"El"},{"value":"hybrid","label_nb":"Hybrid"}]', 5),
  ('personbil', 'transmission', 'Girkasse', 'select', NULL,
    '[{"value":"manuell","label_nb":"Manuell"},{"value":"automat","label_nb":"Automat"}]', 6),
  ('varebil', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('varebil', 'model', 'Modell', 'text', NULL, NULL, 2),
  ('varebil', 'year', 'Årsmodell', 'number', NULL, NULL, 3),
  ('varebil', 'mileage_km', 'Kilometerstand', 'number', 'km', NULL, 4),
  ('varebil', 'fuel_type', 'Drivstoff', 'select', NULL,
    '[{"value":"bensin","label_nb":"Bensin"},{"value":"diesel","label_nb":"Diesel"},{"value":"el","label_nb":"El"},{"value":"hybrid","label_nb":"Hybrid"}]', 5),
  ('varebil', 'transmission', 'Girkasse', 'select', NULL,
    '[{"value":"manuell","label_nb":"Manuell"},{"value":"automat","label_nb":"Automat"}]', 6),
  ('bobil-og-campingvogn', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('bobil-og-campingvogn', 'year', 'Årsmodell', 'number', NULL, NULL, 2),
  ('bobil-og-campingvogn', 'length_m', 'Lengde', 'number', 'm', NULL, 3),

  ('motorsykkel', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('motorsykkel', 'model', 'Modell', 'text', NULL, NULL, 2),
  ('motorsykkel', 'year', 'Årsmodell', 'number', NULL, NULL, 3),
  ('motorsykkel', 'engine_cc', 'Motorvolum', 'number', 'cc', NULL, 4),
  ('moped-og-scooter', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('moped-og-scooter', 'year', 'Årsmodell', 'number', NULL, NULL, 2),
  ('atv-og-snoscooter', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('atv-og-snoscooter', 'year', 'Årsmodell', 'number', NULL, NULL, 2),

  ('dekk-og-felg', 'dimension', 'Dimensjon', 'text', NULL, NULL, 1),
  ('dekk-og-felg', 'season', 'Sesong', 'select', NULL,
    '[{"value":"sommer","label_nb":"Sommer"},{"value":"vinter","label_nb":"Vinter"},{"value":"helar","label_nb":"Helår"}]', 2),
  ('bilstereo-og-elektronikk', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('bilstereo-og-elektronikk', 'component_type', 'Type', 'text', NULL, NULL, 2),
  ('reservedeler', 'part_type', 'Deltype', 'text', NULL, NULL, 1),
  ('reservedeler', 'compatible_model', 'Passer til modell', 'text', NULL, NULL, 2),
  ('tilhenger-leaf', 'max_load_kg', 'Maks last', 'number', 'kg', NULL, 1)
) AS f(slug, key, label_nb, type, unit, options, sort_order)
JOIN public.categories c ON c.slug = f.slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.category_filters cf WHERE cf.category_id = c.id AND cf.key = f.key
);
