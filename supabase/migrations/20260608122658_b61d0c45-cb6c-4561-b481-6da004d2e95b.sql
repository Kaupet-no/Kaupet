
-- 1) New column for push preference
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS web_push_price_drops boolean NOT NULL DEFAULT true;

-- 2) New table: favorite_price_drops
CREATE TABLE public.favorite_price_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  old_price_nok integer NOT NULL,
  new_price_nok integer NOT NULL,
  drop_pct numeric(5,2) NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id, old_price_nok)
);

CREATE INDEX favorite_price_drops_user_unread_idx
  ON public.favorite_price_drops (user_id, read_at, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.favorite_price_drops TO authenticated;
GRANT ALL ON public.favorite_price_drops TO service_role;

ALTER TABLE public.favorite_price_drops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own price drops"
  ON public.favorite_price_drops FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own price drops"
  ON public.favorite_price_drops FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own price drops"
  ON public.favorite_price_drops FOR DELETE
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.favorite_price_drops;

-- 3) Trigger: emit price-drop notifications when listing price drops > 5%
CREATE OR REPLACE FUNCTION public.listings_emit_price_drops()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pct numeric(5,2);
BEGIN
  IF NEW.price_nok IS NULL OR OLD.price_nok IS NULL THEN RETURN NEW; END IF;
  IF NEW.price_nok >= OLD.price_nok THEN RETURN NEW; END IF;
  IF OLD.price_nok <= 0 THEN RETURN NEW; END IF;
  IF NEW.is_free THEN RETURN NEW; END IF;
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;

  _pct := ROUND(((OLD.price_nok - NEW.price_nok) * 100.0 / OLD.price_nok)::numeric, 2);
  IF _pct <= 5 THEN RETURN NEW; END IF;

  INSERT INTO public.favorite_price_drops
    (user_id, listing_id, old_price_nok, new_price_nok, drop_pct)
  SELECT f.user_id, NEW.id, OLD.price_nok, NEW.price_nok, _pct
  FROM public.favorites f
  WHERE f.listing_id = NEW.id
    AND f.user_id <> NEW.seller_id
  ON CONFLICT (user_id, listing_id, old_price_nok) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listings_emit_price_drops
AFTER UPDATE OF price_nok ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.listings_emit_price_drops();

-- 4) Trigger: dispatch web push on new price drop
CREATE OR REPLACE FUNCTION public.dispatch_push_for_price_drop()
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
    body := jsonb_build_object('type', 'price_drop', 'price_drop_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER dispatch_push_after_price_drop_insert
AFTER INSERT ON public.favorite_price_drops
FOR EACH ROW
EXECUTE FUNCTION public.dispatch_push_for_price_drop();
