
CREATE TABLE public.listing_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  visitor_key text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX listing_views_listing_id_idx ON public.listing_views(listing_id);
CREATE INDEX listing_views_listing_visitor_idx ON public.listing_views(listing_id, visitor_key);

GRANT SELECT, INSERT ON public.listing_views TO authenticated;
GRANT SELECT, INSERT ON public.listing_views TO anon;
GRANT ALL ON public.listing_views TO service_role;

ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log a listing view"
  ON public.listing_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Owners can read views for their listings"
  ON public.listing_views FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = listing_views.listing_id AND l.seller_id = auth.uid()
  ));
