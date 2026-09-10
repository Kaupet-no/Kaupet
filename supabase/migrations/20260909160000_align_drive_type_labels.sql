-- Én etikett for hjuldrift, ikke to.
--
-- category_filters.drive_type het "Forhjulsdrift/Bakhjulsdrift/Firehjulsdrift"
-- i basen, mens DRIVE_TYPE_LABEL_NB i src/components/listing-detail/vehicle/
-- vehicle-labels.ts og src/lib/vehicle/vehicle-options.ts har sagt
-- "...trekk" hele veien. Samme felt fikk derfor to navn i samme wizard:
-- "Forhjulsdrift" på kjøretøysteget, "Forhjulstrekk" på annonsesiden og i
-- det kjøretøyspesifikke oppsummeringsfeltet.
--
-- Koden vinner (avklart 2026-09-09). Opsjonsverdiene (forhjul/bakhjul/4x4)
-- er uendret, så ingen lagrede annonseattributter berøres — dette er kun
-- visningstekst.

UPDATE public.category_filters AS f
SET options = (
  SELECT jsonb_agg(
    CASE opt->>'value'
      WHEN 'forhjul' THEN jsonb_build_object('value', 'forhjul', 'label_nb', 'Forhjulstrekk')
      WHEN 'bakhjul' THEN jsonb_build_object('value', 'bakhjul', 'label_nb', 'Bakhjulstrekk')
      WHEN '4x4' THEN jsonb_build_object('value', '4x4', 'label_nb', 'Firehjulstrekk')
      ELSE opt
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(f.options) WITH ORDINALITY AS t(opt, ord)
),
updated_at = now()
WHERE f.key = 'drive_type'
  AND f.options IS NOT NULL;
