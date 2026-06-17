GRANT INSERT ON public.listing_views TO anon, authenticated;
GRANT SELECT ON public.listing_views TO authenticated;
GRANT ALL ON public.listing_views TO service_role;