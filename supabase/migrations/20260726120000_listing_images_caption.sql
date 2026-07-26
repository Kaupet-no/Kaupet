-- Bildetekst per bilde, vist i bildekarrusellen på annonsesiden.
ALTER TABLE public.listing_images ADD COLUMN caption TEXT;
