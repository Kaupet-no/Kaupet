-- Prevent sellers from updating listings that have been admin-disabled.
-- The original policy had no WITH CHECK and no status guard in USING,
-- allowing owners to transition disabled → active directly via the client.
DROP POLICY IF EXISTS "Users can update their own listings" ON public.listings;

CREATE POLICY "Users can update their own listings" ON public.listings
  FOR UPDATE TO authenticated
  USING  (auth.uid() = seller_id AND status <> 'disabled')
  WITH CHECK (auth.uid() = seller_id AND status <> 'disabled');
