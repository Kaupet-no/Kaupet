-- Motorsport het tidligere Bilsport og beholder sluggen «bilsport».
-- Filtre, kategoriflyt, ordstatistikk og organisasjonstilganger slettes via FK-cascade.
DO $$
DECLARE
  motorsport_id uuid;
BEGIN
  SELECT c.id INTO motorsport_id
  FROM public.categories c
  JOIN public.categories parent ON parent.id = c.parent_id
  WHERE c.slug = 'bilsport' AND parent.slug = 'bil-og-mc'
  FOR UPDATE OF c;

  IF motorsport_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.listings WHERE category_id = motorsport_id)
     OR EXISTS (SELECT 1 FROM public.wtb_listings WHERE category_id = motorsport_id) THEN
    RAISE EXCEPTION 'Kan ikke slette Motorsport: kategorien har annonser eller kjøpsønsker';
  END IF;

  IF EXISTS (SELECT 1 FROM public.categories WHERE parent_id = motorsport_id) THEN
    RAISE EXCEPTION 'Kan ikke slette Motorsport: kategorien har underkategorier';
  END IF;

  DELETE FROM public.categories WHERE id = motorsport_id;
END;
$$;
