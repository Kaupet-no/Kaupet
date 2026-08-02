-- listing_360_frames' SELECT policy was left as USING (true) when the table
-- was created (20260725110000_vehicle_360_view.sql), unlike listing_images'
-- equivalent policy which was tightened to active-or-owner in
-- 20260605075809_*.sql. This let a draft/disabled listing's 360-frame
-- storage_path rows be read via a direct table query by anyone — not the
-- image bytes themselves (the storage bucket's own SELECT policy already
-- checks active-or-owner correctly), but still an inconsistency with the
-- equivalent listing_images policy. Found via RLS integration test coverage
-- (see docs/RLS-TEST-COVERAGE.md, finding 6).
DROP POLICY IF EXISTS "Listing 360 frames viewable by everyone" ON public.listing_360_frames;
CREATE POLICY "Listing 360 frames viewable for active or owner"
  ON public.listing_360_frames
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_360_frames.listing_id
        AND (l.status = 'active' OR l.seller_id = auth.uid())
    )
  );
