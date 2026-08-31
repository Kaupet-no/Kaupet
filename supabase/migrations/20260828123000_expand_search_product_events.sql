-- Extend the first-party search funnel without storing search text, location
-- or stable user identifiers. Deploy this migration before the app code that
-- emits the new event names.

ALTER TABLE public.product_events
  DROP CONSTRAINT IF EXISTS product_events_event_name_check;

ALTER TABLE public.product_events
  ADD CONSTRAINT product_events_event_name_check CHECK (event_name IN (
    'auth_started', 'auth_completed',
    'search_opened', 'search_submitted', 'search_zero_results',
    'search_page_viewed', 'search_filter_opened', 'search_filter_applied',
    'search_filter_cancelled', 'search_suggestion_selected',
    'search_zero_results_recovered', 'search_map_opened', 'search_saved',
    'search_result_opened',
    'listing_opened', 'contact_started', 'favorite_toggled',
    'listing_creation_started', 'listing_creation_step_completed',
    'listing_published', 'onboarding_completed'
  ));

CREATE OR REPLACE FUNCTION public.log_product_event_rate_limited(
  _key_hash text,
  _session_id uuid,
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
    INSERT INTO public.product_events
      (session_id, event_name, platform, path, properties)
    VALUES
      (_session_id, _event_name, _platform, _path, _properties);
  END IF;

  DELETE FROM public.product_events WHERE created_at < now() - interval '90 days';
  DELETE FROM public.product_event_rate_limits
    WHERE window_started_at < now() - interval '1 day';
END;
$$;

REVOKE ALL ON FUNCTION public.log_product_event_rate_limited(
  text, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_product_event_rate_limited(
  text, uuid, text, text, text, jsonb
) TO service_role;
