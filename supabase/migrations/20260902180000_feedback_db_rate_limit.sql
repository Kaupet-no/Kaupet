-- submitFeedback/submitCategorySuggestion throttled via an in-memory Map
-- keyed by user/IP. On Cloudflare Workers each isolate has its own memory
-- and isolates are recycled constantly, so an attacker almost always lands
-- on a fresh one — the limit was close to a no-op. Move it to the database,
-- same pattern as log_product_event_rate_limited /
-- log_listing_view_rate_limited. See docs/SIKKERHETSVURDERING.md M-8.

CREATE TABLE public.feedback_rate_limits (
  key_hash text PRIMARY KEY CHECK (length(key_hash) = 64),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

ALTER TABLE public.feedback_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.feedback_rate_limits FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.submit_feedback_rate_limited(
  _key_hash text,
  _type text,
  _message text,
  _user_id uuid,
  _page_url text DEFAULT NULL,
  _category_name text DEFAULT NULL,
  _category_description text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_attempts integer;
BEGIN
  IF length(_key_hash) <> 64 THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;

  INSERT INTO public.feedback_rate_limits AS limits
    (key_hash, window_started_at, attempts)
  VALUES (_key_hash, now(), 1)
  ON CONFLICT (key_hash) DO UPDATE SET
    attempts = CASE
      WHEN limits.window_started_at < now() - interval '1 hour' THEN 1
      ELSE limits.attempts + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at < now() - interval '1 hour' THEN now()
      ELSE limits.window_started_at
    END
  RETURNING attempts INTO current_attempts;

  IF current_attempts > 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.feedback
    (type, message, user_id, page_url, category_name, category_description)
  VALUES
    (_type, _message, _user_id, _page_url, _category_name, _category_description);

  DELETE FROM public.feedback_rate_limits WHERE window_started_at < now() - interval '1 day';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_feedback_rate_limited(
  text, text, text, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback_rate_limited(
  text, text, text, uuid, text, text, text
) TO service_role;
