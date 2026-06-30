-- Restructure the category tree into 10 defined main categories, each with a
-- unique presentation color, and flatten every existing category to a 2-level
-- hierarchy (main -> subcategory). Existing listings keep their category_id, so
-- no listing data is lost; categories only get reparented/renamed.
--
-- The 10 main categories (in presentation order):
--   Elektronikk, Interiør, Hus og hage, Klær og mote, Sport, Dyr og utstyr,
--   Bil og MC, Kunst, Barn og baby, Båt.
--
-- A "main category" is defined as a root category (parent_id IS NULL) that has a
-- non-null color. The catch-all "Annet" stays a colorless root and is therefore
-- not presented as a main category, but remains usable.

-- 1. Color column for main-category theming (OKLch strings used directly as CSS).
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS color TEXT;

-- 2. Rename/repurpose existing roots into the 10 main categories and set their
--    color, icon and sort_order. Reusing existing rows keeps their children
--    attached and preserves listing references.
UPDATE public.categories SET name_nb = 'Elektronikk', icon = 'Smartphone',
  color = 'oklch(0.62 0.13 250)', sort_order = 10 WHERE slug = 'elektronikk';

UPDATE public.categories SET slug = 'interior', name_nb = 'Interiør', icon = 'Sofa',
  color = 'oklch(0.66 0.12 50)', sort_order = 20 WHERE slug = 'mobler-og-interior';

UPDATE public.categories SET slug = 'hus-og-hage', name_nb = 'Hus og hage', icon = 'Home',
  color = 'oklch(0.60 0.12 150)', sort_order = 30 WHERE slug = 'hage-og-utemiljo';

UPDATE public.categories SET name_nb = 'Klær og mote', icon = 'Shirt',
  color = 'oklch(0.65 0.13 350)', sort_order = 40 WHERE slug = 'klar-og-mote';

UPDATE public.categories SET slug = 'sport', name_nb = 'Sport', icon = 'Dumbbell',
  color = 'oklch(0.68 0.14 70)', sort_order = 50 WHERE slug = 'sport-og-friluft';

UPDATE public.categories SET slug = 'dyr-og-utstyr', name_nb = 'Dyr og utstyr', icon = 'PawPrint',
  color = 'oklch(0.62 0.10 90)', sort_order = 60 WHERE slug = 'kjaeledyr-og-dyreutstyr';

UPDATE public.categories SET slug = 'bil-og-mc', name_nb = 'Bil og MC', icon = 'Car',
  color = 'oklch(0.55 0.06 260)', sort_order = 70 WHERE slug = 'bildeler-og-tilbehor';

UPDATE public.categories SET slug = 'kunst', name_nb = 'Kunst', icon = 'Palette',
  color = 'oklch(0.58 0.13 310)', sort_order = 80 WHERE slug = 'antikviteter-og-kunst';

UPDATE public.categories SET name_nb = 'Barn og baby', icon = 'Baby',
  color = 'oklch(0.70 0.10 200)', sort_order = 90 WHERE slug = 'barn-og-baby';

-- New main category: Båt
INSERT INTO public.categories (slug, name_nb, icon, color, sort_order)
SELECT 'bat', 'Båt', 'Ship', 'oklch(0.55 0.12 240)', 100
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE slug = 'bat');

-- 3. Reparent every category that should live under a different main into a flat
--    2-level tree. Children that already belong to a renamed root (e.g. the old
--    "Møbler og interiør" children now under "Interiør") are untouched.
--    The list maps a category slug -> the slug of its new parent main category.
UPDATE public.categories c
SET parent_id = p.id
FROM (VALUES
  -- Kjøkken og husholdning -> Interiør (container + leaves)
  ('kjokken-og-husholdning', 'interior'),
  ('kjokkenutstyr', 'interior'),
  ('servise-og-bestikk', 'interior'),
  ('husholdningsapparater', 'interior'),
  ('oppbevaring-husholdning', 'interior'),
  ('rengjoring', 'interior'),

  -- Helse og skjønnhet -> Klær og mote (container + leaves)
  ('helse-og-skjonnhet', 'klar-og-mote'),
  ('sminke-og-hudpleie', 'klar-og-mote'),
  ('parfyme', 'klar-og-mote'),
  ('treningsutstyr-helse', 'klar-og-mote'),
  ('velvaere', 'klar-og-mote'),

  -- Verktøy og byggevarer -> Hus og hage (container + leaves)
  ('verktoy-og-byggvarer', 'hus-og-hage'),
  ('handverktoy', 'hus-og-hage'),
  ('elektroverktoy', 'hus-og-hage'),
  ('byggematerialer', 'hus-og-hage'),
  ('maling-og-overflate', 'hus-og-hage'),
  ('ror-og-elektro', 'hus-og-hage'),
  ('stillas-og-stige', 'hus-og-hage'),
  -- Tjenester -> Hus og hage (container + leaves)
  ('tjenester', 'hus-og-hage'),
  ('handverkertjenester', 'hus-og-hage'),
  ('flyttehjelp', 'hus-og-hage'),
  ('undervisning', 'hus-og-hage'),
  ('renholdstjenester', 'hus-og-hage'),

  -- Hobby, fritid og underholdning -> Kunst (container + leaves)
  ('hobby-fritid-og-underholdning', 'kunst'),
  ('brettspill-og-puslespill', 'kunst'),
  ('kunst-og-handverk', 'kunst'),
  ('musikkinstrumenter', 'kunst'),
  ('samleobjekter', 'kunst'),
  -- Bøker, film og musikk -> Kunst (container + leaves)
  ('boker-film-og-musikk', 'kunst'),
  ('boker', 'kunst'),
  ('tegneserier', 'kunst'),
  ('vinyl-og-cd', 'kunst'),
  ('dvd-og-blu-ray', 'kunst'),

  -- Festivalutstyr (was under hobby) -> Sport
  ('festivalutstyr', 'sport'),

  -- Vannsport og båtutstyr (was under sport) -> Båt
  ('vannsport-og-batutstyr', 'bat')
) AS v(child_slug, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE c.slug = v.child_slug;

-- 4. Normalize sort_order of reparented former-container categories so they sort
--    after the genuine leaf subcategories (cosmetic).
UPDATE public.categories SET sort_order = 90
WHERE slug IN ('kjokken-og-husholdning', 'helse-og-skjonnhet', 'verktoy-og-byggvarer',
               'tjenester', 'hobby-fritid-og-underholdning', 'boker-film-og-musikk');

-- 5. Seed a few subcategories for the new whole-vehicle/boat main categories so
--    they are not empty (idempotent on slug).
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT v.slug, v.name_nb, v.sort_order, p.id
FROM (VALUES
  ('personbil', 'Personbil', 1, 'bil-og-mc'),
  ('varebil', 'Varebil', 2, 'bil-og-mc'),
  ('motorsykkel', 'Motorsykkel', 3, 'bil-og-mc'),
  ('moped-og-scooter', 'Moped og scooter', 4, 'bil-og-mc'),
  ('atv-og-snoscooter', 'ATV og snøscooter', 5, 'bil-og-mc'),
  ('motorbat', 'Motorbåt', 1, 'bat'),
  ('seilbat', 'Seilbåt', 2, 'bat'),
  ('jolle-og-gummibat', 'Jolle og gummibåt', 3, 'bat'),
  ('batmotorer', 'Båtmotorer', 4, 'bat'),
  ('battilbehor', 'Båttilbehør og utstyr', 5, 'bat')
) AS v(slug, name_nb, sort_order, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);
