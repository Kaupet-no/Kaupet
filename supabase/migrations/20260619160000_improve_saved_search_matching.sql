-- Improvements to "Lagre søk": match on listing updates (not just new/activated
-- listings), expose per-search unread counts, drop unused column, and log
-- (instead of silently swallowing) push dispatch failures.

-- 1) Re-match saved searches when a relevant field changes on an already-active
--    listing (price, free-flag, category, condition) — not just on insert/activation.
CREATE OR REPLACE FUNCTION public.listings_match_saved_searches_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (
    TG_OP = 'INSERT'
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.price_nok IS DISTINCT FROM NEW.price_nok
    OR OLD.is_free IS DISTINCT FROM NEW.is_free
    OR OLD.category_id IS DISTINCT FROM NEW.category_id
    OR OLD.condition IS DISTINCT FROM NEW.condition
  ) THEN
    PERFORM public.match_listing_to_saved_searches(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_match_saved_searches ON public.listings;
CREATE TRIGGER listings_match_saved_searches
AFTER INSERT OR UPDATE OF status, price_nok, is_free, category_id, condition ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_match_saved_searches_trigger();

-- 2) RPC: unread saved-search notification counts per search, for the caller only.
CREATE OR REPLACE FUNCTION public.saved_search_unread_counts()
RETURNS TABLE (saved_search_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT n.saved_search_id, count(*) AS unread_count
  FROM public.saved_search_notifications n
  WHERE n.user_id = auth.uid()
    AND n.read_at IS NULL
  GROUP BY n.saved_search_id;
$$;

GRANT EXECUTE ON FUNCTION public.saved_search_unread_counts() TO authenticated;

-- 3) Drop unused column (matching is trigger-based, never polled).
ALTER TABLE public.saved_searches DROP COLUMN IF EXISTS last_checked_at;

-- 4) Log push dispatch failures instead of swallowing them silently.
CREATE TABLE public.push_dispatch_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  payload jsonb NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.push_dispatch_failures TO service_role;
ALTER TABLE public.push_dispatch_failures ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon — only service_role (via SECURITY DEFINER
-- trigger functions) reads/writes this table.

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
  _url text := 'https://kaupet.no/api/public/push/dispatch';
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
  _url text := 'https://kaupet.no/api/public/push/dispatch';
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
