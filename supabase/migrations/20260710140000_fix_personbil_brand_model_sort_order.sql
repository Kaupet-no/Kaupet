-- Personbil sine brand/model-filtre fikk (trolig via admin/kategorier-UI)
-- samme sort_order (190) som "Farge", slik at rekkefølgen mellom dem ble
-- vilkårlig — "Modell" kunne dukke opp før "Merke" selv om Modell er avhengig
-- av at Merke er valgt først (den viser "Velg merke først" til da). Gir Merke
-- en lavere sort_order enn Modell, uten å røre andre filtre.
UPDATE public.category_filters cf
SET sort_order = 190
FROM public.categories c
WHERE cf.category_id = c.id AND c.slug = 'personbil' AND cf.key = 'brand';

UPDATE public.category_filters cf
SET sort_order = 191
FROM public.categories c
WHERE cf.category_id = c.id AND c.slug = 'personbil' AND cf.key = 'model';
