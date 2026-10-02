CREATE FUNCTION public.archive_moderated_wtb_listings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_user_banned(NEW.user_id) OR public.is_user_suspended(NEW.user_id) THEN
    UPDATE public.wtb_listings SET status = 'archived'
    WHERE user_id = NEW.user_id AND status = 'active';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_moderated_wtb_listings()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER user_bans_archive_wtb_listings_trg
  AFTER INSERT OR UPDATE ON public.user_bans
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_moderated_wtb_listings();

CREATE TRIGGER user_suspensions_archive_wtb_listings_trg
  AFTER INSERT OR UPDATE OF expires_at ON public.user_suspensions
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_moderated_wtb_listings();
