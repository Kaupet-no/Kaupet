-- Full admin-CRUD for kjøretøymerker/-modeller (opprette, omdøpe, slette),
-- i tillegg til den eksisterende godkjenn/avslå-flyten for brukerforeslåtte
-- (pending) rader. Brukes av den nye admin-siden for å administrere merker
-- og modeller for alle kjøretøygrupper (bil, motorsykkel, moped/atv,
-- bobil/campingvogn, tilhenger).

-- RPC: opprett et nytt, ferdig godkjent merke direkte (admin-kuratert, ikke
-- brukerforeslått). Kaster ved duplikat (name, category_group) — fanges opp
-- og vises som feilmelding i UI.
CREATE OR REPLACE FUNCTION public.admin_create_vehicle_brand(_name text, _category_group text)
RETURNS public.vehicle_brands
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.vehicle_brands;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.vehicle_brands (name, category_group, status, submitted_by)
  VALUES (trim(_name), _category_group, 'approved', auth.uid())
  RETURNING * INTO _row;
  RETURN _row;
END $$;
REVOKE ALL ON FUNCTION public.admin_create_vehicle_brand FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_vehicle_brand TO authenticated;

-- RPC: omdøp et eksisterende merke. category_group endres bevisst ikke her —
-- den er implisitt bundet til hvilke modeller/filtre som allerede peker på
-- merket, så en gruppe-endring gjøres tryggest ved å slette og opprette på
-- nytt.
CREATE OR REPLACE FUNCTION public.admin_update_vehicle_brand(_id uuid, _name text)
RETURNS public.vehicle_brands
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.vehicle_brands;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_brands SET name = trim(_name) WHERE id = _id
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Fant ikke merket';
  END IF;
  RETURN _row;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_vehicle_brand FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_vehicle_brand TO authenticated;

-- RPC: slett et merke (kaskaderer til dets modeller via FK). Endrer ikke
-- eksisterende annonser — merkenavnet er lagret som fritekst i
-- listings.attributes, ikke en fremmednøkkel, så publiserte annonser
-- beholder verdien selv om merket fjernes fra nedtrekkslisten.
CREATE OR REPLACE FUNCTION public.admin_delete_vehicle_brand(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_brands WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_vehicle_brand FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_vehicle_brand TO authenticated;

-- RPC: opprett en ny, ferdig godkjent modell under et merke.
CREATE OR REPLACE FUNCTION public.admin_create_vehicle_model(_brand_id uuid, _name text)
RETURNS public.vehicle_models
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.vehicle_models;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.vehicle_models (brand_id, name, status, submitted_by)
  VALUES (_brand_id, trim(_name), 'approved', auth.uid())
  RETURNING * INTO _row;
  RETURN _row;
END $$;
REVOKE ALL ON FUNCTION public.admin_create_vehicle_model FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_vehicle_model TO authenticated;

-- RPC: omdøp en eksisterende modell.
CREATE OR REPLACE FUNCTION public.admin_update_vehicle_model(_id uuid, _name text)
RETURNS public.vehicle_models
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.vehicle_models;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_models SET name = trim(_name) WHERE id = _id
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Fant ikke modellen';
  END IF;
  RETURN _row;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_vehicle_model FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_vehicle_model TO authenticated;

-- RPC: slett en modell.
CREATE OR REPLACE FUNCTION public.admin_delete_vehicle_model(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_models WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_vehicle_model FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_vehicle_model TO authenticated;

-- RPC: lister alle godkjente merker+modeller for admin-CRUD-siden i ett kall
-- (unngår N+1 mot vehicle_models per merke i UI-et).
CREATE OR REPLACE FUNCTION public.admin_list_vehicle_brands_with_models()
RETURNS TABLE(
  brand_id uuid,
  brand_name text,
  category_group text,
  model_id uuid,
  model_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT b.id, b.name, b.category_group, m.id, m.name
    FROM public.vehicle_brands b
    LEFT JOIN public.vehicle_models m ON m.brand_id = b.id AND m.status = 'approved'
    WHERE b.status = 'approved'
    ORDER BY b.category_group, b.name, m.name;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_vehicle_brands_with_models FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_vehicle_brands_with_models TO authenticated;
