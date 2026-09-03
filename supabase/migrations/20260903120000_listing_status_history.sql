-- Preserve listing status transitions so business dashboards can show real history.
CREATE TABLE public.listing_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  status public.listing_status NOT NULL,
  changed_at timestamptz NOT NULL
);

CREATE INDEX listing_status_history_listing_changed_idx
  ON public.listing_status_history (listing_id, changed_at DESC);

ALTER TABLE public.listing_status_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.listing_status_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.listing_status_history TO service_role;

INSERT INTO public.listing_status_history (listing_id, status, changed_at)
SELECT id, status, COALESCE(published_at, created_at)
FROM public.listings;

CREATE OR REPLACE FUNCTION public.record_listing_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.listing_status_history (listing_id, status, changed_at)
    VALUES (NEW.id, NEW.status, COALESCE(NEW.published_at, NEW.created_at));
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.listing_status_history (listing_id, status, changed_at)
    VALUES (NEW.id, NEW.status, now());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_listing_status_history() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER listings_record_status_history
  AFTER INSERT OR UPDATE OF status ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.record_listing_status_history();
