
-- Saved searches table
CREATE TABLE public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  notify boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;
GRANT ALL ON public.saved_searches TO service_role;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own saved searches" ON public.saved_searches
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX saved_searches_user_idx ON public.saved_searches(user_id);
CREATE INDEX saved_searches_notify_idx ON public.saved_searches(notify) WHERE notify = true;
CREATE TRIGGER saved_searches_updated_at BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Notifications table
CREATE TABLE public.saved_search_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_search_id uuid NOT NULL REFERENCES public.saved_searches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(saved_search_id, listing_id)
);
GRANT SELECT, UPDATE, DELETE ON public.saved_search_notifications TO authenticated;
GRANT ALL ON public.saved_search_notifications TO service_role;
ALTER TABLE public.saved_search_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notifications" ON public.saved_search_notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.saved_search_notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.saved_search_notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ssn_user_unread_idx ON public.saved_search_notifications(user_id, read_at, created_at DESC);

-- Matching function
CREATE OR REPLACE FUNCTION public.match_listing_to_saved_searches(_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l RECORD;
  s RECORD;
  c jsonb;
  cats jsonb;
  conds jsonb;
  terms jsonb;
  q_mode text;
  cat_mode text;
  min_price int;
  max_price int;
  include_free boolean;
  center_lat double precision;
  center_lng double precision;
  radius_km double precision;
  dist double precision;
  cat_slug text;
  cat_ids uuid[];
  match_count int;
  term text;
  pattern text;
  term_matches boolean;
  all_match boolean;
  any_match boolean;
BEGIN
  SELECT l2.*, cc.slug AS cat_slug
  INTO l
  FROM public.listings l2
  LEFT JOIN public.categories cc ON cc.id = l2.category_id
  WHERE l2.id = _listing_id AND l2.status = 'active';

  IF NOT FOUND THEN RETURN; END IF;

  FOR s IN
    SELECT * FROM public.saved_searches WHERE notify = true
  LOOP
    c := s.criteria;

    -- Categories
    cats := COALESCE(c->'categories', '[]'::jsonb);
    cat_mode := COALESCE(c->>'catMode', 'any');
    IF jsonb_array_length(cats) > 0 THEN
      IF l.cat_slug IS NULL THEN CONTINUE; END IF;
      -- listing has one category; "any" requires slug in list, "all" with 2+ slugs cannot match
      IF cat_mode = 'all' AND jsonb_array_length(cats) > 1 THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(cats) x WHERE x.value = l.cat_slug) THEN
        CONTINUE;
      END IF;
    END IF;

    -- Conditions
    conds := COALESCE(c->'conditions', '[]'::jsonb);
    IF jsonb_array_length(conds) > 0 THEN
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(conds) x WHERE x.value = l.condition::text) THEN
        CONTINUE;
      END IF;
    END IF;

    -- Price
    min_price := NULLIF(c->>'min','')::int;
    max_price := NULLIF(c->>'max','')::int;
    include_free := COALESCE((c->>'includeFree')::boolean, true);
    IF l.is_free THEN
      IF NOT include_free THEN CONTINUE; END IF;
    ELSE
      IF min_price IS NOT NULL AND (l.price_nok IS NULL OR l.price_nok < min_price) THEN CONTINUE; END IF;
      IF max_price IS NOT NULL AND (l.price_nok IS NULL OR l.price_nok > max_price) THEN CONTINUE; END IF;
    END IF;

    -- Terms (q split by whitespace, or terms array)
    terms := COALESCE(c->'terms', '[]'::jsonb);
    IF jsonb_array_length(terms) = 0 AND COALESCE(c->>'q','') <> '' THEN
      terms := to_jsonb(regexp_split_to_array(trim(c->>'q'), '\s+'));
    END IF;
    q_mode := COALESCE(c->>'qMode','all');
    IF jsonb_array_length(terms) > 0 THEN
      all_match := true;
      any_match := false;
      FOR term IN SELECT x.value FROM jsonb_array_elements_text(terms) x LOOP
        IF term IS NULL OR length(trim(term)) = 0 THEN CONTINUE; END IF;
        pattern := '%' || trim(term) || '%';
        term_matches := (COALESCE(l.title,'') ILIKE pattern)
                     OR (COALESCE(l.description,'') ILIKE pattern)
                     OR (COALESCE(l.city,'') ILIKE pattern);
        IF term_matches THEN any_match := true; ELSE all_match := false; END IF;
      END LOOP;
      IF q_mode = 'all' AND NOT all_match THEN CONTINUE; END IF;
      IF q_mode = 'any' AND NOT any_match THEN CONTINUE; END IF;
    END IF;

    -- Location/radius
    center_lat := NULLIF(c->>'lat','')::double precision;
    center_lng := NULLIF(c->>'lng','')::double precision;
    radius_km := COALESCE(NULLIF(c->>'radius','')::double precision, 10);
    IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
      IF l.lat IS NULL OR l.lng IS NULL THEN CONTINUE; END IF;
      dist := 6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(center_lat)) * cos(radians(l.lat)) *
        cos(radians(l.lng) - radians(center_lng)) +
        sin(radians(center_lat)) * sin(radians(l.lat))
      )));
      IF dist > radius_km THEN CONTINUE; END IF;
    END IF;

    -- Match — insert notification (skip if seller is the saved-search owner)
    IF s.user_id <> l.seller_id THEN
      INSERT INTO public.saved_search_notifications (saved_search_id, user_id, listing_id)
      VALUES (s.id, s.user_id, l.id)
      ON CONFLICT (saved_search_id, listing_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Trigger
CREATE OR REPLACE FUNCTION public.listings_match_saved_searches_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.match_listing_to_saved_searches(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listings_match_saved_searches
AFTER INSERT OR UPDATE OF status ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_match_saved_searches_trigger();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_search_notifications;
