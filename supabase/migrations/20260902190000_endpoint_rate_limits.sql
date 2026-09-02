-- Generic per-IP rate limiter for the unauthenticated, no-Turnstile server
-- functions that hit paid or heavy resources without any request limit:
-- suggestCategoryForTitle (calls Mistral), lookupBusinessOrganization
-- (Brreg + a DB write), getAttributeValueSuggestions, getAttributeRangeBounds
-- and suggestKeywordsForListing (service-role DB aggregations). A single
-- reusable bucket/key table, same upsert-and-count shape as
-- feedback_rate_limits / product_event_rate_limits. See
-- docs/SIKKERHETSVURDERING.md M-9.

CREATE TABLE public.endpoint_rate_limits (
  bucket text NOT NULL CHECK (length(bucket) BETWEEN 1 AND 64),
  key_hash text NOT NULL CHECK (length(key_hash) = 64),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (bucket, key_hash)
);

ALTER TABLE public.endpoint_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.endpoint_rate_limits FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.check_endpoint_rate_limit(
  _bucket text,
  _key_hash text,
  _limit integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_attempts integer;
  window_interval interval;
BEGIN
  IF length(_key_hash) <> 64 OR _limit <= 0 OR _window_seconds <= 0 THEN
    RAISE EXCEPTION 'Invalid rate-limit input';
  END IF;
  window_interval := make_interval(secs => _window_seconds);

  INSERT INTO public.endpoint_rate_limits AS limits
    (bucket, key_hash, window_started_at, attempts)
  VALUES (_bucket, _key_hash, now(), 1)
  ON CONFLICT (bucket, key_hash) DO UPDATE SET
    attempts = CASE
      WHEN limits.window_started_at < now() - window_interval THEN 1
      ELSE limits.attempts + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at < now() - window_interval THEN now()
      ELSE limits.window_started_at
    END
  RETURNING attempts INTO current_attempts;

  DELETE FROM public.endpoint_rate_limits WHERE window_started_at < now() - interval '1 day';

  RETURN current_attempts <= _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.check_endpoint_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_endpoint_rate_limit(text, text, integer, integer)
  TO service_role;

-- Kill-switch for the Mistral fallback in suggestCategoryForTitle, so a
-- runaway cost can be stopped without a deploy.
ALTER TABLE public.site_settings
  ADD COLUMN category_suggestion_ai_enabled boolean NOT NULL DEFAULT true;
