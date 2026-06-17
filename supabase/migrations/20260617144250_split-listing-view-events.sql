-- listing_views har UNIQUE(listing_id, visitor_key), så count(*) og
-- count(DISTINCT visitor_key) på den tabellen er alltid identiske —
-- "totalt antall visninger" har i praksis aldri vært noe annet enn
-- "unike besøkende". For å faktisk skille de to innfører vi en egen
-- hendelsestabell for rå visninger, og lar listing_views forbli
-- kilden for unike besøkende (uendret skjema/constraint).

CREATE TABLE public.listing_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  visitor_key text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX listing_view_events_listing_id_idx ON public.listing_view_events(listing_id);
CREATE INDEX listing_view_events_listing_visitor_created_idx
  ON public.listing_view_events(listing_id, visitor_key, created_at DESC);

ALTER TABLE public.listing_view_events ENABLE ROW LEVEL SECURITY;

-- Samme modell som listing_views: ingen direkte klienttilgang.
-- Skriving skjer kun via log_listing_view() (SECURITY DEFINER),
-- lesing kun via aggregat-RPC-er og admin-policyen under.
GRANT ALL ON public.listing_view_events TO service_role;

CREATE POLICY "Admins can view listing view events"
  ON public.listing_view_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Logg en visning: alltid (med 30 min rate-limit per besøkende+annonse
-- for å unngå at refresh/dobbel-mount blåser opp tallet), og oppdater
-- settet med unike besøkende som før.
CREATE OR REPLACE FUNCTION public.log_listing_view(_listing_id uuid, _visitor_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _visitor_key IS NULL OR length(trim(_visitor_key)) = 0 THEN
    RAISE EXCEPTION 'visitor_key er påkrevd';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.listings l WHERE l.id = _listing_id AND l.status = 'active'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.listing_views (listing_id, visitor_key, user_id)
  VALUES (_listing_id, _visitor_key, auth.uid())
  ON CONFLICT (listing_id, visitor_key) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.listing_view_events e
    WHERE e.listing_id = _listing_id
      AND e.visitor_key = _visitor_key
      AND e.created_at > now() - interval '30 minutes'
  ) THEN
    INSERT INTO public.listing_view_events (listing_id, visitor_key, user_id)
    VALUES (_listing_id, _visitor_key, auth.uid());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.log_listing_view(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_listing_view(uuid, text) TO anon, authenticated;

-- listing_stats: total_views = rå visninger, unique_visitors = unike besøkende.
CREATE OR REPLACE FUNCTION public.listing_stats(_listing_id uuid)
RETURNS TABLE(total_views bigint, unique_visitors bigint, favorite_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = _listing_id AND l.seller_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = _listing_id),
    (SELECT count(*) FROM public.listing_views v WHERE v.listing_id = _listing_id),
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = _listing_id);
END;
$$;

-- my_listing_counts: view_count = rå visninger.
CREATE OR REPLACE FUNCTION public.my_listing_counts()
RETURNS TABLE(listing_id uuid, view_count bigint, favorite_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id),
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = l.id)
  FROM public.listings l
  WHERE l.seller_id = auth.uid();
$$;

-- popular_listings_last_week: total_views/views_last_week = rå visninger.
CREATE OR REPLACE FUNCTION public.popular_listings_last_week(_limit int DEFAULT 8)
RETURNS TABLE(
  listing_id uuid,
  kaupet_code char(8),
  title text,
  price_nok int,
  is_free boolean,
  city text,
  created_at timestamptz,
  cover_path text,
  total_views bigint,
  views_last_week bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.kaupet_code,
    l.title,
    l.price_nok,
    l.is_free,
    l.city,
    l.created_at,
    (
      SELECT i.storage_path
      FROM public.listing_images i
      WHERE i.listing_id = l.id
      ORDER BY i.sort_order ASC
      LIMIT 1
    ) AS cover_path,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e
       WHERE e.listing_id = l.id
         AND e.created_at > now() - interval '7 days') AS views_last_week
  FROM public.listings l
  WHERE l.status = 'active'
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 50));
$$;

-- Admin-RPC-er: "views" skal også være rå visninger, ikke unike besøkende.
CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS TABLE(
  views_7d bigint,
  views_30d bigint,
  new_users_30d bigint,
  active_listings bigint,
  total_listings bigint,
  conversations_total bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY SELECT
    (SELECT count(*) FROM public.listing_view_events WHERE created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.listing_view_events WHERE created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.listings WHERE status = 'active'),
    (SELECT count(*) FROM public.listings),
    (SELECT count(*) FROM public.conversations);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_popular_listings(_limit int DEFAULT 10)
RETURNS TABLE(
  id uuid,
  title text,
  status listing_status,
  view_count bigint,
  favorite_count bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.title,
    l.status,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id) AS view_count,
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = l.id) AS favorite_count,
    l.created_at
  FROM public.listings l
  ORDER BY view_count DESC, favorite_count DESC
  LIMIT _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_popular_categories()
RETURNS TABLE(
  id uuid,
  name_nb text,
  slug text,
  listing_count bigint,
  view_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name_nb,
    c.slug,
    (SELECT count(*) FROM public.listings l WHERE l.category_id = c.id) AS listing_count,
    (SELECT count(*) FROM public.listing_view_events e
       JOIN public.listings l ON l.id = e.listing_id
       WHERE l.category_id = c.id) AS view_count
  FROM public.categories c
  ORDER BY listing_count DESC, view_count DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_views_timeseries(_days int DEFAULT 30)
RETURNS TABLE(day date, views bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT d::date AS day,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.created_at::date = d::date) AS views
  FROM generate_series(
    (now() - (_days || ' days')::interval)::date,
    now()::date,
    interval '1 day'
  ) d;
END;
$$;

-- admin_export_user_data: total_views i eksporten skal også gjenspeile rå visninger.
CREATE OR REPLACE FUNCTION public.admin_export_user_data(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id;

  _result := jsonb_build_object(
    'generated_at', now(),
    'generated_by_admin_id', auth.uid(),
    'user_id', _user_id,
    'auth', (
      SELECT jsonb_build_object(
        'email', u.email,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'email_confirmed_at', u.email_confirmed_at
      )
      FROM auth.users u WHERE u.id = _user_id
    ),
    'profile', (
      SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _user_id
    ),
    'roles', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.user_roles r WHERE r.user_id = _user_id
    ), '[]'::jsonb),
    'listings', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(l) || jsonb_build_object(
          'images', COALESCE((
            SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order)
            FROM public.listing_images i WHERE i.listing_id = l.id
          ), '[]'::jsonb)
        )
      )
      FROM public.listings l WHERE l.seller_id = _user_id
    ), '[]'::jsonb),
    'favorites', COALESCE((
      SELECT jsonb_agg(to_jsonb(f)) FROM public.favorites f WHERE f.user_id = _user_id
    ), '[]'::jsonb),
    'conversations', COALESCE((
      SELECT jsonb_agg(to_jsonb(c))
      FROM public.conversations c
      WHERE c.buyer_id = _user_id OR c.seller_id = _user_id
    ), '[]'::jsonb),
    'messages', COALESCE((
      SELECT jsonb_agg(to_jsonb(m))
      FROM public.messages m
      WHERE m.sender_id = _user_id
         OR m.conversation_id IN (
           SELECT c.id FROM public.conversations c
           WHERE c.buyer_id = _user_id OR c.seller_id = _user_id
         )
    ), '[]'::jsonb),
    'reviews_given', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.user_reviews r WHERE r.reviewer_id = _user_id
    ), '[]'::jsonb),
    'reviews_received', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.user_reviews r WHERE r.reviewee_id = _user_id
    ), '[]'::jsonb),
    'reports_submitted', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.reports r WHERE r.reporter_id = _user_id
    ), '[]'::jsonb),
    'blocks', COALESCE((
      SELECT jsonb_agg(to_jsonb(b)) FROM public.user_blocks b WHERE b.blocker_id = _user_id
    ), '[]'::jsonb),
    'saved_searches', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
          'notifications', COALESCE((
            SELECT jsonb_agg(to_jsonb(n))
            FROM public.saved_search_notifications n
            WHERE n.saved_search_id = s.id
          ), '[]'::jsonb)
        )
      )
      FROM public.saved_searches s WHERE s.user_id = _user_id
    ), '[]'::jsonb),
    'sales', COALESCE((
      SELECT jsonb_agg(to_jsonb(s))
      FROM public.listing_sales s
      WHERE s.buyer_id = _user_id OR s.seller_id = _user_id
    ), '[]'::jsonb),
    'notification_preferences', (
      SELECT to_jsonb(np) FROM public.notification_preferences np WHERE np.user_id = _user_id
    ),
    'push_subscriptions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ps.id,
        'endpoint', ps.endpoint,
        'user_agent', ps.user_agent,
        'created_at', ps.created_at,
        'last_used_at', ps.last_used_at
      ))
      FROM public.push_subscriptions ps WHERE ps.user_id = _user_id
    ), '[]'::jsonb),
    'moderation', jsonb_build_object(
      'bans', COALESCE((
        SELECT jsonb_agg(to_jsonb(b)) FROM public.user_bans b WHERE b.user_id = _user_id
      ), '[]'::jsonb),
      'suspensions', COALESCE((
        SELECT jsonb_agg(to_jsonb(s)) FROM public.user_suspensions s WHERE s.user_id = _user_id
      ), '[]'::jsonb),
      'admin_actions_against_user', COALESCE((
        SELECT jsonb_agg(to_jsonb(l))
        FROM public.admin_moderation_log l
        WHERE l.target_type = 'user' AND l.target_id = _user_id::text
      ), '[]'::jsonb)
    ),
    'account_deletion', (
      SELECT to_jsonb(ad) FROM public.account_deletions ad WHERE ad.user_id = _user_id
    ),
    'listing_view_counts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'listing_id', l.id,
        'title', l.title,
        'total_views', (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id)
      ))
      FROM public.listings l WHERE l.seller_id = _user_id
    ), '[]'::jsonb)
  );

  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'export_user_data', 'user', _user_id::text, COALESCE(_email, ''));

  RETURN _result;
END;
$$;
