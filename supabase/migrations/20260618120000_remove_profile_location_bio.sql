-- Profilsiden viser ikke lenger fritekstfeltene "sted" og "om meg".
-- Statistikk (medlem siden, antall annonser, salg, vurdering) erstatter dem.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS bio;
