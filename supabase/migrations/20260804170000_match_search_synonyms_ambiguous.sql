-- Eksponerer filter_synonyms.is_ambiguous og category_filters.category_id
-- til klienten, slik at fetchSynonymMatches kan kreve et korroborerende,
-- ikke-tvetydig treff i samme kategori før et tvetydig synonym (f.eks.
-- "elektrisk") godtas i et søk uten valgt/gjenkjent kategori. Se
-- 20260804160000_ambiguous_filter_synonyms.sql for kolonnen og
-- src/features/listing-search/use-search-synonym-matches.ts for sperren.
-- Ren tilleggsendring i SELECT-listen -- påvirker ikke DISTINCT ON/ORDER BY.
CREATE OR REPLACE FUNCTION public.match_search_synonyms(
  p_category_id uuid,
  phrases text[]
)
RETURNS TABLE(
  phrase text,
  filter_key text,
  filter_label text,
  option_value text,
  option_label text,
  is_ambiguous boolean,
  category_id uuid
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id FROM public.categories WHERE id = p_category_id
    UNION ALL
    SELECT c.id, c.parent_id
    FROM public.categories c
    JOIN ancestors a ON c.id = a.parent_id
  )
  SELECT DISTINCT ON (p.phrase, cf.key)
    p.phrase,
    cf.key AS filter_key,
    cf.label_nb AS filter_label,
    fs.option_value,
    CASE
      WHEN fs.option_value IS NULL THEN NULL
      ELSE (
        SELECT opt->>'label_nb'
        FROM jsonb_array_elements(cf.options) opt
        WHERE opt->>'value' = fs.option_value
        LIMIT 1
      )
    END AS option_label,
    fs.is_ambiguous,
    cf.category_id
  FROM unnest(phrases) AS p(phrase)
  JOIN public.filter_synonyms fs ON fs.phrase = lower(p.phrase)
  JOIN public.category_filters cf ON cf.id = fs.category_filter_id
  WHERE p_category_id IS NULL OR cf.category_id IN (SELECT id FROM ancestors)
  ORDER BY p.phrase, cf.key, length(p.phrase) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.match_search_synonyms(uuid, text[]) TO anon, authenticated;
