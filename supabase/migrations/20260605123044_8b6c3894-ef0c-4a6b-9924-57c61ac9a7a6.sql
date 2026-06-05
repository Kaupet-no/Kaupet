
-- 1) listing_sales: restrict SELECT to participants
DROP POLICY IF EXISTS "Listing sales viewable by everyone" ON public.listing_sales;
CREATE POLICY "Participants can view listing sales"
  ON public.listing_sales
  FOR SELECT
  TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- 2) user_reviews: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Reviews viewable by everyone" ON public.user_reviews;
CREATE POLICY "Authenticated users can view reviews"
  ON public.user_reviews
  FOR SELECT
  TO authenticated
  USING (true);

-- 3) Revoke EXECUTE from anon/public on SECURITY DEFINER functions that are
--    only meant to run as triggers or via server-side admin code.
REVOKE EXECUTE ON FUNCTION public.listing_sales_validate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.listing_sales_sync_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_reviews_validate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_review_summary(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.conversations_enforce_block() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.messages_enforce_block() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.listings_match_saved_searches_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_push_for_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_push_for_saved_search() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_listing_to_saved_searches(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_old_listings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_expired_accounts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
