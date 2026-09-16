-- J4 (WTB-tvillingen til F1): søk i kjøpsønsker finner ikke sammensatte ord
-- ("sykkel" finner ikke et kjøpsønske med tittelen "Ønsker terrengsykkel").
-- Samme rotårsak som F1 (se 20260915100000_fix_compound_word_search_match.sql,
-- IKKE endret her): websearch_to_tsquery('norwegian', …) stemmer ikke
-- sammensatte norske ord.
--
-- Samme fiks, gjenbrukt: public.listings_search_term_match(search_vector,
-- title, term) tar ikke avhengighet av listings-tabellen — bare av
-- kolonnetypene (tsvector, text, text) — så den brukes direkte her i stedet
-- for å duplisere OR word_similarity(term, title) > 0.6-logikken.
--
-- PostgREST sin .textSearch()-builder kan ikke uttrykke en OR
-- word_similarity(...)-klausul, så filteret må ligge i en SQL-funksjon.
-- wtb_listings har vesentlig færre filtre enn listings (ingen pris-/
-- attributtfiltre, ingen geosøk, én sortering: nyest først), så en full
-- paginerings-RPC etter mønster av search_listings_page ville vært
-- overbygging. I stedet: to smale RPC-er som speiler de to eksisterende
-- kallstedene (listWtbListings/countWtbListings i wtb-listings.functions.ts)
-- — én som returnerer id-ene for gjeldende side i riktig rekkefølge (appkoden
-- slår opp de fulle radene, med profiles/categories-joinet, separat via
-- .in("id", ids) og sorterer dem i klienten etter denne rekkefølgen — det
-- unngår å måtte duplisere joinet inn i SQL), og én som bare teller.
--
-- Trigram-indeks: wtb_listings hadde ingen (annonsetabellen har
-- listings_title_trgm_idx fra baseline-migrasjonen) — uten den blir
-- word_similarity() en seq scan over hele tabellen.
CREATE INDEX wtb_listings_title_trgm_idx ON public.wtb_listings USING gin (title public.gin_trgm_ops);

CREATE FUNCTION public.wtb_listings_match_page(
  _q text DEFAULT NULL,
  _category_ids uuid[] DEFAULT NULL,
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, total_count bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH matching AS (
    SELECT w.id, w.created_at
    FROM public.wtb_listings w
    WHERE w.status = 'active'
      AND (_category_ids IS NULL OR w.category_id = ANY(_category_ids))
      AND (
        _q IS NULL OR btrim(_q) = ''
        OR public.listings_search_term_match(w.search_vector, w.title, _q)
      )
  ), counted AS (
    SELECT matching.*, count(*) OVER () AS total_count
    FROM matching
  )
  SELECT counted.id, counted.total_count
  FROM counted
  ORDER BY counted.created_at DESC, counted.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$$;

CREATE FUNCTION public.wtb_listings_match_count(
  _q text DEFAULT NULL,
  _category_ids uuid[] DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT count(*)
  FROM public.wtb_listings w
  WHERE w.status = 'active'
    AND (_category_ids IS NULL OR w.category_id = ANY(_category_ids))
    AND (
      _q IS NULL OR btrim(_q) = ''
      OR public.listings_search_term_match(w.search_vector, w.title, _q)
    );
$$;

REVOKE ALL ON FUNCTION public.wtb_listings_match_page(text, uuid[], integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wtb_listings_match_count(text, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.wtb_listings_match_page(text, uuid[], integer, integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wtb_listings_match_count(text, uuid[])
  TO anon, authenticated, service_role;
