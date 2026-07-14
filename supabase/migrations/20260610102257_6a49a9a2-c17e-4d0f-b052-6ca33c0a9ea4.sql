
-- 1. Tighten listing_sales INSERT to verify caller matches the conversation
DROP POLICY IF EXISTS "Seller can confirm sale" ON public.listing_sales;
CREATE POLICY "Seller can confirm sale" ON public.listing_sales
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.seller_id = listing_sales.seller_id
        AND c.buyer_id = listing_sales.buyer_id
        AND c.listing_id = listing_sales.listing_id
    )
  );

-- 2. Hide deleted profiles from anonymous visitors; owner can still see own row
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT TO public
  USING (deleted_at IS NULL OR auth.uid() = id);

-- 3. Make user reviews publicly readable (they are reputation data)
DROP POLICY IF EXISTS "Authenticated users can view reviews" ON public.user_reviews;
CREATE POLICY "Reviews are viewable by everyone" ON public.user_reviews
  FOR SELECT TO public
  USING (true);

GRANT SELECT ON public.user_reviews TO anon;
