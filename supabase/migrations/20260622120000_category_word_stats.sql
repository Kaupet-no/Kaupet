-- Learned category suggestions: aggregate (title word -> category) counts from
-- real listings, so the "new listing" form can suggest a category as the user
-- types a title. No titles or seller info are stored, only stemmed-word counts.

CREATE TABLE public.listing_category_word_stats (
  lexeme TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  listing_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lexeme, category_id)
);

CREATE INDEX listing_category_word_stats_lexeme_idx ON public.listing_category_word_stats(lexeme);

ALTER TABLE public.listing_category_word_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Category word stats are viewable by everyone"
  ON public.listing_category_word_stats FOR SELECT USING (true);

-- Bookkeeping of what was last folded into the stats table for a listing, so
-- edits/republish/expiry can decrement the old contribution before recounting
-- without double-counting.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS counted_category_id UUID,
  ADD COLUMN IF NOT EXISTS counted_lexemes TEXT[];

CREATE OR REPLACE FUNCTION public.listings_update_category_word_stats()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _new_lexemes TEXT[];
BEGIN
  -- Decrement the previous contribution of this listing, if any.
  IF OLD.counted_category_id IS NOT NULL AND OLD.counted_lexemes IS NOT NULL THEN
    UPDATE public.listing_category_word_stats s
    SET listing_count = GREATEST(listing_count - 1, 0),
        updated_at = now()
    FROM unnest(OLD.counted_lexemes) AS lex(lexeme)
    WHERE s.lexeme = lex.lexeme AND s.category_id = OLD.counted_category_id;
  END IF;

  -- Only (re)count when the listing is currently active and has a category.
  IF NEW.status = 'active' AND NEW.category_id IS NOT NULL THEN
    SELECT array_agg(DISTINCT word) INTO _new_lexemes
    FROM ts_stat(format('SELECT to_tsvector(''norwegian'', %L)', coalesce(NEW.title, '')));

    IF _new_lexemes IS NOT NULL THEN
      INSERT INTO public.listing_category_word_stats (lexeme, category_id, listing_count)
      SELECT lex, NEW.category_id, 1
      FROM unnest(_new_lexemes) AS lex
      ON CONFLICT (lexeme, category_id)
      DO UPDATE SET listing_count = listing_category_word_stats.listing_count + 1,
                     updated_at = now();
    END IF;

    NEW.counted_category_id := NEW.category_id;
    NEW.counted_lexemes := _new_lexemes;
  ELSE
    NEW.counted_category_id := NULL;
    NEW.counted_lexemes := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_update_category_word_stats_trigger ON public.listings;
CREATE TRIGGER listings_update_category_word_stats_trigger
BEFORE INSERT OR UPDATE OF status, category_id, title ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_update_category_word_stats();

REVOKE EXECUTE ON FUNCTION public.listings_update_category_word_stats() FROM PUBLIC, anon, authenticated;

-- Hard-deleting a listing (e.g. from "Mine annonser") bypasses the BEFORE
-- INSERT/UPDATE trigger above, so its contribution must be removed separately
-- on DELETE to avoid leaking stats forever.
CREATE OR REPLACE FUNCTION public.listings_remove_category_word_stats()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.counted_category_id IS NOT NULL AND OLD.counted_lexemes IS NOT NULL THEN
    UPDATE public.listing_category_word_stats s
    SET listing_count = GREATEST(listing_count - 1, 0),
        updated_at = now()
    FROM unnest(OLD.counted_lexemes) AS lex(lexeme)
    WHERE s.lexeme = lex.lexeme AND s.category_id = OLD.counted_category_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS listings_remove_category_word_stats_trigger ON public.listings;
CREATE TRIGGER listings_remove_category_word_stats_trigger
AFTER DELETE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_remove_category_word_stats();

REVOKE EXECUTE ON FUNCTION public.listings_remove_category_word_stats() FROM PUBLIC, anon, authenticated;

-- Backfill: force the trigger to run once over existing active listings by
-- touching the `title` column it watches, instead of duplicating the
-- tokenization logic here.
UPDATE public.listings
SET title = title
WHERE status = 'active' AND category_id IS NOT NULL;

-- Query function: tokenize a candidate title the same way and return the
-- best-matching categories by total historical vote count.
CREATE OR REPLACE FUNCTION public.suggest_category_for_title(_title TEXT)
RETURNS TABLE (
  category_id UUID,
  slug TEXT,
  name_nb TEXT,
  parent_id UUID,
  parent_name_nb TEXT,
  votes BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.slug, c.name_nb, c.parent_id, p.name_nb AS parent_name_nb,
         SUM(s.listing_count)::BIGINT AS votes
  FROM ts_stat(format('SELECT to_tsvector(''norwegian'', %L)', coalesce(_title, ''))) t
  JOIN public.listing_category_word_stats s ON s.lexeme = t.word
  JOIN public.categories c ON c.id = s.category_id
  LEFT JOIN public.categories p ON p.id = c.parent_id
  GROUP BY c.id, c.slug, c.name_nb, c.parent_id, p.name_nb
  ORDER BY votes DESC
  LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_category_for_title(TEXT) TO anon, authenticated;
