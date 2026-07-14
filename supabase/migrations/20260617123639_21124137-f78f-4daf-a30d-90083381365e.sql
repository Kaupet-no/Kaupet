CREATE OR REPLACE FUNCTION public.log_listing_view(_listing_id uuid, _visitor_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _visitor_key IS NULL OR length(trim(_visitor_key)) = 0 THEN
    RAISE EXCEPTION 'visitor_key er påkrevd';
  END IF;

  INSERT INTO public.listing_views (listing_id, visitor_key, user_id)
  SELECT _listing_id, _visitor_key, auth.uid()
  FROM public.listings l
  WHERE l.id = _listing_id AND l.status = 'active'
  ON CONFLICT (listing_id, visitor_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.log_listing_view(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_listing_view(uuid, text) TO anon, authenticated;

REVOKE SELECT ON public.listing_views FROM authenticated;
REVOKE INSERT ON public.listing_views FROM anon, authenticated;