-- Nøkkelordforslagene var de vanligste tittelordene i hele kategorien, uten
-- kobling til annonsen: en bil av et annet merke fikk «volvo», en iPhone
-- kunne få «samsung». Foreslå i stedet ord fra titlene til aktive annonser i
-- samme kategori som deler minst ett tittelord med kandidaten.
-- `counted_keywords` er tittelordene (uten stoppord, ≥ 3 tegn) som
-- keyword-triggeren allerede lagrer per aktive annonse.
CREATE OR REPLACE FUNCTION public.suggest_keywords_for_listing(_title text, _category_id uuid)
RETURNS TABLE(word text, listing_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _title_words TEXT[];
BEGIN
  -- Extract words from the candidate title the same way the trigger does.
  SELECT array_agg(DISTINCT w)
  INTO _title_words
  FROM (
    SELECT regexp_split_to_table(
      lower(regexp_replace(coalesce(_title, ''), '[^a-zæøåA-ZÆØÅ0-9\s]', '', 'g')),
      '\s+'
    ) AS w
  ) sub
  WHERE length(w) >= 1;

  IF _title_words IS NULL THEN
    RETURN;
  END IF;

  -- ponytail: skanner kategoriens aktive annonser (listings_category_idx);
  -- legg GIN-indeks på counted_keywords hvis store kategorier blir trege.
  RETURN QUERY
  SELECT w.word, count(*)::integer AS listing_count
  FROM public.listings l
  CROSS JOIN LATERAL unnest(l.counted_keywords) AS w(word)
  WHERE l.counted_keyword_category_id = _category_id
    AND l.category_id = _category_id
    AND l.counted_keywords && _title_words
    AND w.word <> ALL(_title_words)
  GROUP BY w.word
  HAVING count(*) >= 3
  ORDER BY count(*) DESC, w.word
  LIMIT 8;
END;
$$;
