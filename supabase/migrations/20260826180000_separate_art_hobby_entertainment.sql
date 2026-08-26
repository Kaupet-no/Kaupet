-- Skill Kunst, Hobby og håndverk, Underholdning og Samleobjekter.
--
-- Kategoriene identifiseres med slug slik at migrasjonen fungerer på tvers av
-- staging og produksjon, der UUID-ene kan være forskjellige. Eksisterende
-- kategori-ID-er beholdes; annonser flyttes ikke automatisk.

-- Hobby og håndverk og Samleobjekter finnes allerede som barn under Kunst.
-- Gjør dem til egne hovedkategorier uten å opprette nye ID-er.
UPDATE public.categories
SET
  parent_id = NULL,
  sort_order = 95,
  icon = 'PaintRoller',
  color = 'oklch(0.62 0.12 30)',
  title_example = 'Ullgarn og strikkepinner — komplett sett',
  search_examples = ARRAY['Symaskin', 'Strikkegarn', 'Modellbygging'],
  is_hidden = false
WHERE slug = 'hobby-og-handverk';

UPDATE public.categories
SET
  parent_id = NULL,
  sort_order = 97,
  icon = 'Blocks',
  color = 'oklch(0.58 0.11 45)',
  title_example = 'Pokémon samlekort — original samling',
  search_examples = ARRAY['Pokémon', 'Mynter', 'Frimerker', 'Samlekort'],
  is_hidden = false
WHERE slug = 'samleobjekter';

-- Underholdning er ny fordi dagens underholdningskategorier lå under Kunst.
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
  'underholdning',
  'Underholdning',
  NULL,
  96,
  'Film',
  'oklch(0.60 0.12 285)',
  'Catan brettspill — komplett og pent brukt',
  ARRAY['Brettspill', 'Bøker', 'Vinyl', 'Musikkinstrument'],
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

-- Flytt eksisterende innhold ut av Kunst. Ingen annonser endres; de beholder
-- sine eksisterende category_id-er og følger den nye kategoristien.
UPDATE public.categories AS category
SET
  parent_id = (
    SELECT id FROM public.categories WHERE slug = 'underholdning'
  ),
  sort_order = CASE category.slug
    WHEN 'brettspill-og-puslespill' THEN 10
    WHEN 'boker-og-film' THEN 20
    WHEN 'musikk' THEN 30
    ELSE category.sort_order
  END
WHERE category.slug IN (
  'brettspill-og-puslespill',
  'boker-og-film',
  'musikk'
);
