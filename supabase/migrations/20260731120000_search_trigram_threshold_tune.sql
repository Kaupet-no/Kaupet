-- Lowers the trigram fallback threshold: 0.35 missed common typos like an
-- adjacent-letter swap near the start of a word ("ihpone" vs "iphone"),
-- which score lower on trigram similarity than swaps/typos later in the
-- word despite being an equally obvious typo to a human reader.
CREATE OR REPLACE FUNCTION public.listings_search_term_match(
  search_vector tsvector,
  title text,
  term text
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT search_vector @@ websearch_to_tsquery('norwegian', term)
    OR similarity(title, term) > 0.25
$$;
