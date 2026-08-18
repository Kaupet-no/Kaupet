-- Kategorien "Bilsport" døpes om til "Motorsport" — den brukes til å samle
-- rally/bane-biler og racersykler, og "motorsport" dekker MC-siden bedre enn
-- "bilsport" gjorde. Slug beholdes for å unngå å endre eksisterende URL-er.
UPDATE public.categories SET name_nb = 'Motorsport' WHERE name_nb = 'Bilsport';
