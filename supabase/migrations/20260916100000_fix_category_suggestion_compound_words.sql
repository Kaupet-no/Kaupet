-- F7a: kategoriforslaget i annonse-veiviseren bommer på sammensatte ord
-- ("Testsykkel 26 tommer" gir "Vi fant ingen sikker kategori" selv om
-- kategorien "Sykkel" finnes).
--
-- Målt før denne fiksen: dette går IKKE via public.listings_search_term_match
-- (F1, 20260915100000). suggest_category_for_title bygger sin egen
-- to_tsvector('norwegian', _title) og kjører ts_stat() over den, og slår opp
-- lexemene i listing_category_word_stats (bygget fra historiske annonse-
-- titler med samme tokenizer via triggeren i baseline-migrasjonen). Samme
-- rotårsak som F1 — norsk stemming dekomponerer ikke sammensatte ord, så
-- "testsykkel" stemmer aldri til samme lexeme som "sykkel" — men i en helt
-- annen funksjon, upåvirket av F1-fiksen.
--
-- Fiks: samme mønster som F1/J4 (20260915110000) — pg_trgm word_similarity
-- mot kategoriens navn direkte, som fallback når stemmevoteringen ikke gir
-- noen treff i det hele tatt. Terskelen 0.6 er den samme som er verifisert i
-- 20260915100000 (sykkel/testsykkel gir 0.714, bil/mobil gir 0.5 — under
-- terskelen, ingen falsk positiv der).
--
-- Returskjemaet er bevisst uendret (ingen ny kolonne) for å unngå å måtte
-- regenerere den genererte src/integrations/supabase/types.ts uten en live
-- DB å generere fra: fallback-raden gis nøyaktig MIN_TOTAL_VOTES (8, se
-- category-suggestion.functions.ts) stemmer på seg selv, slik at den
-- eksisterende andel-/mengdesjekken (totalVotes >= 8 og share >= 0.55)
-- allerede godtar den som et sikkert forslag uten noen klientendring.
CREATE OR REPLACE FUNCTION public.suggest_category_for_title(_title text) RETURNS TABLE(category_id uuid, slug text, name_nb text, parent_id uuid, parent_name_nb text, votes bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.slug, c.name_nb, c.parent_id, p.name_nb AS parent_name_nb,
         SUM(s.listing_count)::BIGINT AS votes
  FROM ts_stat(format('SELECT to_tsvector(''norwegian'', %L)', coalesce(_title, ''))) t
  JOIN public.listing_category_word_stats s ON s.lexeme = t.word
  JOIN public.categories c ON c.id = s.category_id
  LEFT JOIN public.categories p ON p.id = c.parent_id
  GROUP BY c.id, c.slug, c.name_nb, c.parent_id, p.name_nb
  ORDER BY votes DESC
  LIMIT 5;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT c.id, c.slug, c.name_nb, c.parent_id, p.name_nb, 8::bigint AS votes
    FROM public.categories c
    LEFT JOIN public.categories p ON p.id = c.parent_id
    WHERE word_similarity(c.name_nb, coalesce(_title, '')) > 0.6
    ORDER BY word_similarity(c.name_nb, coalesce(_title, '')) DESC
    LIMIT 1;
  END IF;
END;
$$;
