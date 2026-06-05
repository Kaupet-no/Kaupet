-- Add 'expired' status
ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'expired';

-- Add expires_at column
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Trigger function: when a listing becomes active, set published_at and expires_at
CREATE OR REPLACE FUNCTION public.listings_set_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' THEN
      NEW.published_at := now();
      NEW.expires_at := now() + interval '30 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_set_expiry_trigger ON public.listings;
CREATE TRIGGER listings_set_expiry_trigger
BEFORE INSERT OR UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_set_expiry();

-- Backfill existing active listings
UPDATE public.listings
SET published_at = COALESCE(published_at, created_at),
    expires_at = COALESCE(expires_at, COALESCE(published_at, created_at) + interval '30 days')
WHERE status = 'active' AND expires_at IS NULL;

-- Expire function (cron job target)
CREATE OR REPLACE FUNCTION public.expire_old_listings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  WITH updated AS (
    UPDATE public.listings
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM updated;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_old_listings() TO service_role;