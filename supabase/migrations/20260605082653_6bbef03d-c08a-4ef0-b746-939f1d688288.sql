-- 1) Fix conversations INSERT policy: require seller_id to match the listing's actual seller
DROP POLICY IF EXISTS "Buyers can start conversations" ON public.conversations;
CREATE POLICY "Buyers can start conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = buyer_id
  AND auth.uid() <> seller_id
  AND EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = conversations.listing_id
      AND l.seller_id = conversations.seller_id
      AND l.status = 'active'
  )
);

-- 2) Restrict Realtime channel subscriptions to participants only.
-- realtime.messages governs who can receive broadcast/postgres_changes payloads.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read own realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated can read own realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Per-user notifications channel: notifs:<user_id>
  (realtime.topic() = 'notifs:' || auth.uid()::text)
  OR
  -- Conversation channel: conv:<conversation_id> — must be a participant
  (
    realtime.topic() LIKE 'conv:%'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = substring(realtime.topic() from 6)
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  )
);

-- 3) Harden push dispatch triggers: send ONLY the trigger id so the
-- endpoint must re-derive recipient + body from the database. This makes
-- an unauthenticated POST useless for spoofing (unknown ids do nothing,
-- known ids only redeliver legitimate notifications to legitimate users).
CREATE OR REPLACE FUNCTION public.dispatch_push_for_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _url text := 'https://kaupet.no/api/public/push/dispatch';
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('type', 'message', 'message_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
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
  _url text := 'https://kaupet.no/api/public/push/dispatch';
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('type', 'saved_search', 'notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;