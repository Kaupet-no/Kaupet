-- Varsler motparten (selger) når en kjøper starter en ny chat, før noen
-- melding er sendt. Speiler dispatch_push_for_message()-mønsteret.

CREATE FUNCTION public.dispatch_push_for_conversation() RETURNS trigger
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
    body := jsonb_build_object('type', 'conversation_created', 'conversation_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('conversation_created', jsonb_build_object('conversation_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$$;

CREATE TRIGGER dispatch_push_after_conversation_insert
  AFTER INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_for_conversation();
