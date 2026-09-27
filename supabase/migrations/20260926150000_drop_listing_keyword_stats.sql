-- suggest_keywords_for_listing leser nå listings.counted_keywords direkte
-- (20260926090000), så den aggregerte listing_keyword_stats har ingen
-- lesere. Triggeren som setter counted_keywords/counted_keyword_category_id
-- beholdes, men slankes til bare det; ned-tellingen ved sletting og
-- opprydningen av tomme rader forsvinner med tabellen.

DROP TRIGGER IF EXISTS listings_remove_keyword_stats_trigger ON public.listings;
DROP FUNCTION IF EXISTS public.listings_remove_keyword_stats();

-- Tar med seg listing_keyword_stats_delete_zero.
DROP TABLE IF EXISTS public.listing_keyword_stats;
DROP FUNCTION IF EXISTS public.delete_zero_listing_keyword_stat();

-- OR REPLACE beholder rettighetene og BEFORE INSERT OR UPDATE OF
-- status, category_id, title-triggeren som peker hit.
CREATE OR REPLACE FUNCTION public.listings_update_keyword_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
BEGIN
  IF NEW.status = 'active' AND NEW.category_id IS NOT NULL THEN
    SELECT array_agg(DISTINCT w)
    INTO NEW.counted_keywords
    FROM (
      SELECT regexp_split_to_table(
        lower(regexp_replace(coalesce(NEW.title, ''), '[^a-zæøåA-ZÆØÅ0-9\s]', '', 'g')),
        '\s+'
      ) AS w
    ) sub
    WHERE length(w) >= 3
      AND w NOT IN (SELECT unnest(_stopwords));

    NEW.counted_keyword_category_id := NEW.category_id;
  ELSE
    NEW.counted_keyword_category_id := NULL;
    NEW.counted_keywords := NULL;
  END IF;

  RETURN NEW;
END;
$$;
