-- Active listings must either be free or have an explicit price.
-- Existing active listings without a price cannot be assigned a truthful value,
-- so archive them until the seller supplies one and republishes.
UPDATE public.listings
SET status = 'archived'
WHERE status = 'active'
  AND NOT is_free
  AND price_nok IS NULL;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_active_price_required
  CHECK (status <> 'active' OR is_free OR price_nok IS NOT NULL);
