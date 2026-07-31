-- Adds "Ryggekamera" (rear-view camera) to Førerstøttesystemer
-- (utstyr_forerstotte) — a common piece of equipment buyers search for
-- (see Fase 2.2A's "Hvit Volvo stasjonsvogn med automatgir og ryggekamera"
-- example) that was missing from the seeded equipment list in
-- 20260724130000_bil_og_mc_utstyr_filters.sql. Appended rather than
-- re-sorted alphabetically into the existing array — checkbox order is
-- cosmetic only, not worth the extra complexity of rebuilding the array.
UPDATE public.category_filters cf
SET options = options || '[{"value": "ryggekamera", "label_nb": "Ryggekamera"}]'::jsonb
FROM public.categories c
WHERE cf.category_id = c.id
  AND cf.key = 'utstyr_forerstotte'
  AND c.slug = 'bil-og-mc' AND c.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(cf.options) opt WHERE opt->>'value' = 'ryggekamera'
  );

INSERT INTO public.filter_synonyms (category_filter_id, option_value, phrase, is_generated)
SELECT cf.id, 'ryggekamera', 'ryggekamera', true
FROM public.category_filters cf
JOIN public.categories c ON c.id = cf.category_id
WHERE cf.key = 'utstyr_forerstotte' AND c.slug = 'bil-og-mc' AND c.parent_id IS NULL
ON CONFLICT (category_filter_id, option_value, phrase) DO NOTHING;
