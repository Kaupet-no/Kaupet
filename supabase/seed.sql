-- Minimal reference data for local development and isolated CI/E2E databases.
-- This file is applied by `supabase start` after migrations and is not pushed
-- to hosted environments as a database migration.

INSERT INTO public.categories (slug, name_nb, sort_order, icon, is_hidden)
VALUES
  ('bil-og-mc', 'Bil og MC', 10, 'Car', false),
  ('e2e-test-listing', 'E2E-test (ikke bruk)', 9999, 'FlaskConical', true)
ON CONFLICT (slug) DO UPDATE SET
  name_nb = EXCLUDED.name_nb,
  sort_order = EXCLUDED.sort_order,
  icon = EXCLUDED.icon,
  is_hidden = EXCLUDED.is_hidden;

INSERT INTO public.categories (slug, name_nb, sort_order, parent_id, icon, is_hidden)
SELECT
  'e2e-test-vehicle',
  'E2E-test kjøretøy (ikke bruk)',
  9999,
  id,
  'FlaskConical',
  true
FROM public.categories
WHERE slug = 'bil-og-mc'
ON CONFLICT (slug) DO UPDATE SET
  name_nb = EXCLUDED.name_nb,
  sort_order = EXCLUDED.sort_order,
  parent_id = EXCLUDED.parent_id,
  icon = EXCLUDED.icon,
  is_hidden = EXCLUDED.is_hidden;

INSERT INTO public.category_flows (category_id, modules, field_groups)
SELECT
  id,
  ARRAY['generic-attributes'],
  ARRAY[
    'vehicle-registration',
    'category-attributes',
    'title-photos',
    'vehicle-facts',
    'vehicle-condition',
    'description-keywords',
    'delivery-location',
    'review-publish'
  ]
FROM public.categories
WHERE slug = 'bil-og-mc'
ON CONFLICT (category_id) DO UPDATE SET
  modules = EXCLUDED.modules,
  field_groups = EXCLUDED.field_groups;

INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, sort_order)
SELECT category.id, filter.key, filter.label_nb, filter.type, filter.unit, filter.sort_order
FROM public.categories AS category
CROSS JOIN (
  VALUES
    ('brand', 'Merke', 'brand_select', 'bil', 1),
    ('model', 'Modell', 'model_select', NULL, 2)
) AS filter(key, label_nb, type, unit, sort_order)
WHERE category.slug = 'e2e-test-vehicle'
ON CONFLICT (category_id, key) DO UPDATE SET
  label_nb = EXCLUDED.label_nb,
  type = EXCLUDED.type,
  unit = EXCLUDED.unit,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Volvo', 'bil', 'approved')
ON CONFLICT (name, category_group) DO UPDATE SET status = EXCLUDED.status;

INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT id, 'XC60', 'approved'
FROM public.vehicle_brands
WHERE name = 'Volvo' AND category_group = 'bil'
ON CONFLICT (brand_id, name) DO UPDATE SET status = EXCLUDED.status;
