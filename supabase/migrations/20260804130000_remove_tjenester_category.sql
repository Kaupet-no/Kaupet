-- Fjerner "Tjenester"-kategorien (og dens underkategorier Håndverkertjenester,
-- Flyttehjelp, Renholdstjenester, Undervisning) under Hus og hage — Kaupet
-- tilbyr ikke tjenestesalg per nå. Dette er den eneste "Tjenester"-grenen i
-- taxonomien (verifisert: ingen andre hovedkategorier har en tilsvarende
-- underkategori), så det holder å fjerne denne ene grenen.
--
-- Følger samme mønster som 20260701100000_full_category_taxonomy.sql: annonser
-- (listings/wtb_listings) pekende på kategorien som fjernes reassignes til
-- hovedkategorien "Hus og hage" først, siden wtb_listings.category_id ikke
-- har noen ON DELETE-regel (RESTRICT som standard) og listings.category_id
-- sin ON DELETE SET NULL ville latt slike annonser stå uten kategori i
-- stedet for å falle tilbake til hovedkategorien.

UPDATE public.listings l
SET category_id = m.id
FROM public.categories c
JOIN public.categories m ON m.slug = 'hus-og-hage' AND m.parent_id IS NULL
WHERE l.category_id = c.id
  AND c.slug IN ('tjenester', 'handverkertjenester', 'flyttehjelp', 'renholdstjenester', 'undervisning');

UPDATE public.wtb_listings l
SET category_id = m.id
FROM public.categories c
JOIN public.categories m ON m.slug = 'hus-og-hage' AND m.parent_id IS NULL
WHERE l.category_id = c.id
  AND c.slug IN ('tjenester', 'handverkertjenester', 'flyttehjelp', 'renholdstjenester', 'undervisning');

-- category_filters rows for handverkertjenester/renholdstjenester (service_area)
-- cascade-delete with their category.
DELETE FROM public.categories
WHERE slug IN ('handverkertjenester', 'flyttehjelp', 'renholdstjenester', 'undervisning', 'tjenester');
