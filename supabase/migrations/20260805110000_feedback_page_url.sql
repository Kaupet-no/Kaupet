-- Registrerer hvilken side brukeren var på da "Ris og Ros"-tilbakemeldingen
-- ble sendt, slik at admin-panelet kan lenke direkte til siden.
ALTER TABLE public.feedback ADD COLUMN page_url text;
