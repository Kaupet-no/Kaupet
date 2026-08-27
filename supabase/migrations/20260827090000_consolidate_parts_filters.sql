-- Bildel-flytets autoritative felter er definert på
-- bildeler-og-tilbehor i 20260826200000_parts_fitment.sql.
-- Reservedeler hadde eldre fritekstfelt for samme informasjon. De fjernes fra
-- filtertreet, men eksisterende listing.attributes beholdes urørt.
DELETE FROM public.category_filters
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'reservedeler')
  AND key IN ('part_type', 'compatible_model');

-- Deltypespesifikke felt holdes på den smaleste kategorien som trenger dem.
INSERT INTO public.category_filters (
  category_id,
  key,
  label_nb,
  type,
  options,
  sort_order,
  is_primary,
  is_optional
)
SELECT
  category.id,
  spec.key,
  spec.label_nb,
  spec.type,
  spec.options,
  spec.sort_order,
  spec.is_primary,
  spec.is_optional
FROM public.categories AS category
CROSS JOIN (
  VALUES
    (
      'bildeler-bremser',
      'part_position',
      'Plassering',
      'select',
      '[{"value":"front","label_nb":"Foran"},{"value":"rear","label_nb":"Bak"},{"value":"both","label_nb":"Foran og bak"}]'::jsonb,
      10,
      true,
      true
    ),
    (
      'bildeler-bremser',
      'part_axle',
      'Aksel',
      'select',
      '[{"value":"front_axle","label_nb":"Foraksel"},{"value":"rear_axle","label_nb":"Bakaksel"}]'::jsonb,
      20,
      false,
      true
    ),
    (
      'dekk-og-felg',
      'bolt_pattern',
      'Boltsirkel',
      'text',
      NULL,
      30,
      false,
      true
    ),
    (
      'dekk-og-felg',
      'rim_diameter',
      'Felgdiameter',
      'number',
      NULL,
      40,
      false,
      true
    ),
    (
      'bildeler-lys-elektrisk',
      'part_side',
      'Side',
      'select',
      '[{"value":"left","label_nb":"Venstre"},{"value":"right","label_nb":"Høyre"},{"value":"both","label_nb":"Begge sider"}]'::jsonb,
      10,
      true,
      true
    ),
    (
      'bildeler-lys-elektrisk',
      'part_light_type',
      'Lystype',
      'select',
      '[{"value":"halogen","label_nb":"Halogen"},{"value":"led","label_nb":"LED"},{"value":"xenon","label_nb":"Xenon"},{"value":"other","label_nb":"Annet"}]'::jsonb,
      20,
      false,
      true
    )
) AS spec(category_slug, key, label_nb, type, options, sort_order, is_primary, is_optional)
WHERE category.slug = spec.category_slug
ON CONFLICT (category_id, key) DO UPDATE SET
  label_nb = EXCLUDED.label_nb,
  type = EXCLUDED.type,
  options = EXCLUDED.options,
  sort_order = EXCLUDED.sort_order,
  is_primary = EXCLUDED.is_primary,
  is_optional = EXCLUDED.is_optional;
