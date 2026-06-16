DROP FUNCTION public.admin_search_listings(text, text, integer);

CREATE FUNCTION public.admin_search_listings(_query text DEFAULT ''::text, _status text DEFAULT NULL::text, _limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, kaupet_code char(8), title text, status listing_status, seller_id uuid, seller_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT l.id, l.kaupet_code, l.title, l.status, l.seller_id, p.display_name, l.created_at
  FROM public.listings l
  LEFT JOIN public.profiles p ON p.id = l.seller_id
  WHERE (_query = '' OR l.title ILIKE '%' || _query || '%' OR l.kaupet_code = _query)
    AND (_status IS NULL OR l.status::text = _status)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $function$;