-- Felles mål-felt for møbler, kunst, tepper og barnemøbler.
-- Feltene legges på nærmeste felles kategori slik at eksisterende
-- filterarv brukes i både opprettelse, redigering og søk.
--
-- Kategorier slås opp på slug for å fungere på tvers av staging og produksjon,
-- der UUID-ene kan være forskjellige. Eksisterende annonser endres ikke;
-- manglende attributter fylles inn ved ny annonse eller redigering.

INSERT INTO public.category_filters (
  category_id,
  key,
  label_nb,
  type,
  unit,
  options,
  sort_order,
  is_primary,
  is_optional
)
SELECT
  category.id,
  specification.key,
  specification.label_nb,
  specification.type,
  specification.unit,
  NULL,
  specification.sort_order,
  specification.is_primary,
  specification.is_optional
FROM public.categories AS category
JOIN (
  VALUES
    ('mobler', 'width_cm', 'Bredde', 'number', 'cm', 10, true, false),
    ('mobler', 'height_cm', 'Høyde', 'number', 'cm', 20, true, false),
    ('mobler', 'depth_cm', 'Dybde', 'number', 'cm', 30, true, false),

    ('malerier-og-grafikk', 'width_cm', 'Bredde', 'number', 'cm', 10, true, false),
    ('malerier-og-grafikk', 'height_cm', 'Høyde', 'number', 'cm', 20, true, false),
    ('malerier-og-grafikk', 'framed', 'Innrammet', 'boolean', NULL, 30, false, true),

    ('skulptur-og-keramikk', 'width_cm', 'Bredde', 'number', 'cm', 10, true, false),
    ('skulptur-og-keramikk', 'height_cm', 'Høyde', 'number', 'cm', 20, true, false),
    ('skulptur-og-keramikk', 'depth_cm', 'Dybde', 'number', 'cm', 30, true, false),

    ('tepper', 'width_cm', 'Bredde', 'number', 'cm', 10, true, false),
    ('tepper', 'length_cm', 'Lengde', 'number', 'cm', 20, true, false),

    ('hagemobler', 'width_cm', 'Bredde', 'number', 'cm', 10, true, false),
    ('hagemobler', 'height_cm', 'Høyde', 'number', 'cm', 20, true, false),
    ('hagemobler', 'depth_cm', 'Dybde', 'number', 'cm', 30, true, false),

    ('mobler-til-barnerom', 'width_cm', 'Bredde', 'number', 'cm', 10, true, false),
    ('mobler-til-barnerom', 'height_cm', 'Høyde', 'number', 'cm', 20, true, false),
    ('mobler-til-barnerom', 'depth_cm', 'Dybde', 'number', 'cm', 30, true, false)
) AS specification(
  category_slug,
  key,
  label_nb,
  type,
  unit,
  sort_order,
  is_primary,
  is_optional
) ON specification.category_slug = category.slug
ON CONFLICT (category_id, key) DO UPDATE SET
  label_nb = EXCLUDED.label_nb,
  type = EXCLUDED.type,
  unit = EXCLUDED.unit,
  options = EXCLUDED.options,
  sort_order = EXCLUDED.sort_order,
  is_primary = EXCLUDED.is_primary,
  is_optional = EXCLUDED.is_optional;
