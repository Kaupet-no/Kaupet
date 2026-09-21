-- Ytelse: tekstsøket i public.search_listing_ids kan ikke bruke noen indeks.
--
-- Oppfølging av 20260921120000, som ga public.search_listings_page et
-- indekserbart forhåndsfilter. search_listing_ids ble bevisst holdt utenfor
-- den migrasjonen for å begrense diffen, men har NØYAKTIG samme rotårsak:
-- `public.listings_search_term_match(search_vector, title, term)` kalles per
-- rad per term inne i en
-- `NOT EXISTS (SELECT 1 FROM jsonb_array_elements(include_groups) ...)`-
-- struktur, så planleggeren ser verken `listings_search_idx` (GIN på
-- search_vector) eller `listings_title_trgm_idx` (GIN trigram på title), og
-- hvert kall blir en seq scan over alle aktive annonser.
--
-- Denne stien er den mest kalte av de to: den ligger bak søkeforslagene
-- (src/features/listing-search/use-search-suggestions.ts) og
-- merke-/kategorigjettingen (use-brand-category-candidate.ts), som kjører per
-- tastetrykk.
--
-- Lærdommen fra 20260916130000 var nettopp at å fikse én av et par etterlater
-- en levende sti ødelagt. Forhåndsfilteret under er derfor en ordrett kopi av
-- mønsteret i 20260921120000, tilpasset parameternavnene her.
--
-- ---------------------------------------------------------------------------
-- Hvorfor forhåndsfilteret er lovlig
-- ---------------------------------------------------------------------------
-- Semantikken er uendret av denne migrasjonen:
--   * include_groups er AND-et på tvers av grupper. mode = 'all' krever at
--     ALLE termene treffer; enhver annen mode krever MINST ÉN.
--   * En rad som slipper gjennom må derfor treffe minst én term i UNIONEN av
--     alle termer. Nødvendig, ikke tilstrekkelig — altså et lovlig
--     forhåndsfilter. Den eksakte OR-logikken kjører uendret etterpå og
--     etterfiltrerer det reduserte settet, så resultatsettet er identisk.
--
-- Operatorene må være supersett av grenene i listings_search_term_match:
--   | eksakt gren (uendret)              | indeksert operator | forhold     |
--   |------------------------------------|--------------------|-------------|
--   | search_vector @@ websearch_to_...  | @@ (samme)         | identisk    |
--   | similarity(title, term) > 0.25     | title %  term      | >= 0.25     |
--   | word_similarity(term, title) > 0.6 | title %> term      | >= 0.6      |
-- Merk argumentrekkefølgen: `title %> term` svarer til
-- `word_similarity(term, title)`. `%` og `%>` bruker >=, altså litt LØSERE
-- enn > — forhåndsfilteret slipper gjennom litt for mye, aldri for lite.
--
-- Terskelen 0.25 er ikke pg_trgm sin standard (0.3), og 0.3 ville kuttet vekk
-- treff i båndet 0.25–0.3. Derfor settes begge tersklene som SET-klausuler på
-- funksjonen, slik at de gjelder uansett sesjon.
--
-- ---------------------------------------------------------------------------
-- Hvorfor plpgsql, og hvorfor `_prefilter_terms IS NULL OR ...` virker
-- ---------------------------------------------------------------------------
-- Forhåndsfilteret må kobles helt ut når søket ikke har termer (forslag før
-- første tastetrykk, og use-brand-category-candidate som kaller uten
-- include_groups), ellers ville `% ANY(NULL)` gitt NULL og tømt lista.
-- Vaktleddet MÅ kunne foldes bort av planleggeren, ellers faller hele
-- OR-kjeden tilbake til seq scan. Som målt i 20260921120000:
--   * vakt via subquery/CTE (InitPlan)   -> seq scan (kan ikke foldes)
--   * vakt via en parameter ($1 IS NULL) -> foldes bort i en custom plan
-- Derfor må termene ligge i plpgsql-VARIABLER (som blir parametre i den
-- cachede planen), ikke i en CTE. Det er hele grunnen til at funksjonen
-- bytter fra `LANGUAGE sql` til `LANGUAGE plpgsql`; SQL-teksten er ellers
-- uendret fra 20260916130000, bortsett fra det ene nye AND-leddet.
--
-- `plan_cache_mode = force_custom_plan` er nødvendig, ikke kosmetikk: med
-- standard 'auto' kan Postgres bytte til en generisk plan etter fem kall, og
-- i en generisk plan foldes ikke vaktleddet bort — da er vi tilbake til seq
-- scan.
--
-- NULL-termer (`{"terms": [null]}`) filtreres bort før forhåndsfilteret
-- bygges. I mode 'all' gir en NULL-term i dag `NOT EXISTS (... WHERE NOT
-- NULL)` = true, altså en rad som BLIR beholdt; tok vi NULL-en med i
-- `% ANY(...)` kunne raden blitt kastet av forhåndsfilteret.
--
-- Ekskludering røres ikke: et negativt filter (`NOT EXISTS`) kan ikke
-- forhåndsfiltreres med en indeks — en indeks finner rader som TREFFER, ikke
-- rader som skal fjernes. Et søk med bare ekskluderingstermer skanner derfor
-- fortsatt fullt, som før.
--
-- Indeksene finnes allerede fra baseline (listings_search_idx og
-- listings_title_trgm_idx); denne migrasjonen oppretter ingen.

-- pg_trgm-biblioteket må være lastet i sesjonen før CREATE FUNCTION kan
-- validere SET-klausulene for pg_trgm-tersklene — ellers er de bare
-- placeholders, og en ikke-superbruker (postgres i Supabase) får
-- "permission denied to set parameter". Et hvilket som helst trgm-kall laster
-- biblioteket.
DO $$ BEGIN PERFORM public.similarity('a', 'b'); END $$;

CREATE OR REPLACE FUNCTION public.search_listing_ids(include_groups jsonb DEFAULT '[]'::jsonb, exclude_any_terms text[] DEFAULT NULL::text[], exclude_all_groups jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(id uuid, rank real)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    SET pg_trgm.similarity_threshold TO '0.25'
    SET pg_trgm.word_similarity_threshold TO '0.6'
    SET plan_cache_mode TO 'force_custom_plan'
    AS $function$
DECLARE
  _prefilter_terms text[];
  _prefilter_query tsquery;
BEGIN
  -- Unionen av alle inkluderingstermer, uten NULL-er (se hodekommentaren).
  SELECT array_agg(DISTINCT t) INTO _prefilter_terms
  FROM jsonb_array_elements(COALESCE(include_groups, '[]'::jsonb)) g
  CROSS JOIN LATERAL jsonb_array_elements_text(g->'terms') t
  WHERE t IS NOT NULL;

  IF _prefilter_terms IS NOT NULL THEN
    -- OR-et tsquery over termene. Termer som ikke gir noe leksem (stoppord,
    -- ren tegnsetting) utelates: de kan uansett aldri treffe via @@, og en
    -- tom tsquery i OR-kjeden ville bare gitt støy. `::text = ''` brukes
    -- framfor `= ''::tsquery` for å unngå en NOTICE per kall.
    SELECT string_agg('(' || parsed.query::text || ')', ' | ')::tsquery
      INTO _prefilter_query
    FROM (
      SELECT websearch_to_tsquery('norwegian', term) AS query
      FROM unnest(_prefilter_terms) AS term
    ) AS parsed
    WHERE parsed.query::text <> '';
  END IF;

  RETURN QUERY
  SELECT l.id, ts_rank(l.search_vector, q.query) AS rank
  FROM public.listings l
  CROSS JOIN LATERAL (
    SELECT websearch_to_tsquery(
      'norwegian',
      array_to_string(
        (SELECT array_agg(DISTINCT t) FROM jsonb_array_elements(include_groups) g,
          jsonb_array_elements_text(g->'terms') t),
        ' '
      )
    ) AS query
  ) q
  WHERE l.status = 'active'
    -- INDEKSERBART FORHÅNDSFILTER. Supersett av den eksakte logikken under;
    -- se hodekommentaren. Når søket ikke har termer er _prefilter_terms NULL,
    -- og hele leddet foldes bort av custom-planen.
    AND (
      _prefilter_terms IS NULL
      OR l.search_vector @@ _prefilter_query
      OR l.title %  ANY(_prefilter_terms)
      OR l.title %> ANY(_prefilter_terms)
    )
    AND (
      include_groups = '[]'::jsonb
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(include_groups) g
        WHERE NOT (
          CASE WHEN g->>'mode' = 'all' THEN
            NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(g->'terms') t
              WHERE NOT public.listings_search_term_match(l.search_vector, l.title, t)
            )
          ELSE
            EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(g->'terms') t
              WHERE public.listings_search_term_match(l.search_vector, l.title, t)
            )
          END
        )
      )
    )
    AND (
      exclude_any_terms IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM unnest(exclude_any_terms) t
        WHERE public.listings_search_term_excludes(l.search_vector, l.title, t)
      )
    )
    AND (
      exclude_all_groups = '[]'::jsonb
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(exclude_all_groups) g
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(g) t
          WHERE NOT public.listings_search_term_excludes(l.search_vector, l.title, t)
        )
      )
    )
  -- Ordinal, ikke `rank`: `rank` er også navnet på en OUT-parameter, og i
  -- plpgsql ville `ORDER BY rank` vært en tvetydig referanse.
  ORDER BY 2 DESC
  LIMIT 1000;
END
$function$
;
