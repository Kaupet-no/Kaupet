-- For Bil og MC, step 3 (title-photos) should be images only — Tittel,
-- Tilstand and Pris move onto the "Beskrivelse" step (description-keywords),
-- which now also renders them for vehicle listings (see
-- description-keywords/index.tsx's DescriptionKeywordsGroup). "condition"
-- and "price" are removed from the stored field_groups entirely (they are
-- not in category_flows_field_groups_required, so this is allowed) —
-- rendering them as their own field groups would duplicate what
-- DescriptionKeywordsGroup already renders inline for isVehicle.
UPDATE public.category_flows
SET field_groups = '{category-attributes,title-photos,description-keywords,delivery-location,review-publish}'
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL);
