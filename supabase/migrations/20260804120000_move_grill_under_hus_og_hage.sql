-- Flytter "Grill" ett nivå opp: fra underkategori av "Hage" til å bli en
-- direkte underkategori av "Hus og hage", på linje med Verktøy/Byggevarer/
-- Hage/Stillas og sikkerhet/Tjenester — slik at den vises som egen flis på
-- /hus-og-hage i stedet for gjemt inne på /hage. "Grill" har ingen egne
-- underkategorier (level 3), så dette er en ren re-parenting, ingen andre
-- rader berøres.
UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'hus-og-hage' AND parent_id IS NULL),
    sort_order = 6
WHERE slug = 'grill';
