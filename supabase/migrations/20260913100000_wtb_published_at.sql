ALTER TABLE public.wtb_listings
  ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

UPDATE public.wtb_listings
SET published_at = COALESCE(updated_at, created_at)
WHERE status <> 'draft' AND published_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_wtb_published_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.published_at IS NULL
  THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wtb_listings_published_at ON public.wtb_listings;
CREATE TRIGGER wtb_listings_published_at
  BEFORE INSERT OR UPDATE OF status ON public.wtb_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_wtb_published_at();
