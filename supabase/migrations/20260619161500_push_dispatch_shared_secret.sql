-- The push-dispatch endpoint is public and unauthenticated, so it can be
-- called by anyone (duplicate notifications, wasted DB lookups). Send a
-- shared secret from the trigger functions as a header; dispatch.ts
-- verifies it with crypto.timingSafeEqual before doing any work.
--
-- Requires, on each database:
--   ALTER DATABASE postgres SET app.push_dispatch_secret = '<same value as
--   the PUSH_DISPATCH_SECRET worker secret for that environment>';
-- (then reconnect / SELECT pg_reload_conf();)
-- If unset, no header is sent and dispatch.ts will reject the request
-- (PUSH_DISPATCH_SECRET must be configured for dispatch to work at all).

CREATE OR REPLACE FUNCTION public.dispatch_push_for_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _url text := COALESCE(current_setting('app.push_dispatch_url', true), 'https://kaupet.no/api/public/push/dispatch');
  _secret text := current_setting('app.push_dispatch_secret', true);
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json') ||
      CASE WHEN _secret IS NOT NULL THEN jsonb_build_object('X-Push-Dispatch-Secret', _secret) ELSE '{}'::jsonb END,
    body := jsonb_build_object('type', 'message', 'message_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('message', jsonb_build_object('message_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_push_for_saved_search()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _url text := COALESCE(current_setting('app.push_dispatch_url', true), 'https://kaupet.no/api/public/push/dispatch');
  _secret text := current_setting('app.push_dispatch_secret', true);
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json') ||
      CASE WHEN _secret IS NOT NULL THEN jsonb_build_object('X-Push-Dispatch-Secret', _secret) ELSE '{}'::jsonb END,
    body := jsonb_build_object('type', 'saved_search', 'notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('saved_search', jsonb_build_object('notification_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_push_for_price_drop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text := COALESCE(current_setting('app.push_dispatch_url', true), 'https://kaupet.no/api/public/push/dispatch');
  _secret text := current_setting('app.push_dispatch_secret', true);
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json') ||
      CASE WHEN _secret IS NOT NULL THEN jsonb_build_object('X-Push-Dispatch-Secret', _secret) ELSE '{}'::jsonb END,
    body := jsonb_build_object('type', 'price_drop', 'price_drop_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('price_drop', jsonb_build_object('price_drop_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$$;
