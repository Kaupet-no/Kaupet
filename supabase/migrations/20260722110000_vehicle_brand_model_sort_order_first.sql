-- Merke/Modell should be the first fields the user deals with when filling
-- in a vehicle's technical details manually (in AttributeFields, e.g. the
-- unregistered-vehicle path in vehicle-registration) — they're the fields
-- everything else conceptually hangs off, and Modell already depends on
-- Merke being picked first. sort_order for these two drifted across several
-- migrations (bulk inserts, the bobil/campingvogn split, the tilhenger fix)
-- and ended up anywhere from 1 to 191 depending on the leaf, with several
-- other fields sorted ahead of them. Pins both to the lowest sort_order for
-- every vehicle leaf category, regardless of what they were before.
UPDATE public.category_filters cf
SET sort_order = 1
FROM public.categories c
WHERE cf.category_id = c.id
  AND c.slug IN (
    'personbil', 'varebil', 'motorsykkel', 'moped-og-scooter',
    'atv-og-snoscooter', 'tilhenger-leaf', 'bobil', 'campingvogn'
  )
  AND cf.key = 'brand';

UPDATE public.category_filters cf
SET sort_order = 2
FROM public.categories c
WHERE cf.category_id = c.id
  AND c.slug IN (
    'personbil', 'varebil', 'motorsykkel', 'moped-og-scooter',
    'atv-og-snoscooter', 'tilhenger-leaf', 'bobil', 'campingvogn'
  )
  AND cf.key = 'model';
