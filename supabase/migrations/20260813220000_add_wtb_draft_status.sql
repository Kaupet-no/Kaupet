-- Let wanted-to-buy listings use the same private draft lifecycle as sell
-- listings. Existing SELECT policies already expose non-active rows only to
-- their owner, so adding the status does not broaden read access.

ALTER TABLE public.wtb_listings
  DROP CONSTRAINT wtb_listings_status_check;

ALTER TABLE public.wtb_listings
  ADD CONSTRAINT wtb_listings_status_check
  CHECK (status = ANY (ARRAY['draft', 'active', 'fulfilled', 'expired', 'archived']));
