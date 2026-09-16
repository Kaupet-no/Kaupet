-- F7b: fallback fra 20260916100000 fyrer bare når stemmegrenen returnerer
-- NULL rader (IF NOT FOUND), men stemmegrenen returnerer nesten alltid minst
-- én rad så snart ett eneste ord i tittelen stemmer til en kategori — den
-- raden kan likevel ha for få/for spredte stemmer til at klienten
-- (category-suggestion.functions.ts) godtar den. Målt: "Testsykkel 26
-- tommer" mot en kategori med 3 historiske stemmer gir én stemmerad
-- (votes=3), IF NOT FOUND er da false, og fallbacken hopper aldri inn selv
-- om klienten uansett forkaster forslaget (totalVotes=3 < MIN_TOTAL_VOTES=8).
-- Brukeren ser da "Vi fant ingen sikker kategori" mens fallbacken forblir
-- død kode for akkurat det tilfellet den skal dekke.
--
-- Fiks: fyr fallbacken når stemmegrenen ikke gir en TRYGG vinner, ikke bare
-- når den er tom. "Trygg vinner" dupliserer eksplisitt klientterskelen i
-- src/lib/category-suggestion.functions.ts (MIN_TOTAL_VOTES=8, MIN_SHARE=
-- 0.55) — hold disse i sync manuelt hvis klientterskelen endres.
--
-- Fallback-raden erstatter stemmeradene (i stedet for å legges til) fordi
-- den bruker votes=8 nettopp for å klarere klientterskelen alene; hvis begge
-- ble returnert samtidig ville klientens share=top/total bli feil utregnet.
-- Skrevet som ren SQL/CTE (ingen plpgsql-forgrening) siden begge grenene er
-- rene SELECT-er og ikke trenger prosedural kontrollflyt.
CREATE OR REPLACE FUNCTION public.suggest_category_for_title(_title text) RETURNS TABLE(category_id uuid, slug text, name_nb text, parent_id uuid, parent_name_nb text, votes bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH votes AS (
    SELECT c.id AS category_id, c.slug, c.name_nb, c.parent_id, p.name_nb AS parent_name_nb,
           SUM(s.listing_count)::BIGINT AS votes
    FROM ts_stat(format('SELECT to_tsvector(''norwegian'', %L)', coalesce(_title, ''))) t
    JOIN public.listing_category_word_stats s ON s.lexeme = t.word
    JOIN public.categories c ON c.id = s.category_id
    LEFT JOIN public.categories p ON p.id = c.parent_id
    GROUP BY c.id, c.slug, c.name_nb, c.parent_id, p.name_nb
    ORDER BY votes DESC
    LIMIT 5
  ),
  confident AS (
    SELECT coalesce(
      sum(votes) >= 8 AND max(votes)::numeric / nullif(sum(votes), 0) >= 0.55,
      false
    ) AS ok
    FROM votes
  ),
  fallback AS (
    SELECT c.id AS category_id, c.slug, c.name_nb, c.parent_id, p.name_nb AS parent_name_nb,
           8::bigint AS votes
    FROM public.categories c
    LEFT JOIN public.categories p ON p.id = c.parent_id
    WHERE word_similarity(c.name_nb, coalesce(_title, '')) > 0.6
    ORDER BY word_similarity(c.name_nb, coalesce(_title, '')) DESC
    LIMIT 1
  )
  SELECT * FROM votes    WHERE (SELECT ok FROM confident)
  UNION ALL
  SELECT * FROM fallback WHERE NOT (SELECT ok FROM confident)
  ORDER BY votes DESC;
$$;
