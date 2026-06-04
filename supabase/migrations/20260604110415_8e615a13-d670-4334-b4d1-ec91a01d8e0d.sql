
DROP POLICY "Anyone can log a listing view" ON public.listing_views;

CREATE POLICY "Anyone can log a view for an active listing"
  ON public.listing_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = listing_views.listing_id AND l.status = 'active'
  ));
