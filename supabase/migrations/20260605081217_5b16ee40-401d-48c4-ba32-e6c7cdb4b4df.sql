
-- =========================================
-- push_subscriptions
-- =========================================
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =========================================
-- notification_preferences
-- =========================================
CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY,
  web_push_messages boolean NOT NULL DEFAULT true,
  web_push_saved_searches boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notification preferences"
  ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notification preferences"
  ON public.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own notification preferences"
  ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- Dispatch trigger: new chat messages
-- =========================================
CREATE OR REPLACE FUNCTION public.dispatch_push_for_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recipient uuid;
  _url text := 'https://kaupet.no/api/public/push/dispatch';
BEGIN
  SELECT CASE WHEN c.buyer_id = NEW.sender_id THEN c.seller_id ELSE c.buyer_id END
    INTO _recipient
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF _recipient IS NULL OR _recipient = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'type', 'message',
      'user_id', _recipient,
      'conversation_id', NEW.conversation_id,
      'message_id', NEW.id,
      'body', NEW.body
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER dispatch_push_after_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_for_message();

-- =========================================
-- Dispatch trigger: new saved-search matches
-- =========================================
CREATE OR REPLACE FUNCTION public.dispatch_push_for_saved_search()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text := 'https://kaupet.no/api/public/push/dispatch';
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'type', 'saved_search',
      'user_id', NEW.user_id,
      'saved_search_id', NEW.saved_search_id,
      'listing_id', NEW.listing_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER dispatch_push_after_saved_search_notification_insert
  AFTER INSERT ON public.saved_search_notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_for_saved_search();
