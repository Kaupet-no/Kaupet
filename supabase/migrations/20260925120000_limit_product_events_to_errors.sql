-- Bruksstatistikk skal kun fange feil, ikke atferd. Allowlisten krymper til
-- listing_publish_failed, og eksisterende atferdshendelser slettes i stedet
-- for å vente på 90-dagersfristen. Gammel app-kode som fortsatt sender
-- atferdshendelser får et avvist kall, som klienten allerede ignorerer.

DELETE FROM public.product_events;

ALTER TABLE public.product_events
  DROP CONSTRAINT IF EXISTS product_events_event_name_check;

ALTER TABLE public.product_events
  ADD CONSTRAINT product_events_event_name_check
  CHECK (event_name IN ('listing_publish_failed'));

CREATE OR REPLACE FUNCTION public.log_product_event_rate_limited(
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
    OR _event_name NOT IN ('listing_publish_failed')
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
