-- 20260721130000 overwrote field_groups for bil-og-mc entirely and dropped
-- "vehicle-registration" from the array by accident, which sent Bil og MC
-- listings through the generic flow instead of starting with regnummer
-- lookup. Restore it as the first field group.
UPDATE public.category_flows
SET field_groups = '{vehicle-registration,category-attributes,title-photos,description-keywords,delivery-location,review-publish}'
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL);
