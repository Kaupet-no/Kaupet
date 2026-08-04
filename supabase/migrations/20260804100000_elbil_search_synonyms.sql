-- Legger til manuelle fritekst-synonymer for fuel_type = 'el' ("elbil",
-- "elektrisk", "elektrisk bil") — den generiske seeden i
-- 20260731140000_filter_synonyms.sql seeder kun options-label_nb rått
-- (lowercased "el"), som ikke dekker hvordan folk faktisk søker.
INSERT INTO public.filter_synonyms (category_filter_id, option_value, phrase, is_generated)
SELECT cf.id, 'el', phrase, false
FROM public.category_filters cf
CROSS JOIN (VALUES ('elbil'), ('elektrisk'), ('elektrisk bil')) AS p(phrase)
WHERE cf.key = 'fuel_type'
  AND cf.options IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(cf.options) opt WHERE opt->>'value' = 'el'
  )
ON CONFLICT (category_filter_id, option_value, phrase) DO NOTHING;
