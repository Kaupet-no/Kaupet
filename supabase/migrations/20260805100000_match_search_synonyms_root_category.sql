-- Fixes ambiguity corroboration in fetchSynonymMatches
-- (src/features/listing-search/use-search-synonym-matches.ts): a phrase
-- like "elektrisk" is seeded once per category that has a fuel_type filter
-- (Bil, Bobil, Motorsykkel, Moped -- see 20260731190000), so the previous
-- `DISTINCT ON (phrase, filter_key)` could arbitrarily resolve "elektrisk"
-- to e.g. Motorsykkel's category_id while a co-occurring "SUV" (body_type,
-- Bil-only, see 20260731170000) resolves to Bil's -- an exact category_id
-- comparison then wrongly treated them as unrelated and dropped the
-- ambiguous match even though both are clearly vehicle-context signals.
-- Returning each match's topmost category ancestor instead (they all share
-- the "bil-og-mc" root) makes the client-side corroboration check robust to
-- which sibling vehicle category the DISTINCT ON happened to pick.
DROP FUNCTION IF EXISTS public.match_search_synonyms(uuid, text[]);

CREATE FUNCTION public.match_search_synonyms(
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
  ),
  roots AS (
    SELECT id, id AS root_id FROM public.categories WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, r.root_id
    FROM public.categories c
    JOIN roots r ON c.parent_id = r.id
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
    COALESCE(r.root_id, cf.category_id) AS category_id
  FROM unnest(phrases) AS p(phrase)
  JOIN public.filter_synonyms fs ON fs.phrase = lower(p.phrase)
  JOIN public.category_filters cf ON cf.id = fs.category_filter_id
  LEFT JOIN roots r ON r.id = cf.category_id
  WHERE p_category_id IS NULL OR cf.category_id IN (SELECT id FROM ancestors)
  ORDER BY p.phrase, cf.key, length(p.phrase) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.match_search_synonyms(uuid, text[]) TO anon, authenticated;
