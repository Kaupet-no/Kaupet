-- Ytelse: tekstsøket i public.search_listings_page kan ikke bruke noen indeks.
--
-- Rotårsak. `public.listings_search_term_match(search_vector, title, term)`
-- kalles per rad per term inne i en
-- `NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_include_groups) ...)`-
-- struktur. Termene kommer altså ut av en jsonb-array på kjøretid, og
-- predikatet står som et funksjonskall på l-raden. Planleggeren ser da verken
-- `listings_search_idx` (GIN på search_vector) eller `listings_title_trgm_idx`
-- (GIN trigram på title), og hvert søk blir en seq scan over alle aktive
-- annonser med tre funksjonskall per rad per term.
--
-- Målt lokalt på 300 000 aktive rader, søkeord "sykkel" (~5 % treff):
--   før:  1438 ms (seq scan)
--   etter:  100 ms (BitmapOr over begge GIN-indeksene)
-- Begge ga nøyaktig 14 769 rader.
--
-- Kostnaden traff bredere enn resultatlista: src/features/listing-search/
-- use-draft-result-count.ts kaller samme RPC med limit 1 bare for å hente
-- total_count, så hvert debouncet tastetrykk i søkepanelet betalte for en
-- full skanning.
--
-- ---------------------------------------------------------------------------
-- Fiksen: et forhåndsfilter som er et BEVISLIG SUPERSETT av dagens treff.
-- ---------------------------------------------------------------------------
-- Semantikken i dag (uendret av denne migrasjonen):
--   * _include_groups er AND-et på tvers av grupper. En gruppe med
--     mode = 'all' krever at ALLE termene treffer; enhver annen mode
--     (inkludert manglende nøkkel) krever at MINST ÉN term treffer.
--   * En rad som slipper gjennom må derfor, for hver gruppe som har minst én
--     term, treffe minst én av gruppens termer.
--   * Altså: raden må treffe minst én term i UNIONEN av alle termer. Det er en
--     nødvendig — ikke tilstrekkelig — betingelse, og dermed et lovlig
--     forhåndsfilter. Den eksakte OR-logikken kjører uendret etterpå og
--     etterfiltrerer det reduserte settet, så resultatsettet er identisk.
--
-- Hvorfor unionen og ikke per-gruppe-AND: per gruppe ville vært mer selektivt,
-- men antall grupper er dynamisk og kan ikke skrives som et statisk antall
-- AND-ledd. Unionen er ett enkelt ledd som dekker alle formene. I praksis har
-- /annonser-søket én gruppe, der de to er identiske.
--
-- Operatorene i forhåndsfilteret må være supersett av grenene i
-- listings_search_term_match:
--   | eksakt gren (uendret)              | indeksert operator | forhold     |
--   |------------------------------------|--------------------|-------------|
--   | search_vector @@ websearch_to_...  | @@ (samme)         | identisk    |
--   | similarity(title, term) > 0.25     | title %  term      | >= 0.25     |
--   | word_similarity(term, title) > 0.6 | title %> term      | >= 0.6      |
-- `%` og `%>` bruker >=, altså litt LØSERE enn > — forhåndsfilteret slipper
-- gjennom litt for mye, aldri for lite. Det er den trygge retningen.
-- Verifisert lokalt, bl.a. tilfellet "Bilstol til barn"/"bil" der
-- similarity = 0.250 nøyaktig: eksakt gren false, `%` true (supersett).
--
-- Terskelen 0.25 er IKKE pg_trgm sin standard (0.3), og 0.3 ville kuttet vekk
-- treff i båndet 0.25–0.3. Derfor settes begge tersklene som SET-klausuler på
-- funksjonen, slik at de gjelder uansett sesjon.
--
-- ---------------------------------------------------------------------------
-- Hvorfor plpgsql, og hvorfor `_prefilter_terms IS NULL OR ...` virker
-- ---------------------------------------------------------------------------
-- Forhåndsfilteret må kobles helt ut når søket ikke har noen termer (vanlig
-- browsing av /annonser), ellers ville `% ANY(NULL)` gitt NULL og tømt lista.
-- Vaktleddet må derfor være der — men det MÅ kunne foldes bort av
-- planleggeren, ellers faller hele OR-kjeden tilbake til seq scan. Målt:
--   * vakt via subquery/CTE (InitPlan)  -> seq scan  (kan ikke foldes)
--   * vakt via en parameter ($1 IS NULL) -> foldes bort i en custom plan,
--     og BitmapOr over begge GIN-indeksene står igjen
-- Derfor må termene ligge i plpgsql-VARIABLER (som blir parametre i den
-- cachede planen), ikke i en CTE. Det er hele grunnen til at funksjonen
-- bytter fra `LANGUAGE sql` til `LANGUAGE plpgsql`; SQL-teksten i spørringen
-- er ellers uendret fra 20260916130000, bortsett fra det ene nye AND-leddet
-- og den innsnevrede kolonnelista.
--
-- `plan_cache_mode = force_custom_plan` er nødvendig, ikke kosmetikk: med
-- standard 'auto' kan Postgres bytte til en generisk plan etter fem kall, og
-- i en generisk plan foldes ikke vaktleddet bort — da er vi tilbake til seq
-- scan. Søkeformen varierer uansett så mye per kall at custom plan er riktig.
--
-- NULL-termer (`{"terms": [null]}`) filtreres bort før forhåndsfilteret
-- bygges. I mode 'all' gir en NULL-term i dag `NOT EXISTS (... WHERE NOT
-- NULL)` = true, altså en rad som BLIR beholdt; tok vi NULL-en med i
-- `% ANY(...)` kunne raden blitt kastet av forhåndsfilteret. Uten den er
-- forhåndsfilteret bygget kun på de reelle termene, som den eksakte
-- logikken uansett krever.
--
-- search_vector kan i praksis ikke være NULL: triggeren
-- listings_search_vector_update er BEFORE INSERT OR UPDATE og setter alltid
-- feltet via setweight(to_tsvector(coalesce(...))), som aldri gir NULL.
-- Kolonnen er nullable av historiske grunner. Det er verdt å vite fordi en
-- NULL search_vector ville gitt NULL i @@-grenen og dermed kunnet kastet en
-- rad som mode 'all' i dag beholder.
--
-- ---------------------------------------------------------------------------
-- Ekskludering røres ikke
-- ---------------------------------------------------------------------------
-- listings_search_term_excludes og begge ekskluderingsgrenene står uendret.
-- Ekskludering er et negativt filter (`NOT EXISTS`), og et negativt filter kan
-- ikke forhåndsfiltreres med en indeks — en indeks finner rader som TREFFER,
-- ikke rader som skal fjernes. Et søk med bare ekskluderingstermer og ingen
-- inkluderingstermer skanner derfor fortsatt fullt, som før.
--
-- ---------------------------------------------------------------------------
-- MERK — overlapp med perf/ytelsestiltak (20260921100000)
-- ---------------------------------------------------------------------------
-- Den migrasjonen re-definerer SAMME funksjon med et geo-forfilter
-- (bounding box på lat + listings_active_lat_idx), og er ikke merget til main
-- når denne skrives. Begge bruker CREATE OR REPLACE med hele kroppen, så den
-- som kjører SIST vinner HELE definisjonen. Denne migrasjonen har derfor et
-- senere tidsstempel OG inneholder geo-forfilteret ord for ord, og oppretter
-- lat-indeksen med IF NOT EXISTS. Da blir resultatet korrekt uansett om
-- perf/ytelsestiltak merges før, etter eller aldri — ingen av delene faller
-- ut. Indeksen listings_active_created_at_idx fra den migrasjonen er ren
-- sorteringsytelse og hører ikke hjemme her; den følger sin egen branch.

-- pg_trgm-biblioteket må være lastet i sesjonen før CREATE FUNCTION kan
-- validere SET-klausulene for pg_trgm-tersklene — ellers er de bare
-- placeholders, og en ikke-superbruker (postgres i Supabase) får
-- "permission denied to set parameter". Et hvilket som helst trgm-kall laster
-- biblioteket.
DO $$ BEGIN PERFORM public.similarity('a', 'b'); END $$;

-- Fra 20260921100000. IF NOT EXISTS gjør den trygg å kjøre i begge rekkefølger.
CREATE INDEX IF NOT EXISTS listings_active_lat_idx
  ON public.listings USING btree (lat)
  WHERE status = 'active' AND lat IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_listings_page(_include_groups jsonb DEFAULT '[]'::jsonb, _exclude_any_terms text[] DEFAULT NULL::text[], _exclude_all_groups jsonb DEFAULT '[]'::jsonb, _category_ids uuid[] DEFAULT NULL::uuid[], _conditions listing_condition[] DEFAULT NULL::listing_condition[], _include_free boolean DEFAULT true, _min_price integer DEFAULT NULL::integer, _max_price integer DEFAULT NULL::integer, _attribute_filters jsonb DEFAULT '{}'::jsonb, _center_lat double precision DEFAULT NULL::double precision, _center_lng double precision DEFAULT NULL::double precision, _radius_km double precision DEFAULT 10, _sort text DEFAULT 'new'::text, _limit integer DEFAULT 20, _offset integer DEFAULT 0) RETURNS TABLE(id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, display_lat double precision, display_lng double precision, created_at timestamp with time zone, attributes jsonb, category_slug text, cover_path text, relevance real, total_count bigint)
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
  SELECT array_agg(DISTINCT term) INTO _prefilter_terms
  FROM jsonb_array_elements(COALESCE(_include_groups, '[]'::jsonb)) AS groups(group_value)
  CROSS JOIN LATERAL jsonb_array_elements_text(group_value->'terms') AS terms(term)
  WHERE term IS NOT NULL;

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
  WITH matching AS (
    SELECT
      -- Kun kolonnene som faktisk brukes nedenfor. Før sto det `l.*`, som
      -- materialiserte alle ~36 kolonnene av HELE treffmengden før LIMIT.
      l.id,
      l.kaupet_code,
      l.title,
      l.subtitle,
      l.price_nok,
      l.is_free,
      l.city,
      l.display_lat,
      l.display_lng,
      l.created_at,
      l.attributes,
      c.slug AS category_slug,
      CASE
        WHEN jsonb_array_length(COALESCE(_include_groups, '[]'::jsonb)) = 0 THEN 0::real
        ELSE ts_rank(
          l.search_vector,
          websearch_to_tsquery(
            'norwegian',
            COALESCE(
              (
                SELECT string_agg(DISTINCT term, ' ')
                FROM jsonb_array_elements(COALESCE(_include_groups, '[]'::jsonb)) AS groups(group_value)
                CROSS JOIN LATERAL jsonb_array_elements_text(group_value->'terms') AS terms(term)
              ),
              ''
            )
          )
        )
      END AS relevance
    FROM public.listings l
    LEFT JOIN public.categories c ON c.id = l.category_id
    WHERE l.status = 'active'
      -- INDEKSERBART FORHÅNDSFILTER. Supersett av den eksakte logikken under;
      -- se hodekommentaren. Når søket ikke har termer er _prefilter_terms
      -- NULL, og hele leddet foldes bort av custom-planen.
      AND (
        _prefilter_terms IS NULL
        OR l.search_vector @@ _prefilter_query
        OR l.title %  ANY(_prefilter_terms)
        OR l.title %> ANY(_prefilter_terms)
      )
      AND (
        COALESCE(_include_groups, '[]'::jsonb) = '[]'::jsonb
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(_include_groups) AS groups(group_value)
          WHERE NOT CASE WHEN group_value->>'mode' = 'all' THEN
            NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(group_value->'terms') AS terms(term)
              WHERE NOT public.listings_search_term_match(l.search_vector, l.title, term)
            )
          ELSE
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(group_value->'terms') AS terms(term)
              WHERE public.listings_search_term_match(l.search_vector, l.title, term)
            )
          END
        )
      )
      AND (
        _exclude_any_terms IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(_exclude_any_terms) AS terms(term)
          WHERE public.listings_search_term_excludes(l.search_vector, l.title, term)
        )
      )
      AND (
        COALESCE(_exclude_all_groups, '[]'::jsonb) = '[]'::jsonb
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(_exclude_all_groups) AS groups(group_value)
          WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(group_value) AS terms(term)
            WHERE NOT public.listings_search_term_excludes(l.search_vector, l.title, term)
          )
        )
      )
      AND (_category_ids IS NULL OR l.category_id = ANY(_category_ids))
      AND (_conditions IS NULL OR l.condition = ANY(_conditions))
      AND (_include_free OR NOT l.is_free)
      AND (
        _min_price IS NULL
        OR (_include_free AND l.is_free)
        OR l.price_nok >= _min_price
      )
      AND (
        _max_price IS NULL
        OR (_include_free AND l.is_free)
        OR l.price_nok <= _max_price
      )
      AND public.listing_matches_attribute_filters(l.attributes, _attribute_filters)
      AND (
        _center_lat IS NULL
        OR _center_lng IS NULL
        OR (
          l.lat IS NOT NULL
          AND l.lng IS NOT NULL
          -- Bounding box-forfilter på breddegrad, brukt av planleggeren via
          -- listings_active_lat_idx. En breddegrad er minst 110.574 km
          -- overalt på jorden; vi deler på 110.5 (litt mindre enn det reelle
          -- minimumet), så boksen blir garantert litt for STOR, aldri for
          -- liten. Boksen er dermed et bevislig supersett av sirkelen, og
          -- AND-et med det eksakte haversine-uttrykket under gir nøyaktig
          -- samme resultatsett som før — bare med et smalt range-scan i
          -- stedet for full scan. Radius-klampingen må være identisk med
          -- den i haversine-uttrykket, ellers kunne boksen kuttet vekk treff
          -- sirkelen fortsatt skulle inkludert.
          AND l.lat BETWEEN
                _center_lat - (LEAST(GREATEST(COALESCE(_radius_km, 10), 1), 100) / 110.5)
            AND _center_lat + (LEAST(GREATEST(COALESCE(_radius_km, 10), 1), 100) / 110.5)
          AND 6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(_center_lat)) * cos(radians(l.lat)) *
              cos(radians(l.lng) - radians(_center_lng)) +
              sin(radians(_center_lat)) * sin(radians(l.lat))
            ))
          ) <= LEAST(GREATEST(COALESCE(_radius_km, 10), 1), 100)
        )
      )
  ), counted AS (
    SELECT matching.*, count(*) OVER () AS total_count
    FROM matching
  )
  SELECT
    counted.id,
    counted.kaupet_code,
    counted.title,
    counted.subtitle,
    counted.price_nok,
    counted.is_free,
    counted.city,
    counted.display_lat,
    counted.display_lng,
    counted.created_at,
    counted.attributes,
    counted.category_slug,
    (
      SELECT image.storage_path
      FROM public.listing_images image
      WHERE image.listing_id = counted.id
      ORDER BY image.sort_order
      LIMIT 1
    ) AS cover_path,
    counted.relevance,
    counted.total_count
  FROM counted
  ORDER BY
    CASE WHEN _sort = 'relevance' THEN counted.relevance END DESC NULLS LAST,
    CASE WHEN _sort = 'price_asc' THEN counted.price_nok END ASC NULLS LAST,
    CASE WHEN _sort = 'price_desc' THEN counted.price_nok END DESC NULLS LAST,
    CASE WHEN _sort NOT IN ('relevance', 'price_asc', 'price_desc') THEN counted.created_at END DESC,
    counted.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END
$function$
;
