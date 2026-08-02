-- Dedicated leaf category for the vehicle-flow e2e test
-- (e2e/publish-vehicle-listing.spec.ts) — the "Bil og MC" flow branches
-- into vehicle-registration/vehicle-facts/vehicle-condition steps not
-- covered by publish-listing.spec.ts. Mirrors the reasoning in
-- 20260802210000_e2e_test_category.sql: owning the test category avoids
-- coupling to a real vehicle leaf's attributes changing under admin.
--
-- Needs exactly "brand" and "model" as category_filters (both text, and
-- both required — AttributeFields always treats every filter for a category
-- as required in the listing-creation wizard, there is no per-filter
-- optional flag) because the vehicle title step computes the listing title
-- from attributes.year/brand/model (see src/lib/vehicle/vehicle-title.ts)
-- and can't be edited directly for vehicle categories — without these two
-- attributes the title would stay empty and the wizard could never advance.
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id, icon)
SELECT 'e2e-test-vehicle', 'E2E-test kjøretøy (ikke bruk)', 9999, id, 'FlaskConical'
FROM public.categories
WHERE slug = 'bil-og-mc' AND parent_id IS NULL;

INSERT INTO public.category_filters (category_id, key, label_nb, type, sort_order)
SELECT c.id, v.key, v.label_nb, 'text', v.sort_order
FROM public.categories c
JOIN (VALUES
  ('brand', 'Merke', 1),
  ('model', 'Modell', 2)
) AS v(key, label_nb, sort_order) ON true
WHERE c.slug = 'e2e-test-vehicle';
