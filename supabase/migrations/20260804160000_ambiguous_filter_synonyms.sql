-- Enkelte fritekst-synonymer er ordbokord som betyr noe konkret i Bil-
-- vokabularet, men som også er vanlige ord ellers (f.eks. "elektrisk" ->
-- fuel_type=el, som feilaktig traff "Elektrisk tannbørste"). is_ambiguous
-- markerer disse slik at match_search_synonyms/fetchSynonymMatches (se
-- src/features/listing-search/use-search-synonym-matches.ts) kan kreve et
-- annet, ikke-tvetydig treff i samme kategori før et slikt synonym godtas
-- når søket ikke allerede har en valgt/gjenkjent kategori.
ALTER TABLE public.filter_synonyms
  ADD COLUMN is_ambiguous BOOLEAN NOT NULL DEFAULT false;

-- Hånd-seedede "elektrisk"-fraser (20260731190000/20260804100000) er
-- generiske adjektiv utenfor Bil-kontekst.
UPDATE public.filter_synonyms
SET is_ambiguous = true
WHERE phrase IN ('elektrisk', 'elektrisk bil');

-- Den generiske auto-seeden (20260731140000) seeder også "el" rått fra
-- fuel_type-optionens label_nb -- like tvetydig som "elektrisk".
UPDATE public.filter_synonyms fs
SET is_ambiguous = true
FROM public.category_filters cf
WHERE fs.category_filter_id = cf.id
  AND cf.key = 'fuel_type'
  AND fs.option_value = 'el'
  AND fs.phrase = 'el';
