
-- 1. Tighten reports: admin can read, fix grants
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
CREATE POLICY "Admins can view reports" ON public.reports
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update reports" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Hide visitor_key from listing owners (column-level)
REVOKE SELECT ON public.listing_views FROM authenticated, anon;
GRANT SELECT (id, listing_id, user_id, created_at) ON public.listing_views TO authenticated;
GRANT INSERT ON public.listing_views TO anon, authenticated;
GRANT ALL ON public.listing_views TO service_role;

-- 3. Tighten storage SELECT on listing-images: only images for active or owned listings
DROP POLICY IF EXISTS "Listing images are publicly readable" ON storage.objects;
CREATE POLICY "Listing images readable for active or owned listings"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'listing-images'
    AND (
      EXISTS (
        SELECT 1 FROM public.listing_images li
        JOIN public.listings l ON l.id = li.listing_id
        WHERE li.storage_path = storage.objects.name
          AND (l.status = 'active' OR l.seller_id = auth.uid())
      )
    )
  );

-- 4. Lock down SECURITY DEFINER function execute privileges
-- User-callable (authenticated only)
REVOKE EXECUTE ON FUNCTION public.request_account_deletion(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.listing_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_views_timeseries(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_popular_categories() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_popular_listings(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_overview_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_find_users_by_email(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_user_deletion_pending(uuid) FROM PUBLIC, anon;

-- Internal-only — revoke from everyone except service_role
REVOKE EXECUTE ON FUNCTION public.purge_expired_accounts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_listing_to_saved_searches(uuid) FROM PUBLIC, anon, authenticated;
