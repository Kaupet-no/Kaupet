-- Distributed per-user write limits for authenticated abuse-sensitive actions.
-- The bucket/key state stays in Postgres so Cloudflare Worker isolates cannot
-- bypass the limit by landing on a different isolate.

CREATE FUNCTION public.check_user_rate_limit(
  _bucket text,
  _user_id uuid,
  _limit integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR length(_bucket) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'Invalid user rate-limit input';
  END IF;

  RETURN public.check_endpoint_rate_limit(
    _bucket,
    encode(sha256(convert_to(_user_id::text, 'UTF8')), 'hex'),
    _limit,
    _window_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_user_rate_limit(text, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_rate_limit(text, uuid, integer, integer)
  TO service_role;

-- Reports remain callable through the existing authenticated RPC boundary;
-- enforce the limit there so a client cannot bypass a Worker server function.
CREATE OR REPLACE FUNCTION public.submit_listing_report(
  _listing_id uuid,
  _reason text,
  _comment text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.check_user_rate_limit('report_submission', auth.uid(), 10, 3600) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  INSERT INTO public.reports(listing_id, reporter_id, reason, comment)
  VALUES (_listing_id, auth.uid(), _reason, _comment);
END $$;

CREATE OR REPLACE FUNCTION public.submit_user_report(
  _reported_user_id uuid,
  _reason text,
  _comment text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() = _reported_user_id THEN RAISE EXCEPTION 'Cannot report yourself'; END IF;
  IF NOT public.check_user_rate_limit('report_submission', auth.uid(), 10, 3600) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  INSERT INTO public.reports(reporter_id, reported_user_id, reason, comment)
  VALUES (auth.uid(), _reported_user_id, _reason, _comment);
END $$;

REVOKE ALL ON FUNCTION public.submit_listing_report(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_listing_report(uuid, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.submit_user_report(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_user_report(uuid, text, text)
  TO authenticated;
