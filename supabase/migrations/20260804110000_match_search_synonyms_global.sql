-- Lets match_search_synonyms run without a category (p_category_id = NULL),
-- searching every category's vocabulary instead of just one category's
-- ancestor chain — needed so free-text filter recognition ("elbil",
-- "ikke el", "SUV") also works before the user has picked a category (e.g.
-- typing straight into the /annonser search box with no category selected).
--
-- Collapsing is still DISTINCT ON (phrase, filter_key): if two categories
-- happened to define the exact same phrase for the exact same filter key
-- but a *different* option value, one would arbitrarily win. In practice
-- the vocabulary this seeds from (fuel_type, body_type, equipment options)
-- uses the same option codes across every vehicle category, so this is a
-- deliberate, low-risk simplification rather than an oversight.
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
  WHERE p_category_id IS NULL OR cf.category_id IN (SELECT id FROM ancestors)
  ORDER BY p.phrase, cf.key, length(p.phrase) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.match_search_synonyms(uuid, text[]) TO anon, authenticated;
