-- Kjør dette MANUELT mot staging og prod (via SQL editor i Supabase dashboard,
-- eller psql direkte) FØR neste push, for hvert av de to prosjektene:
--   staging: zpazmwzhvylptptygzlw
--   prod:    efuexbrxdvjznrvoqbsd
--
-- Dette markerer baseline-squash-filen som allerede anvendt, slik at
-- Supabase sin GitHub-plugin ikke prøver å kjøre den på nytt mot en
-- database som allerede har skjemaet fra de 183 opprinnelige migrasjonene.
--
-- Kjør IKKE selve 20260604073223_baseline_squash.sql mot disse miljøene.

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260604073223', 'baseline_squash', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;
