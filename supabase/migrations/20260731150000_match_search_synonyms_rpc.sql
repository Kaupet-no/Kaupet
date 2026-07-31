-- Resolves which of the given candidate phrases (n-grams the client extracts
-- from the raw search text, see useSearchSynonymMatches) are recognized
-- equipment/attribute vocabulary for a category (or one of its ancestors, so
-- a filter defined on "Bil og MC" applies to "Personbil" too — same
-- inheritance rule as effectiveFiltersForCategory client-side).
--
-- Deliberately does NOT touch search_listing_ids or listings.search_vector:
-- the client uses the match to move a recognized phrase out of the free-text
-- query and into the existing, already-correct attribute-containment filter
-- path (applyAttributeFilters' `attributes @> {...}`), rather than teaching
-- the SQL text-search function a parallel, harder-to-verify matching mode.
-- Longest phrase wins on overlap (e.g. "adaptiv cruisecontrol" over
-- "cruisecontrol") -- expressed by having the client pass longest-first and
-- the caller preferring the first row per filter_key, but ranking is also
-- exposed via phrase length here so any caller can re-sort defensively.
CREATE OR REPLACE FUNCTION public.match_search_synonyms(
  p_category_id uuid,
  phrases text[]
)
RETURNS TABLE(phrase text, filter_key text, filter_label text, option_value text, option_label text)
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
    END AS option_label
  FROM unnest(phrases) AS p(phrase)
  JOIN public.filter_synonyms fs ON fs.phrase = lower(p.phrase)
  JOIN public.category_filters cf ON cf.id = fs.category_filter_id
  WHERE p_category_id IS NOT NULL
    AND cf.category_id IN (SELECT id FROM ancestors)
  ORDER BY p.phrase, cf.key, length(p.phrase) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.match_search_synonyms(uuid, text[]) TO anon, authenticated;
