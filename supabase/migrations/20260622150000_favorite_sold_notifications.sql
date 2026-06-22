-- Push notifications when a favorited listing is marked as sold, mirroring
-- the favorite_price_drops pattern (20260608122658, 20260619163000).

CREATE TABLE public.favorite_sold_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);
CREATE INDEX favorite_sold_notifications_user_unread_idx
  ON public.favorite_sold_notifications (user_id, read_at, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.favorite_sold_notifications TO authenticated;
GRANT ALL ON public.favorite_sold_notifications TO service_role;
ALTER TABLE public.favorite_sold_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own sold notifications"
  ON public.favorite_sold_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own sold notifications"
  ON public.favorite_sold_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own sold notifications"
  ON public.favorite_sold_notifications FOR DELETE USING (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.favorite_sold_notifications;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS web_push_sold boolean NOT NULL DEFAULT true;

-- Detector: fires when a listing transitions into 'sold', fans out one row
-- per user who has favorited it (excluding the seller).
CREATE OR REPLACE FUNCTION public.listings_emit_sold_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'sold' OR NEW.status <> 'sold' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.favorite_sold_notifications (user_id, listing_id)
  SELECT f.user_id, NEW.id
  FROM public.favorites f
  WHERE f.listing_id = NEW.id AND f.user_id <> NEW.seller_id
  ON CONFLICT (user_id, listing_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listings_emit_sold_notifications
AFTER UPDATE OF status ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.listings_emit_sold_notifications();

-- Dispatcher: same pg_net POST pattern as dispatch_push_for_price_drop.
CREATE OR REPLACE FUNCTION public.dispatch_push_for_sold()
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
    body := jsonb_build_object('type', 'sold', 'sold_notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('sold', jsonb_build_object('sold_notification_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$$;

CREATE TRIGGER dispatch_push_after_sold_notification_insert
AFTER INSERT ON public.favorite_sold_notifications
FOR EACH ROW
EXECUTE FUNCTION public.dispatch_push_for_sold();
