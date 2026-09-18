-- Mål i centimeter (bredde/høyde/dybde/lengde/rammestørrelse/skilengde) er i
-- dag påkrevd på flere kategorier. En privatperson som skal bli kvitt f.eks.
-- en sofa har sjelden målbånd for hånden, og feltene skaper frafall på siste
-- steg før publisering. Feltene beholdes — både for selgere som vil fylle
-- dem ut og som søkefilter for kjøpere — de skal bare ikke lenger blokkere
-- publisering.
UPDATE public.category_filters
SET is_optional = true
WHERE unit = 'cm'
  AND is_optional = false;
