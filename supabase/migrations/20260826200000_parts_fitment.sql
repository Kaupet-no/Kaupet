-- Bildeler får en grunnleggende deltaksonomi og strukturert kompatibilitet.
-- Selve kompatibiliteten lagres som modell-ID-er i listings.attributes slik at
-- én del kan passe flere biler uten å love katalogverifisert treff.

-- Behold eksisterende UUID-er og identifiser kategorier på slug slik at
-- migrasjonen fungerer på tvers av staging og produksjon.
INSERT INTO public.categories (
  slug,
  name_nb,
  parent_id,
  sort_order,
  icon,
  color,
  title_example,
  search_examples,
  is_hidden
)
VALUES (
  'bildeler-og-tilbehor',
  'Bildeler og tilbehør',
  NULL,
  80,
  'Package',
  'oklch(0.48 0.08 160)',
  'Bremseklosser foran til Volvo V70',
  ARRAY['Bremseklosser', 'Bilstereo', 'Tilhengerfeste'],
  false
)
ON CONFLICT (slug) DO UPDATE SET
  name_nb = EXCLUDED.name_nb,
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  title_example = EXCLUDED.title_example,
  search_examples = EXCLUDED.search_examples,
  is_hidden = EXCLUDED.is_hidden;

WITH root AS (
  SELECT id FROM public.categories WHERE slug = 'bildeler-og-tilbehor'
)
INSERT INTO public.categories (
  slug,
  name_nb,
  parent_id,
  sort_order,
  icon,
  title_example,
  search_examples,
  is_hidden
)
SELECT
  'reservedeler',
  'Reservedeler',
  root.id,
  30,
  'Package',
  'Bremseklosser foran til Volvo V70',
  ARRAY['Bremseklosser', 'Oljefilter', 'Frontlykt'],
  false
FROM root
WHERE root.id IS NOT NULL
ON CONFLICT (slug) DO UPDATE SET
  name_nb = EXCLUDED.name_nb,
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  icon = EXCLUDED.icon,
  title_example = EXCLUDED.title_example,
  search_examples = EXCLUDED.search_examples,
  is_hidden = EXCLUDED.is_hidden;

WITH parent AS (
  SELECT id FROM public.categories WHERE slug = 'reservedeler'
),
parts(slug, name_nb, sort_order, icon, title_example, search_examples) AS (
  VALUES
    ('bildeler-bremser', 'Bremser', 10, 'Disc', 'Bremseklosser foran til Volvo V70', ARRAY['Bremseklosser', 'Bremseskiver', 'Bremsekaliper']),
    ('bildeler-motor-service', 'Motor og service', 20, 'Cog', 'Oljefilter og luftfilter til Toyota Avensis', ARRAY['Oljefilter', 'Luftfilter', 'Tennplugger']),
    ('bildeler-drivverk', 'Drivverk', 30, 'Wrench', 'Clutchsett til Volkswagen Golf', ARRAY['Clutch', 'Girkasse', 'Drivaksel']),
    ('bildeler-understell-styring', 'Understell og styring', 40, 'Gauge', 'Bærearm foran til BMW 3-serie', ARRAY['Bærearm', 'Støtdemper', 'Styrestag']),
    ('bildeler-karosseri-glass', 'Karosseri og glass', 50, 'Car', 'Sidespeil høyre til Skoda Octavia', ARRAY['Sidespeil', 'Panser', 'Frontlykt']),
    ('bildeler-lys-elektrisk', 'Lys og elektrisk', 60, 'Lightbulb', 'LED-frontlykt til Audi A4', ARRAY['Bilbatteri', 'Frontlykt', 'Dynamo']),
    ('bildeler-eksos-avgass', 'Eksos og avgass', 70, 'Wind', 'Partikkelfilter til Mercedes-Benz C-klasse', ARRAY['Eksosanlegg', 'Partikkelfilter', 'Katalysator']),
    ('bildeler-interior-komfort', 'Interiør og komfort', 80, 'Armchair', 'Original gulvmatte til Volvo XC60', ARRAY['Gulvmatter', 'Sete', 'Varmeapparat'])
)
INSERT INTO public.categories (
  slug,
  name_nb,
  parent_id,
  sort_order,
  icon,
  title_example,
  search_examples,
  is_hidden
)
SELECT
  parts.slug,
  parts.name_nb,
  parent.id,
  parts.sort_order,
  parts.icon,
  parts.title_example,
  parts.search_examples,
  false
FROM parent
CROSS JOIN parts
WHERE parent.id IS NOT NULL
ON CONFLICT (slug) DO UPDATE SET
  name_nb = EXCLUDED.name_nb,
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  icon = EXCLUDED.icon,
  title_example = EXCLUDED.title_example,
  search_examples = EXCLUDED.search_examples,
  is_hidden = EXCLUDED.is_hidden;

WITH root AS (
  SELECT id FROM public.categories WHERE slug = 'bildeler-og-tilbehor'
),
extra(slug, name_nb, sort_order, icon, title_example, search_examples) AS (
  VALUES
    ('bildeler-tilhenger-transport', 'Tilhenger og transport', 40, 'Truck', 'Tilhengerfeste til Volvo V70', ARRAY['Tilhengerfeste', 'Takstativ', 'Lastestropper']),
    ('bildeler-verktoy-verksted', 'Verktøy og verksted', 50, 'Hammer', 'Momentnøkkel 20–200 Nm', ARRAY['Garasjejekk', 'Momentnøkkel', 'Diagnoseverktøy'])
)
INSERT INTO public.categories (
  slug,
  name_nb,
  parent_id,
  sort_order,
  icon,
  title_example,
  search_examples,
  is_hidden
)
SELECT
  extra.slug,
  extra.name_nb,
  root.id,
  extra.sort_order,
  extra.icon,
  extra.title_example,
  extra.search_examples,
  false
FROM root
CROSS JOIN extra
WHERE root.id IS NOT NULL
ON CONFLICT (slug) DO UPDATE SET
  name_nb = EXCLUDED.name_nb,
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  icon = EXCLUDED.icon,
  title_example = EXCLUDED.title_example,
  search_examples = EXCLUDED.search_examples,
  is_hidden = EXCLUDED.is_hidden;

-- Disse feltene arves av alle bildel-underkategorier. Delenummer og delmerke
-- er valgfrie; kompatibilitetsomfang er påkrevd ved publisering.
INSERT INTO public.category_filters (
  category_id,
  key,
  label_nb,
  type,
  unit,
  options,
  sort_order,
  is_primary,
  depends_on_key,
  depends_on_value,
  is_optional
)
SELECT
  category.id,
  spec.key,
  spec.label_nb,
  spec.type,
  spec.unit,
  spec.options,
  spec.sort_order,
  spec.is_primary,
  spec.depends_on_key,
  spec.depends_on_value,
  spec.is_optional
FROM public.categories AS category
CROSS JOIN (
  VALUES
    (
      'part_fitment_scope',
      'Passer til',
      'select',
      NULL,
      '[{"value":"universal","label_nb":"Universal del"},{"value":"specific","label_nb":"Én eller flere bestemte biler"},{"value":"unknown","label_nb":"Vet ikke"}]'::jsonb,
      10,
      true,
      NULL,
      NULL,
      false
    ),
    (
      'part_fitment_vehicle_ids',
      'Bilmodell',
      'multiselect',
      NULL,
      NULL,
      20,
      true,
      'part_fitment_scope',
      'specific',
      false
    ),
    (
      'part_fitment_year',
      'Årsmodell',
      'range',
      'år',
      NULL,
      30,
      false,
      NULL,
      NULL,
      true
    ),
    (
      'part_number',
      'Delenummer / OE-nummer',
      'text',
      NULL,
      NULL,
      40,
      false,
      NULL,
      NULL,
      true
    ),
    (
      'part_brand',
      'Delmerke',
      'text',
      NULL,
      NULL,
      50,
      false,
      NULL,
      NULL,
      true
    )
) AS spec(key, label_nb, type, unit, options, sort_order, is_primary, depends_on_key, depends_on_value, is_optional)
WHERE category.slug = 'bildeler-og-tilbehor'
ON CONFLICT (category_id, key) DO UPDATE SET
  label_nb = EXCLUDED.label_nb,
  type = EXCLUDED.type,
  unit = EXCLUDED.unit,
  options = EXCLUDED.options,
  sort_order = EXCLUDED.sort_order,
  is_primary = EXCLUDED.is_primary,
  depends_on_key = EXCLUDED.depends_on_key,
  depends_on_value = EXCLUDED.depends_on_value,
  is_optional = EXCLUDED.is_optional;

-- Den eksisterende arraymatchingen brukes av flere kategorier. Utvid den til
-- å støtte overlapp når både annonsen og søket bruker en liste, som for flere
-- kompatible bilmodeller.
CREATE OR REPLACE FUNCTION public.listing_matches_attribute_filters(
  _attributes jsonb,
  _filters jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_each(COALESCE(_filters, '{}'::jsonb)) AS entry(key, filter)
    WHERE NOT CASE filter->>'kind'
      WHEN 'select' THEN
        COALESCE(_attributes @> jsonb_build_object(key, filter->'value'), false)
      WHEN 'boolean' THEN
        COALESCE(_attributes @> jsonb_build_object(key, filter->'value'), false)
      WHEN 'multiselect' THEN
        COALESCE(
          CASE jsonb_typeof(_attributes -> key)
            WHEN 'array' THEN EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(_attributes -> key) AS listing_value(value)
              WHERE listing_value.value = ANY (
                ARRAY(SELECT jsonb_array_elements_text(COALESCE(filter->'values', '[]'::jsonb)))
              )
            )
            ELSE _attributes->>key = ANY (
              ARRAY(SELECT jsonb_array_elements_text(COALESCE(filter->'values', '[]'::jsonb)))
            )
          END,
          false
        )
      WHEN 'range' THEN
        CASE
          WHEN key = 'part_fitment_year' THEN
            (
              NOT (filter ? 'min')
              OR (
                _attributes->>'part_fitment_year_to' IS NULL
                OR (
                  _attributes->>'part_fitment_year_to' ~ '^[0-9]{4}$'
                  AND (_attributes->>'part_fitment_year_to')::numeric >= (filter->>'min')::numeric
                )
              )
            )
            AND (
              NOT (filter ? 'max')
              OR (
                _attributes->>'part_fitment_year_from' IS NULL
                OR (
                  _attributes->>'part_fitment_year_from' ~ '^[0-9]{4}$'
                  AND (_attributes->>'part_fitment_year_from')::numeric <= (filter->>'max')::numeric
                )
            )
              )
          ELSE
            jsonb_typeof(_attributes->key) = 'number'
            AND (NOT (filter ? 'min') OR (_attributes->key) >= (filter->'min'))
            AND (NOT (filter ? 'max') OR (_attributes->key) <= (filter->'max'))
        END
      WHEN 'text' THEN
        COALESCE(_attributes->>key ILIKE '%' || (filter->>'value') || '%', false)
      WHEN 'date_min' THEN
        COALESCE(_attributes->>key >= filter->>'value', false)
      WHEN 'exclude' THEN
        _attributes->key IS NULL
        OR NOT COALESCE(
          _attributes->>key = ANY (
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(filter->'values', '[]'::jsonb)))
          ),
          false
        )
      ELSE true
    END
  );
$$;
