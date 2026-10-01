-- Øk bildegrensen til 100. Behold stivalidering, eierskapssjekk,
-- service_role-støtte, advisory lock og rettigheter fra siste definisjon.
-- Deploy denne migrasjonen før appkoden med MAX_LISTING_IMAGES = 100.

CREATE OR REPLACE FUNCTION public.validate_listing_image_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  image_count integer;
BEGIN
  IF NEW.storage_path !~* (
       '^' || NEW.listing_id::text ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl)$'
     )
  THEN
    RAISE EXCEPTION 'invalid_listing_image';
  END IF;

  IF auth.role() <> 'service_role' AND NOT EXISTS (
       SELECT 1
       FROM public.listings l
       WHERE l.id = NEW.listing_id
         AND (
           (l.organization_id IS NULL AND l.seller_id = auth.uid())
           OR (
             l.organization_id IS NOT NULL
             AND public.can_update_organization_listing(
               l.organization_id,
               l.organization_location_id,
               l.seller_id,
               l.status,
               l.category_id,
               auth.uid()
             )
           )
         )
     )
  THEN
    RAISE EXCEPTION 'invalid_listing_image';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.listing_id::text, 1));
    SELECT count(*) INTO image_count
    FROM public.listing_images
    WHERE listing_id = NEW.listing_id;
    IF image_count >= 100 THEN
      RAISE EXCEPTION 'listing_image_limit';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_listing_image_reference()
  FROM PUBLIC, anon, authenticated, service_role;

