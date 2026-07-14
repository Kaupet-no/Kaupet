-- The push_dispatch_settings_table migration (20260619163000) was never
-- actually applied to production: the app_settings table existed (created
-- separately), but dispatch_push_for_message/_saved_search/_price_drop kept
-- running the old current_setting()-based body, so no
-- X-Push-Dispatch-Secret header was ever sent and every dispatch request
-- was rejected with 401. Applied directly via the SQL editor on
-- 2026-06-23; this migration re-records the same (idempotent) definitions
-- so migration history matches what's actually running in production.

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
