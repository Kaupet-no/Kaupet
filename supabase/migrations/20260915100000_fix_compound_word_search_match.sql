-- F1: "sykkel" søk finner ikke "Testsykkel 26 tommer" / "terrengsykkel".
--
-- Norsk stemming (`websearch_to_tsquery('norwegian', ...)`) dekomponerer ikke
-- sammensatte ord, så "sykkel" blir aldri lexemet i "terrengsykkel". Den
-- eksisterende trigram-fallbacken sammenligner hele tittelen mot søkeordet
-- (`similarity(title, term)`), som ofte havner under terskelen når tittelen
-- er lang og søkeordet er et kort siste ledd.
--
-- `word_similarity(term, title)` løser dette: den finner den beste
-- deltreff-"extent" i title for term, i stedet for å måtte matche hele
-- strengen. Rekkefølgen på argumentene betyr noe — det korte søkeordet skal
-- stå først. Terskelen 0.6 er pg_trgm sin standard for
-- `word_similarity_threshold` og er satt eksplisitt her (uavhengig av
-- sesjons-GUC) fordi den er verifisert lokalt til å treffe sammensetninger
-- ("sykkel" mot "Testsykkel 26 tommer"/"terrengsykkel" gir 0.714) uten å
-- matche åpenbart urelaterte ord ("sykkel" mot "sykepleier" gir 0.428,
-- "bil" mot "mobil" gir 0.5).
--
-- Indeks: `listings_title_trgm_idx` (GIN, gin_trgm_ops på listings.title)
-- finnes allerede fra baseline-migrasjonen og dekker både `similarity()` og
-- `word_similarity()`, så ingen ny indeks trengs.
CREATE OR REPLACE FUNCTION public.listings_search_term_match(search_vector tsvector, title text, term text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT search_vector @@ websearch_to_tsquery('norwegian', term)
    OR similarity(title, term) > 0.25
    OR word_similarity(term, title) > 0.6
$$;
