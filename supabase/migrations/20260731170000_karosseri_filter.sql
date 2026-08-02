-- Promotes vehicle body type from a plain search-text hint (see
-- 20260731160000_search_vector_vehicle_body_type.sql, which made
-- "stasjonsvogn" findable via free text) into a real, clickable filter —
-- so a buyer can also narrow results via "Karosseri" the same way they
-- already can with Drivstoff/Girkasse/Farge, and so it participates in the
-- filter_synonyms search-phrase dictionary from Fase 2.2A.
--
-- Scoped to "Bil" only (not Bobil/Motorsykkel/ATV/Moped og scooter), since
-- sedan/stasjonsvogn/SUV body styles are a car-specific concept — matches
-- the existing pattern where "Hjuldrift" is likewise Bil-only.
INSERT INTO public.category_filters
  (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, 'body_type', 'Karosseri', 'select', NULL,
  '[
    {"value": "sedan", "label_nb": "Sedan"},
    {"value": "stasjonsvogn", "label_nb": "Stasjonsvogn"},
    {"value": "suv", "label_nb": "SUV"},
    {"value": "cabriolet", "label_nb": "Cabriolet"},
    {"value": "coupe", "label_nb": "Coupé"},
    {"value": "kombi", "label_nb": "Kombi"},
    {"value": "pickup", "label_nb": "Pickup"},
    {"value": "minibuss", "label_nb": "Minibuss/varebil"}
  ]'::jsonb,
  55, true
FROM public.categories c
JOIN public.categories p ON c.parent_id = p.id
WHERE c.slug = 'bil' AND p.slug = 'bil-og-mc' AND p.parent_id IS NULL
ON CONFLICT (category_id, key) DO NOTHING;

-- Backfill: derive body_type for existing Bil listings from the SVV lookup's
-- body_type_hint (e.g. "Stasjonsvogn (AC)") where it maps to one of the
-- options above. Left unset (not forced to a fallback) when the hint text
-- doesn't match a known label, rather than guessing.
UPDATE public.listings l
SET attributes = attributes || jsonb_build_object('body_type', mapped.value)
FROM (
  SELECT
    l2.id,
    CASE lower(split_part((l2.attributes->>'vehicle_lookup')::jsonb ->> 'body_type_hint', ' (', 1))
      WHEN 'sedan' THEN 'sedan'
      WHEN 'stasjonsvogn' THEN 'stasjonsvogn'
      WHEN 'suv' THEN 'suv'
      WHEN 'cabriolet' THEN 'cabriolet'
      WHEN 'coupé' THEN 'coupe'
      WHEN 'coupe' THEN 'coupe'
      WHEN 'kombi' THEN 'kombi'
      WHEN 'pickup' THEN 'pickup'
      WHEN 'minibuss' THEN 'minibuss'
      ELSE NULL
    END AS value
  FROM public.listings l2
  JOIN public.categories c ON c.id = l2.category_id
  WHERE c.slug = 'bil'
    AND l2.attributes ? 'vehicle_lookup'
) mapped
WHERE l.id = mapped.id AND mapped.value IS NOT NULL;

-- Seed filter_synonyms for the new options, reusing the same generic
-- "one row per select option label" rule as the original seeding pass (see
-- 20260731140000_filter_synonyms.sql) — idempotent, so safe to re-run.
INSERT INTO public.filter_synonyms (category_filter_id, option_value, phrase, is_generated)
SELECT cf.id, opt->>'value', lower(opt->>'label_nb'), true
FROM public.category_filters cf
CROSS JOIN LATERAL jsonb_array_elements(cf.options) opt
WHERE cf.key = 'body_type' AND cf.options IS NOT NULL
ON CONFLICT (category_filter_id, option_value, phrase) DO NOTHING;
