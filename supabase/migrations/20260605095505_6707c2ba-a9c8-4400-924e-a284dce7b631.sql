CREATE OR REPLACE FUNCTION public.listings_match_saved_searches_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.match_listing_to_saved_searches(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;