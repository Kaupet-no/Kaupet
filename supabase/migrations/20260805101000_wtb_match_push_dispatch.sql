-- Fase 3 av ØK-matching: send push/e-post til ØK-brukeren når et
-- wtb_match_notifications-varsel opprettes, via samme pg_net-utsendelse som
-- dispatch_push_for_saved_search bruker mot /api/public/push/dispatch.
CREATE OR REPLACE FUNCTION public.dispatch_push_for_wtb_match() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
    body := jsonb_build_object('type', 'wtb_match', 'notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('wtb_match', jsonb_build_object('notification_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$$;

CREATE TRIGGER dispatch_push_after_wtb_match_notification_insert
    AFTER INSERT ON public.wtb_match_notifications
    FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_for_wtb_match();
