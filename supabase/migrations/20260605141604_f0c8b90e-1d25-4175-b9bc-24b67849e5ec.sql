CREATE OR REPLACE FUNCTION public.my_listing_counts()
RETURNS TABLE(listing_id uuid, view_count bigint, favorite_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id,
    (SELECT count(*) FROM public.listing_views v WHERE v.listing_id = l.id),
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = l.id)
  FROM public.listings l
  WHERE l.seller_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_listing_counts() TO authenticated;