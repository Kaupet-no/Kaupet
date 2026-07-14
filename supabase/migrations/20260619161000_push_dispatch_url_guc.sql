-- Push-dispatch triggers had the production URL hardcoded, so staging (which
-- runs its own DB) POSTed to production. Move the URL to a per-environment
-- DB GUC with a production fallback, so behaviour is unchanged unless a
-- different value is explicitly configured.
--
-- To point a non-production database at its own dispatch endpoint, run on
-- that database (e.g. via the Supabase SQL editor):
--   ALTER DATABASE postgres SET app.push_dispatch_url = '<env-specific-url>';
-- then reconnect (or run `SELECT pg_reload_conf();`) for it to take effect.

CREATE OR REPLACE FUNCTION public.dispatch_push_for_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _url text := COALESCE(current_setting('app.push_dispatch_url', true), 'https://kaupet.no/api/public/push/dispatch');
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
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
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
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
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('type', 'price_drop', 'price_drop_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('price_drop', jsonb_build_object('price_drop_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$$;
