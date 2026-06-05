
-- 1. Restrict listing_images SELECT policy to active listings or own
DROP POLICY IF EXISTS "Listing images viewable by everyone" ON public.listing_images;
CREATE POLICY "Listing images viewable for active or owner"
ON public.listing_images
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = listing_images.listing_id
      AND (l.status = 'active' OR l.seller_id = auth.uid())
  )
);

-- 2. Drop raw owner SELECT policy on listing_views; owners use listing_stats RPC for aggregates
DROP POLICY IF EXISTS "Owners can read views for their listings" ON public.listing_views;

-- 3. Revoke EXECUTE on has_role from anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
