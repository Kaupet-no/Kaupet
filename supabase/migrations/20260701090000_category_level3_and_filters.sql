-- Adds a third category level (leaf subcategories under an existing
-- subcategory) for a representative set of categories, plus category_filters
-- seed data on those leaves. This is not meant to be an exhaustive taxonomy —
-- it demonstrates the pattern (main -> sub -> leaf, with filters on the leaf)
-- for "Klær og mote" and "Elektronikk" and can be extended the same way.
--
-- categories.parent_id is self-referential and already supports arbitrary
-- depth, so no schema change is needed here — only new rows.

-- 1. Klær og mote -> Herreklær / Dameklær (level 2, if not already present)
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT v.slug, v.name_nb, v.sort_order, p.id
FROM (VALUES
  ('herreklaer', 'Herreklær', 1, 'klar-og-mote'),
  ('dameklaer', 'Dameklær', 2, 'klar-og-mote'),
  ('barneklaer', 'Barneklær', 3, 'klar-og-mote')
) AS v(slug, name_nb, sort_order, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- 2. Herreklær / Dameklær -> leaf subcategories (level 3)
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT v.slug, v.name_nb, v.sort_order, p.id
FROM (VALUES
  ('herre-bukse', 'Bukse', 1, 'herreklaer'),
  ('herre-jakke', 'Jakke', 2, 'herreklaer'),
  ('herre-skjorte', 'Skjorte', 3, 'herreklaer'),
  ('herre-sko', 'Sko', 4, 'herreklaer'),
  ('dame-kjole', 'Kjole', 1, 'dameklaer'),
  ('dame-bukse', 'Bukse', 2, 'dameklaer'),
  ('dame-jakke', 'Jakke', 3, 'dameklaer'),
  ('dame-sko', 'Sko', 4, 'dameklaer')
) AS v(slug, name_nb, sort_order, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- 3. Elektronikk -> TV og lyd (level 2), then TV / Høyttalere (level 3)
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT 'tv-og-lyd', 'TV og lyd', 5, p.id
FROM public.categories p WHERE p.slug = 'elektronikk'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'tv-og-lyd');

INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT v.slug, v.name_nb, v.sort_order, p.id
FROM (VALUES
  ('tv', 'TV', 1, 'tv-og-lyd'),
  ('hoyttalere', 'Høyttalere', 2, 'tv-og-lyd')
) AS v(slug, name_nb, sort_order, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- 4. Filters on the leaf categories (clothing size + brand for clothes,
--    screen size + panel tech for TVs). Idempotent via ON CONFLICT on the
--    (category_id, key) unique constraint.
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
SELECT c.id, f.key, f.label_nb, f.type, f.unit, f.options::jsonb, f.sort_order
FROM (VALUES
  ('herre-bukse', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('herre-bukse', 'brand', 'Merke/designer', 'text', NULL, NULL, 2),
  ('herre-jakke', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('herre-jakke', 'brand', 'Merke/designer', 'text', NULL, NULL, 2),
  ('herre-skjorte', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('herre-skjorte', 'brand', 'Merke/designer', 'text', NULL, NULL, 2),
  ('herre-sko', 'shoe_size_eu', 'Skostørrelse (EU)', 'number', NULL, NULL, 1),
  ('herre-sko', 'brand', 'Merke/designer', 'text', NULL, NULL, 2),
  ('dame-kjole', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('dame-kjole', 'brand', 'Merke/designer', 'text', NULL, NULL, 2),
  ('dame-bukse', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('dame-bukse', 'brand', 'Merke/designer', 'text', NULL, NULL, 2),
  ('dame-jakke', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('dame-jakke', 'brand', 'Merke/designer', 'text', NULL, NULL, 2),
  ('dame-sko', 'shoe_size_eu', 'Skostørrelse (EU)', 'number', NULL, NULL, 1),
  ('dame-sko', 'brand', 'Merke/designer', 'text', NULL, NULL, 2),
  ('tv', 'screen_size_inch', 'Skjermstørrelse', 'range', 'tommer', NULL, 1),
  ('tv', 'panel_tech', 'Panelteknologi', 'select', NULL,
    '[{"value":"oled","label_nb":"OLED"},{"value":"qled","label_nb":"QLED"},{"value":"led","label_nb":"LED"},{"value":"mini_led","label_nb":"Mini-LED"}]', 2),
  ('tv', 'brand', 'Merke', 'text', NULL, NULL, 3),
  ('hoyttalere', 'speaker_type', 'Type', 'select', NULL,
    '[{"value":"soundbar","label_nb":"Soundbar"},{"value":"bookshelf","label_nb":"Reolhøyttaler"},{"value":"floorstanding","label_nb":"Gulvhøyttaler"},{"value":"portable","label_nb":"Bærbar"}]', 1),
  ('hoyttalere', 'brand', 'Merke', 'text', NULL, NULL, 2)
) AS f(category_slug, key, label_nb, type, unit, options, sort_order)
JOIN public.categories c ON c.slug = f.category_slug
ON CONFLICT (category_id, key) DO NOTHING;
