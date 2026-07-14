
REVOKE EXECUTE ON FUNCTION public.match_listing_to_saved_searches(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.listings_match_saved_searches_trigger() FROM PUBLIC, anon, authenticated;
