-- «Mangler EU-kontroll» / «Fritatt for EU-kontroll» som alternativ til en
-- tom eller passert «Neste EU-kontroll».
--
-- Nytt valgfelt eu_control_status (missing/exempt) på hver kategori som har
-- next_eu_control. Avhengigheten uten verdi (depends_on_key satt,
-- depends_on_value og depends_on_not_value NULL) betyr «alternativ til
-- datoen»: feltet vises når datoen er tom eller passert, og et valgt
-- alternativ gjør datoen ikke påkrevd (se filterDependencyMet og
-- getMissingRequiredFilters i src/lib/category-filters.ts). Eldre klienter
-- tolker en verdiløs avhengighet som aldri oppfylt og skjuler bare feltet.
--
-- Tilhengerens boolske eu_control_exempt erstattes av eu_control_status, så
-- det finnes ett felt for fritak på tvers av kjøretøytypene.

INSERT INTO public.category_filters (
  category_id, key, label_nb, type, options, sort_order, is_primary, is_optional, depends_on_key
)
SELECT
  category_id,
  'eu_control_status',
  'EU-kontrollstatus',
  'select',
  '[{"value":"missing","label_nb":"Mangler EU-kontroll"},{"value":"exempt","label_nb":"Fritatt for EU-kontroll"}]'::jsonb,
  sort_order + 1,
  false,
  true,
  'next_eu_control'
FROM public.category_filters
WHERE key = 'next_eu_control'
ON CONFLICT (category_id, key) DO NOTHING;

UPDATE public.listings
SET attributes = (attributes - 'eu_control_exempt')
  || CASE WHEN attributes->'eu_control_exempt' = 'true'::jsonb
       THEN '{"eu_control_status":"exempt"}'::jsonb ELSE '{}'::jsonb END
WHERE attributes ? 'eu_control_exempt';

UPDATE public.wtb_listings
SET attributes = (attributes - 'eu_control_exempt')
  || CASE WHEN attributes->'eu_control_exempt' = 'true'::jsonb
       THEN '{"eu_control_status":"exempt"}'::jsonb ELSE '{}'::jsonb END
WHERE attributes ? 'eu_control_exempt';

-- Lagrede søk: {kind:boolean,value:true} blir {kind:select,value:exempt};
-- «false» (vis bare ikke-fritatte) har ingen motsvarighet og fjernes.
UPDATE public.saved_searches
SET criteria = jsonb_set(
  criteria,
  '{attributes}',
  ((criteria->'attributes') - 'eu_control_exempt')
    || CASE WHEN criteria->'attributes'->'eu_control_exempt'->>'value' = 'true'
         THEN '{"eu_control_status":{"kind":"select","value":"exempt"}}'::jsonb
         ELSE '{}'::jsonb END
)
WHERE criteria->'attributes' ? 'eu_control_exempt';

DELETE FROM public.category_filters WHERE key = 'eu_control_exempt';
