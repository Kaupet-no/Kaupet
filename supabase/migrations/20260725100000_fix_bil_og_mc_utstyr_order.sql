-- 20260724130000 was already applied with "vehicle-equipment" placed right
-- after "vehicle-condition" (before "description-keywords") — that migration
-- file was corrected afterwards in the same PR to place vehicle-equipment
-- *after* description-keywords instead (so Utstyr renders directly under the
-- Beskrivelse field, not under Tilstand), but editing an already-applied
-- migration file doesn't retroactively change the row it already wrote. This
-- migration re-applies the corrected order.
UPDATE public.category_flows
SET field_groups = '{vehicle-registration,category-attributes,title-photos,vehicle-facts,vehicle-condition,description-keywords,vehicle-equipment,delivery-location,review-publish}'
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL);
