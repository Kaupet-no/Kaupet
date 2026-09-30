-- Keep the existing insert-time block; add the same check when a listing is republished.
CREATE OR REPLACE FUNCTION public.listings_enforce_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (public.is_user_banned(NEW.seller_id) OR public.is_user_suspended(NEW.seller_id))
     AND (
     TG_OP = 'INSERT'
       OR (NEW.status = 'active' AND OLD.status IS DISTINCT FROM NEW.status
         -- Preserve admin_enable_listing's authenticated admin-only override.
         AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin')))
     ) THEN
    RAISE EXCEPTION 'Brukeren kan ikke publisere annonser'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.listings_enforce_moderation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER listings_enforce_moderation_on_publish_trg
  BEFORE UPDATE OF status ON public.listings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'active')
  EXECUTE FUNCTION public.listings_enforce_moderation();

-- WTB listings publish as active on insert and have no separate admin enable RPC.
CREATE FUNCTION public.wtb_listings_enforce_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND (public.is_user_banned(NEW.user_id) OR public.is_user_suspended(NEW.user_id)) THEN
    RAISE EXCEPTION 'Brukeren kan ikke publisere kjøpsønsker'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.wtb_listings_enforce_moderation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER wtb_listings_enforce_moderation_trg
  BEFORE INSERT OR UPDATE OF status ON public.wtb_listings
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.wtb_listings_enforce_moderation();
