-- Egen annonse kan ikke legges i favoritter: det blåser opp «Favoritter»-
-- telleren selgeren ser, og egne annonser hører hjemme i Mine annonser.
-- Annonsesiden skjuler allerede knappen for eieren; kortene i søk vet ikke
-- hvem selgeren er, så regelen håndheves her for alle innganger.
DROP POLICY "Users can manage their own favorites" ON public.favorites;

CREATE POLICY "Users can manage their own favorites" ON public.favorites
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
  );

DELETE FROM public.favorites f
USING public.listings l
WHERE l.id = f.listing_id AND l.seller_id = f.user_id;
