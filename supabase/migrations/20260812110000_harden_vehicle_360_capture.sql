-- Harden the bearer-token based 360 capture handoff.
-- Tokens are short-lived capabilities, and upload quotas are consumed
-- atomically in Postgres so limits survive Worker restarts and isolates.

UPDATE public.listing_360_capture_sessions
SET expires_at = now() - interval '1 second'
WHERE expires_at IS NULL;

ALTER TABLE public.listing_360_capture_sessions
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 minutes'),
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.listing_360_capture_sessions
  ADD CONSTRAINT listing_360_capture_sessions_token_length
  CHECK (length(token) BETWEEN 32 AND 128);

CREATE INDEX listing_360_capture_sessions_active_token_idx
  ON public.listing_360_capture_sessions (token, expires_at)
  WHERE used_at IS NULL;

CREATE TABLE public.listing_360_upload_rate_limits (
  scope text NOT NULL CHECK (scope IN ('token', 'ip')),
  key_hash text NOT NULL CHECK (length(key_hash) = 64),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (scope, key_hash)
);

ALTER TABLE public.listing_360_upload_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.listing_360_upload_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_vehicle_360_upload_slot(
  _token text,
  _ip_hash text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_listing_id uuid;
  token_attempts integer;
  ip_attempts integer;
  token_hash text := encode(sha256(convert_to(_token, 'UTF8')), 'hex');
BEGIN
  IF _token IS NULL OR length(_token) NOT BETWEEN 32 AND 128 THEN
    RETURN NULL;
  END IF;
  IF _ip_hash IS NULL OR length(_ip_hash) <> 64 THEN
    RETURN NULL;
  END IF;

  SELECT listing_id
  INTO session_listing_id
  FROM public.listing_360_capture_sessions
  WHERE token = _token
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF session_listing_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.listing_360_upload_rate_limits AS limits
    (scope, key_hash, window_started_at, attempts)
  VALUES ('token', token_hash, now(), 1)
  ON CONFLICT (scope, key_hash) DO UPDATE SET
    attempts = CASE
      WHEN limits.window_started_at < now() - interval '10 minutes' THEN 1
      ELSE limits.attempts + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at < now() - interval '10 minutes' THEN now()
      ELSE limits.window_started_at
    END
  RETURNING attempts INTO token_attempts;

  INSERT INTO public.listing_360_upload_rate_limits AS limits
    (scope, key_hash, window_started_at, attempts)
  VALUES ('ip', _ip_hash, now(), 1)
  ON CONFLICT (scope, key_hash) DO UPDATE SET
    attempts = CASE
      WHEN limits.window_started_at < now() - interval '10 minutes' THEN 1
      ELSE limits.attempts + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at < now() - interval '10 minutes' THEN now()
      ELSE limits.window_started_at
    END
  RETURNING attempts INTO ip_attempts;

  -- 36 frames plus retries/replacements, while still bounding abuse.
  IF token_attempts > 80 OR ip_attempts > 160 THEN
    RETURN NULL;
  END IF;

  -- Opportunistic cleanup keeps the tiny quota table bounded without a cron.
  DELETE FROM public.listing_360_upload_rate_limits
  WHERE window_started_at < now() - interval '1 day';

  RETURN session_listing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_vehicle_360_upload_slot(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_vehicle_360_upload_slot(text, text) TO service_role;

