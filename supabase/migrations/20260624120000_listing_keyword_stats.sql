-- Keyword suggestions: aggregate (word -> category) counts from real listing
-- titles so the "new listing" form can suggest popular keywords from other
-- listings in the same category. Only clean surface-form words are stored
-- (not PostgreSQL stems), so they can be shown directly in the UI.

CREATE TABLE public.listing_keyword_stats (
  word TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  listing_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (word, category_id)
);

CREATE INDEX listing_keyword_stats_category_idx ON public.listing_keyword_stats(category_id, listing_count DESC);

ALTER TABLE public.listing_keyword_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Keyword stats are viewable by everyone"
  ON public.listing_keyword_stats FOR SELECT USING (true);

-- Bookkeeping columns so edits/republish/expiry can decrement the old
-- contribution before recounting, without double-counting.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS counted_keyword_category_id UUID,
  ADD COLUMN IF NOT EXISTS counted_keywords TEXT[];

CREATE OR REPLACE FUNCTION public.listings_update_keyword_stats()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _stopwords TEXT[] := ARRAY[
    'og','er','en','et','ei','i','på','med','til','av','for','som','fra',
    'har','den','det','de','vi','du','kan','ikke','seg','han','hun','men',
    'om','så','ut','enn','da','når','at','dem','sin','hva','ved','var',
    'nye','ny','god','lite','litt','stor','selger','selges','kjøper',
    'kjøpes','pris','brukt','gammel','denne','dette','disse','alle',
    'her','der','inn','ute','også','bare','men','etter','over','under',
    'mot','uten','hos','deg','meg','oss','dere','hun','ham','ett','two',
    'tre','fire','fem','seks','sju','åtte','ni','ti'
  ];
  _new_words TEXT[];
BEGIN
  -- Decrement previous contribution of this listing, if any.
  IF OLD.counted_keyword_category_id IS NOT NULL AND OLD.counted_keywords IS NOT NULL THEN
    UPDATE public.listing_keyword_stats s
    SET listing_count = GREATEST(listing_count - 1, 0)
    FROM unnest(OLD.counted_keywords) AS w(word)
    WHERE s.word = w.word AND s.category_id = OLD.counted_keyword_category_id;
  END IF;

  -- Only (re)count when the listing is active and has a category.
  IF NEW.status = 'active' AND NEW.category_id IS NOT NULL THEN
    SELECT array_agg(DISTINCT w)
    INTO _new_words
    FROM (
      SELECT regexp_split_to_table(
        lower(regexp_replace(coalesce(NEW.title, ''), '[^a-zæøåA-ZÆØÅ0-9\s]', '', 'g')),
        '\s+'
      ) AS w
    ) sub
    WHERE length(w) >= 3
      AND w NOT IN (SELECT unnest(_stopwords));

    IF _new_words IS NOT NULL THEN
      INSERT INTO public.listing_keyword_stats (word, category_id, listing_count)
      SELECT w, NEW.category_id, 1
      FROM unnest(_new_words) AS w
      ON CONFLICT (word, category_id)
      DO UPDATE SET listing_count = listing_keyword_stats.listing_count + 1;
    END IF;

    NEW.counted_keyword_category_id := NEW.category_id;
    NEW.counted_keywords := _new_words;
  ELSE
    NEW.counted_keyword_category_id := NULL;
    NEW.counted_keywords := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_update_keyword_stats_trigger ON public.listings;
CREATE TRIGGER listings_update_keyword_stats_trigger
BEFORE INSERT OR UPDATE OF status, category_id, title ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_update_keyword_stats();

REVOKE EXECUTE ON FUNCTION public.listings_update_keyword_stats() FROM PUBLIC, anon, authenticated;

-- Hard-deletes must also decrement.
CREATE OR REPLACE FUNCTION public.listings_remove_keyword_stats()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.counted_keyword_category_id IS NOT NULL AND OLD.counted_keywords IS NOT NULL THEN
    UPDATE public.listing_keyword_stats s
    SET listing_count = GREATEST(listing_count - 1, 0)
    FROM unnest(OLD.counted_keywords) AS w(word)
    WHERE s.word = w.word AND s.category_id = OLD.counted_keyword_category_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS listings_remove_keyword_stats_trigger ON public.listings;
CREATE TRIGGER listings_remove_keyword_stats_trigger
AFTER DELETE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_remove_keyword_stats();

REVOKE EXECUTE ON FUNCTION public.listings_remove_keyword_stats() FROM PUBLIC, anon, authenticated;

-- Backfill from existing active listings.
UPDATE public.listings
SET title = title
WHERE status = 'active' AND category_id IS NOT NULL;

-- Query function: return popular keywords for a category that are NOT already
-- present in the candidate title, so suggestions add genuine value.
CREATE OR REPLACE FUNCTION public.suggest_keywords_for_listing(
  _title TEXT,
  _category_id UUID
)
RETURNS TABLE (word TEXT, listing_count INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

  RETURN QUERY
  SELECT s.word, s.listing_count
  FROM public.listing_keyword_stats s
  WHERE s.category_id = _category_id
    AND s.listing_count >= 3
    AND (_title_words IS NULL OR s.word <> ALL(_title_words))
  ORDER BY s.listing_count DESC
  LIMIT 8;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_keywords_for_listing(TEXT, UUID) TO anon, authenticated;
