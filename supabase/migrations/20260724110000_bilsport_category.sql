-- Ny underkategori "Bilsport" under Bil og MC: biler brukt til bilsport, som
-- regel uregistrerte og med en annen interessentgruppe enn ordinære
-- gatebiler. Ingen brand_select-filter her (fritekst, som Lastebil og
-- henger/Traktor og redskap/Anleggsmaskiner), så isVehicle blir false og
-- kategorien slipper SVV-kjøretøyoppslag-spesifikke felter.
--
-- "Er bilen lisensiert?" er et boolsk felt; "Gren" og "Klasse" er fritekst og
-- vises kun når lisensiert = ja (depends_on_key/depends_on_value, se
-- 20260724100000_category_filters_depends_on.sql).

INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT 'bilsport', 'Bilsport', 13, c.id
FROM public.categories c
WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL;

INSERT INTO public.category_filters
  (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, f.key, f.label_nb, f.type, NULL, NULL, f.sort_order, f.is_primary
FROM (VALUES
  ('er_lisensiert', 'Er bilen lisensiert?', 'boolean', 1, true),
  ('gren',   'Gren',   'text', 2, true),
  ('klasse', 'Klasse', 'text', 3, true)
) AS f(key, label_nb, type, sort_order, is_primary)
JOIN public.categories c ON c.slug = 'bilsport';

UPDATE public.category_filters cf
SET depends_on_key = 'er_lisensiert', depends_on_value = 'true'
FROM public.categories c
WHERE cf.category_id = c.id AND c.slug = 'bilsport' AND cf.key IN ('gren', 'klasse');
