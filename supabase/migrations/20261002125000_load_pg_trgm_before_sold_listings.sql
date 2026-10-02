-- PR 305 feilet ved inkrementell deploy: pg_trgm må være lastet i
-- migrasjonssesjonen før 20261002130000 validerer funksjonens SET-klausuler.
-- Kjør før den blokkerte migrasjonen uten å endre pushet migrasjonshistorikk.
DO $$ BEGIN PERFORM public.similarity('a', 'b'); END $$;
