-- Vehicle-first UX: "Bil og MC" now asks only for registreringsnummer up
-- front (see src/features/listing-creation/field-groups/vehicle-registration
-- and .../vehicle-confirm) instead of forcing the user to pick a leaf
-- category manually. Replaces the old inline vehicle-lookup module (removed)
-- with the vehicle-registration field group, placed before category-attributes
-- so the Statens Vegvesen lookup fills brand/model/year before the title step
-- reads them, same as before.

UPDATE public.category_flows
SET
  modules = ARRAY['generic-attributes'],
  field_groups = ARRAY[
    'vehicle-registration',
    'category-attributes',
    'title-photos',
    'condition',
    'price',
    'description-keywords',
    'delivery-location',
    'review-publish'
  ]
WHERE category_id IN (
  SELECT c.id FROM public.categories c WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL
);
