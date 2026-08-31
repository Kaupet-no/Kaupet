-- Remove browser/session identifiers from analytics, retain anonymous aggregate
-- listing counts, and enforce the retention periods documented for users.

-- Product events remain first-party aggregate events, but can no longer be
-- connected into a browser journey.
DROP FUNCTION IF EXISTS public.log_product_event_rate_limited(text, uuid, text, text, text, jsonb);
ALTER TABLE public.product_events DROP COLUMN IF EXISTS session_id;

CREATE FUNCTION public.log_product_event_rate_limited(
  _key_hash text,
  _event_name text,
  _platform text,
  _path text,
  _properties jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_attempts integer;
BEGIN
  IF length(_key_hash) <> 64
    OR _event_name NOT IN (
      'auth_started', 'auth_completed',
      'search_opened', 'search_submitted', 'search_zero_results',
      'search_page_viewed', 'search_filter_opened', 'search_filter_applied',
      'search_filter_cancelled', 'search_suggestion_selected',
      'search_zero_results_recovered', 'search_map_opened', 'search_saved',
      'search_result_opened',
      'listing_opened', 'contact_started', 'favorite_toggled',
      'listing_creation_started', 'listing_creation_step_completed',
      'listing_published', 'onboarding_completed'
    )
    OR _platform NOT IN ('web', 'ios', 'android')
    OR length(_path) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(_properties) <> 'object'
    OR pg_column_size(_properties) > 2048 THEN
    RAISE EXCEPTION 'Invalid product event input';
  END IF;

  INSERT INTO public.product_event_rate_limits AS limits
    (key_hash, window_started_at, attempts)
  VALUES (_key_hash, now(), 1)
  ON CONFLICT (key_hash) DO UPDATE SET
    attempts = CASE
      WHEN limits.window_started_at < now() - interval '10 minutes' THEN 1
      ELSE limits.attempts + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at < now() - interval '10 minutes' THEN now()
      ELSE limits.window_started_at
    END
  RETURNING attempts INTO current_attempts;

  IF current_attempts <= 180 THEN
    INSERT INTO public.product_events (event_name, platform, path, properties)
    VALUES (_event_name, _platform, _path, _properties);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.log_product_event_rate_limited(text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_product_event_rate_limited(text, text, text, text, jsonb)
  TO service_role;

-- Raw free-text search telemetry is deliberately removed. Search behaviour is
-- measured only through the allowlisted product events above. The admin
-- "Søk uten treff" page (admin/sok.tsx) is removed with it, since it existed
-- solely to browse stored raw search phrases.
DROP FUNCTION IF EXISTS public.admin_zero_result_searches(integer);
DROP FUNCTION IF EXISTS public.log_search_query_rate_limited(text, text, integer);
DROP TABLE IF EXISTS public.search_log_rate_limits;
DROP TABLE IF EXISTS public.search_query_stats;

-- Preserve the existing lifetime count before removing visitor identifiers.
CREATE TABLE public.listing_view_totals (
  listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  total_views bigint NOT NULL DEFAULT 0 CHECK (total_views >= 0)
);
INSERT INTO public.listing_view_totals (listing_id, total_views)
SELECT listing.id, GREATEST(
  listing.view_count::bigint,
  (SELECT count(*) FROM public.listing_view_events event WHERE event.listing_id = listing.id)
)
FROM public.listings AS listing;
ALTER TABLE public.listing_view_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.listing_view_totals FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.log_listing_view(uuid, text);
DROP TABLE IF EXISTS public.listing_views;
DROP INDEX IF EXISTS public.listing_view_events_listing_visitor_created_idx;
ALTER TABLE public.listing_view_events DROP COLUMN IF EXISTS visitor_key;
ALTER TABLE public.listing_view_events DROP COLUMN IF EXISTS user_id;
DELETE FROM public.listing_view_events event
WHERE NOT EXISTS (SELECT 1 FROM public.listings listing WHERE listing.id = event.listing_id);
ALTER TABLE public.listing_view_events
  ADD CONSTRAINT listing_view_events_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS listing_view_events_created_at_idx
  ON public.listing_view_events (created_at DESC);

CREATE TABLE public.listing_view_rate_limits (
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  key_hash text NOT NULL CHECK (length(key_hash) = 64),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, key_hash)
);
ALTER TABLE public.listing_view_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.listing_view_rate_limits FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.log_listing_view_rate_limited(_listing_id uuid, _key_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accepted boolean;
BEGIN
  IF length(_key_hash) <> 64 THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.listings
    WHERE id = _listing_id AND status = 'active'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.listing_view_rate_limits AS limits
    (listing_id, key_hash, window_started_at)
  VALUES (_listing_id, _key_hash, now())
  ON CONFLICT (listing_id, key_hash) DO UPDATE
    SET window_started_at = EXCLUDED.window_started_at
    WHERE limits.window_started_at < now() - interval '30 minutes'
  RETURNING true INTO accepted;

  IF NOT COALESCE(accepted, false) THEN
    RETURN false;
  END IF;

  INSERT INTO public.listing_view_events (listing_id) VALUES (_listing_id);
  INSERT INTO public.listing_view_totals (listing_id, total_views)
  VALUES (_listing_id, 1)
  ON CONFLICT (listing_id) DO UPDATE
    SET total_views = listing_view_totals.total_views + 1;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.log_listing_view_rate_limited(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_listing_view_rate_limited(uuid, text) TO service_role;

DROP FUNCTION IF EXISTS public.listing_stats(uuid);
CREATE FUNCTION public.listing_stats(_listing_id uuid)
RETURNS TABLE(total_views bigint, favorite_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
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
    COALESCE(t.total_views, 0),
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = _listing_id)
  FROM public.listings l
  LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
  WHERE l.id = _listing_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.listing_stats(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_listing_counts()
RETURNS TABLE(listing_id uuid, view_count bigint, favorite_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, COALESCE(t.total_views, 0),
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = l.id)
  FROM public.listings l
  LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
  WHERE l.seller_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.admin_popular_categories()
RETURNS TABLE(id uuid, name_nb text, slug text, listing_count bigint, view_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name_nb, c.slug,
    count(l.id)::bigint AS listing_count,
    COALESCE(sum(t.total_views), 0)::bigint AS view_count
  FROM public.categories c
  LEFT JOIN public.listings l ON l.category_id = c.id
  LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
  GROUP BY c.id, c.name_nb, c.slug
  ORDER BY listing_count DESC, view_count DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_popular_listings(_limit integer DEFAULT 10)
RETURNS TABLE(id uuid, title text, status public.listing_status, view_count bigint, favorite_count bigint, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT l.id, l.title, l.status,
    COALESCE(t.total_views, 0) AS view_count,
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = l.id) AS favorite_count,
    l.created_at
  FROM public.listings l
  LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
  ORDER BY view_count DESC, favorite_count DESC
  LIMIT _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.popular_listings_last_week(_limit integer DEFAULT 8)
RETURNS TABLE(listing_id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, created_at timestamptz, cover_path text, total_views bigint, views_last_week bigint, mileage_km numeric, category_slug text, attributes jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.kaupet_code, l.title, l.subtitle, l.price_nok, l.is_free, l.city, l.created_at,
    (SELECT i.storage_path FROM public.listing_images i WHERE i.listing_id = l.id ORDER BY i.sort_order LIMIT 1) AS cover_path,
    COALESCE(t.total_views, 0) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id AND e.created_at > now() - interval '7 days') AS views_last_week,
    (l.attributes->>'mileage_km')::numeric AS mileage_km,
    c.slug AS category_slug,
    l.attributes AS attributes
  FROM public.listings l
  LEFT JOIN public.categories c ON c.id = l.category_id
  LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
  WHERE l.status = 'active'
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 50));
$$;

CREATE OR REPLACE FUNCTION public.popular_listings_by_category(_category_ids uuid[], _limit integer DEFAULT 12, _offset integer DEFAULT 0)
RETURNS TABLE(listing_id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, created_at timestamptz, cover_path text, total_views bigint, views_last_week bigint, mileage_km numeric, category_slug text, attributes jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.kaupet_code, l.title, l.subtitle, l.price_nok, l.is_free, l.city, l.created_at,
    (SELECT i.storage_path FROM public.listing_images i WHERE i.listing_id = l.id ORDER BY i.sort_order LIMIT 1) AS cover_path,
    COALESCE(t.total_views, 0) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id AND e.created_at > now() - interval '7 days') AS views_last_week,
    (l.attributes->>'mileage_km')::numeric AS mileage_km,
    c.slug AS category_slug,
    l.attributes AS attributes
  FROM public.listings l
  LEFT JOIN public.categories c ON c.id = l.category_id
  LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
  WHERE l.status = 'active' AND l.category_id = ANY(_category_ids)
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 12), 60))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;
ALTER TABLE public.listings DROP COLUMN view_count;


-- Drafts are retained for 90 days after the last edit. A system message is
-- created at least seven days before a daily job may delete the draft.
ALTER TABLE public.listings ADD COLUMN draft_expiry_notified_at timestamptz;
ALTER TABLE public.wtb_listings ADD COLUMN draft_expiry_notified_at timestamptz;

CREATE FUNCTION public.purge_expired_personal_data() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sell_warned integer;
  want_warned integer;
  sell_deleted integer;
  want_deleted integer;
BEGIN
  WITH warned AS (
    UPDATE public.listings
    SET draft_expiry_notified_at = now()
    WHERE status = 'draft'
      AND updated_at < now() - interval '83 days'
      AND draft_expiry_notified_at IS NULL
    RETURNING seller_id, title
  ), notices AS (
    INSERT INTO public.system_messages (recipient_id, body)
    SELECT seller_id,
      'Utkastet «' || left(title, 80) || '» slettes om 7 dager hvis du ikke åpner og lagrer det på nytt.'
    FROM warned
    RETURNING 1
  )
  SELECT count(*) INTO sell_warned FROM notices;

  WITH warned AS (
    UPDATE public.wtb_listings
    SET draft_expiry_notified_at = now()
    WHERE status = 'draft'
      AND updated_at < now() - interval '83 days'
      AND draft_expiry_notified_at IS NULL
    RETURNING user_id, title
  ), notices AS (
    INSERT INTO public.system_messages (recipient_id, body)
    SELECT user_id,
      'Utkastet «' || left(title, 80) || '» slettes om 7 dager hvis du ikke åpner og lagrer det på nytt.'
    FROM warned
    RETURNING 1
  )
  SELECT count(*) INTO want_warned FROM notices;

  DELETE FROM public.listings
  WHERE status = 'draft'
    AND updated_at < now() - interval '90 days'
    AND draft_expiry_notified_at <= now() - interval '7 days';
  GET DIAGNOSTICS sell_deleted = ROW_COUNT;

  DELETE FROM public.wtb_listings
  WHERE status = 'draft'
    AND updated_at < now() - interval '90 days'
    AND draft_expiry_notified_at <= now() - interval '7 days';
  GET DIAGNOSTICS want_deleted = ROW_COUNT;

  DELETE FROM public.product_events WHERE created_at < now() - interval '90 days';
  DELETE FROM public.product_event_rate_limits WHERE window_started_at < now() - interval '1 day';
  DELETE FROM public.listing_view_events WHERE created_at < now() - interval '90 days';
  DELETE FROM public.listing_view_rate_limits WHERE window_started_at < now() - interval '1 day';
  DELETE FROM public.vehicle_lookup_log WHERE created_at < now() - interval '90 days';
  DELETE FROM public.error_log WHERE created_at < now() - interval '90 days';
  DELETE FROM public.push_dispatch_failures WHERE created_at < now() - interval '30 days';
  DELETE FROM public.listing_360_capture_sessions WHERE expires_at < now() - interval '7 days';
  DELETE FROM public.feedback WHERE created_at < now() - interval '2 years';
  DELETE FROM public.admin_moderation_log WHERE created_at < now() - interval '3 years';
  DELETE FROM public.reports WHERE resolved_at < now() - interval '3 years';
  DELETE FROM public.saved_search_notifications
    WHERE created_at < now() - interval '180 days' AND read_at IS NOT NULL;
  DELETE FROM public.favorite_price_drops
    WHERE created_at < now() - interval '180 days' AND read_at IS NOT NULL;
  DELETE FROM public.favorite_sold_notifications
    WHERE created_at < now() - interval '180 days' AND read_at IS NOT NULL;
  DELETE FROM public.wtb_match_notifications
    WHERE created_at < now() - interval '180 days' AND read_at IS NOT NULL;
  DELETE FROM public.system_messages
    WHERE (read_at IS NOT NULL AND created_at < now() - interval '1 year')
       OR created_at < now() - interval '2 years';

  RETURN jsonb_build_object(
    'sell_drafts_warned', sell_warned,
    'want_drafts_warned', want_warned,
    'sell_drafts_deleted', sell_deleted,
    'want_drafts_deleted', want_deleted
  );
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_personal_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_personal_data() TO service_role;
SELECT cron.schedule(
  'privacy-retention-daily',
  '30 3 * * *',
  'SELECT public.purge_expired_personal_data();'
);

-- Account deletion now removes both sales and want-to-buy listings. Messages
-- attached to the user's sales listings are removed by the existing cascades;
-- messages on other users' listings and reviews remain under the pseudonymized
-- profile.
CREATE OR REPLACE FUNCTION public.purge_expired_accounts() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _row record;
BEGIN
  FOR _row IN
    SELECT user_id FROM public.account_deletions WHERE scheduled_purge_at <= now()
  LOOP
    DELETE FROM public.wtb_listings WHERE user_id = _row.user_id;
    DELETE FROM public.listings WHERE seller_id = _row.user_id;
    UPDATE public.profiles
       SET display_name = 'Slettet bruker', avatar_url = NULL,
           deleted_at = now(), updated_at = now()
     WHERE id = _row.user_id;
    DELETE FROM auth.users WHERE id = _row.user_id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

-- Complete the operational access export with every current user-linked data
-- category. Aggregate product events and listing views have no user link.
CREATE OR REPLACE FUNCTION public.admin_export_user_data(_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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
    'generated_at', now(), 'generated_by_admin_id', auth.uid(), 'user_id', _user_id,
    'auth', (SELECT jsonb_build_object(
      'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at, 'user_metadata', u.raw_user_meta_data
    ) FROM auth.users u WHERE u.id = _user_id),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _user_id),
    'roles', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.user_roles r WHERE r.user_id = _user_id), '[]'::jsonb),
    'listings', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) || jsonb_build_object(
        'images', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order) FROM public.listing_images i WHERE i.listing_id = l.id), '[]'::jsonb),
        'frames_360', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.frame_order) FROM public.listing_360_frames f WHERE f.listing_id = l.id), '[]'::jsonb)
      )) FROM public.listings l WHERE l.seller_id = _user_id
    ), '[]'::jsonb),
    'want_to_buy_listings', COALESCE((SELECT jsonb_agg(to_jsonb(w)) FROM public.wtb_listings w WHERE w.user_id = _user_id), '[]'::jsonb),
    'capture_sessions_360', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.listing_360_capture_sessions s WHERE s.created_by = _user_id), '[]'::jsonb),
    'favorites', COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM public.favorites f WHERE f.user_id = _user_id), '[]'::jsonb),
    'conversations', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.conversations c WHERE c.buyer_id = _user_id OR c.seller_id = _user_id), '[]'::jsonb),
    'messages', COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM public.messages m WHERE m.sender_id = _user_id OR m.conversation_id IN (SELECT c.id FROM public.conversations c WHERE c.buyer_id = _user_id OR c.seller_id = _user_id)), '[]'::jsonb),
    'reviews_given', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.user_reviews r WHERE r.reviewer_id = _user_id), '[]'::jsonb),
    'reviews_received', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.user_reviews r WHERE r.reviewee_id = _user_id), '[]'::jsonb),
    'reports', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.reports r WHERE r.reporter_id = _user_id OR r.reported_user_id = _user_id OR r.resolved_by = _user_id), '[]'::jsonb),
    'blocks', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM public.user_blocks b WHERE b.blocker_id = _user_id OR b.blocked_id = _user_id), '[]'::jsonb),
    'saved_searches', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.saved_searches s WHERE s.user_id = _user_id), '[]'::jsonb),
    'saved_search_notifications', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.saved_search_notifications n WHERE n.user_id = _user_id), '[]'::jsonb),
    'want_to_buy_match_notifications', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.wtb_match_notifications n WHERE n.user_id = _user_id), '[]'::jsonb),
    'favorite_price_drops', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.favorite_price_drops n WHERE n.user_id = _user_id), '[]'::jsonb),
    'favorite_sold_notifications', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.favorite_sold_notifications n WHERE n.user_id = _user_id), '[]'::jsonb),
    'sales', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.listing_sales s WHERE s.buyer_id = _user_id OR s.seller_id = _user_id), '[]'::jsonb),
    'promotions', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.listing_promotions p WHERE p.user_id = _user_id OR p.granted_by = _user_id), '[]'::jsonb),
    'feedback', COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM public.feedback f WHERE f.user_id = _user_id), '[]'::jsonb),
    'vehicle_lookup_log', COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM public.vehicle_lookup_log v WHERE v.user_id = _user_id), '[]'::jsonb),
    'notification_preferences', (SELECT to_jsonb(n) FROM public.notification_preferences n WHERE n.user_id = _user_id),
    'push_subscriptions', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.push_subscriptions p WHERE p.user_id = _user_id), '[]'::jsonb),
    'system_messages', COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM public.system_messages m WHERE m.recipient_id = _user_id), '[]'::jsonb),
    'error_log', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM public.error_log e WHERE e.user_id = _user_id), '[]'::jsonb),
    'moderation', jsonb_build_object(
      'bans', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM public.user_bans b WHERE b.user_id = _user_id), '[]'::jsonb),
      'suspensions', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.user_suspensions s WHERE s.user_id = _user_id), '[]'::jsonb),
      'admin_actions', COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM public.admin_moderation_log l WHERE (l.target_type = 'user' AND l.target_id = _user_id::text) OR l.admin_id = _user_id), '[]'::jsonb)
    ),
    'account_deletion', (SELECT to_jsonb(a) FROM public.account_deletions a WHERE a.user_id = _user_id)
  );

  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'export_user_data', 'user', _user_id::text, COALESCE(_email, ''));
  RETURN _result;
END;
$$;

-- Material privacy changes are announced in the existing in-app inbox.
-- Skips orphaned profile rows with no matching auth.users row (recipient_id
-- has a FK to auth.users) — such a profile can't receive an in-app message
-- anyway, and would otherwise abort this whole migration.
INSERT INTO public.system_messages (recipient_id, body)
SELECT p.id,
  'Vi har oppdatert personvernerklæringen: klientbaserte måle-ID-er og lagring av rå søkefraser er fjernet, og slettefrister er tydeliggjort.'
FROM public.profiles p
WHERE p.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
