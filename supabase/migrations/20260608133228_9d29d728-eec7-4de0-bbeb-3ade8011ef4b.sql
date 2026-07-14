
CREATE POLICY "Buyers can view their purchased listings"
ON public.listings FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.listing_sales s
  WHERE s.listing_id = listings.id AND s.buyer_id = auth.uid()
));

CREATE POLICY "Buyers can view images of purchased listings"
ON public.listing_images FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.listing_sales s
  WHERE s.listing_id = listing_images.listing_id AND s.buyer_id = auth.uid()
));
