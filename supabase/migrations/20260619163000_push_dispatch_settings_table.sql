-- Supabase's managed `postgres` role is not a superuser, so ALTER DATABASE
-- ... SET on a custom GUC (the approach used in the previous two
-- migrations) is rejected with "permission denied to set parameter".
-- Replace current_setting()-based config with a small settings table that
-- only service_role (and SECURITY DEFINER functions owned by the table
-- owner) can read/write — no elevated DB privileges required, and values
-- can be set/rotated straight through the service-role REST API.

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated — only service_role (which bypasses
-- RLS) and the table owner (via SECURITY DEFINER functions below) can
-- touch this table.
GRANT ALL ON public.app_settings TO service_role;

CREATE TRIGGER app_settings_set_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.dispatch_push_for_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _url text := COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_url'),
    'https://kaupet.no/api/public/push/dispatch'
  );
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_secret');
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
  _url text := COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_url'),
    'https://kaupet.no/api/public/push/dispatch'
  );
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_secret');
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
  _url text := COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_url'),
    'https://kaupet.no/api/public/push/dispatch'
  );
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_secret');
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
