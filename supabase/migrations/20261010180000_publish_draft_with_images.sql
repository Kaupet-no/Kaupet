-- Keep client column grants unchanged. Only the authenticated server may publish
-- a draft and reconcile its images, under the same row lock and transaction.
CREATE FUNCTION public.publish_listing_draft(
  _listing_id uuid, _user_id uuid, _fields jsonb, _images jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _current public.listings%ROWTYPE;
  _next public.listings%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _current FROM public.listings WHERE id = _listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Annonsen finnes ikke'; END IF;
  IF (_current.organization_id IS NULL AND _current.seller_id IS DISTINCT FROM _user_id)
    OR (_current.organization_id IS NOT NULL AND NOT public.can_update_organization_listing(
      _current.organization_id, _current.organization_location_id, _current.seller_id,
      _current.status, _current.category_id, _user_id)) THEN
    RAISE EXCEPTION 'Du har ikke tilgang til denne annonsen' USING ERRCODE = '42501';
  END IF;
  -- A late retry cannot touch images or fields once another request published.
  IF _current.status = 'active' THEN
    RETURN jsonb_build_object('id', _current.id, 'kaupet_code', _current.kaupet_code, 'already_published', true);
  END IF;
  IF _current.status <> 'draft' THEN RAISE EXCEPTION 'Utkastet kan ikke publiseres i denne tilstanden'; END IF;
  _next := jsonb_populate_record(_current, _fields);
  IF _current.organization_id IS NOT NULL AND NOT public.can_create_organization_listing(
    _current.organization_id, _next.organization_location_id, _next.category_id, _user_id) THEN
    RAISE EXCEPTION 'Du har ikke tilgang til å opprette annonser' USING ERRCODE = '42501';
  END IF;
  IF _images IS NULL OR jsonb_typeof(_images) <> 'array' OR jsonb_array_length(_images) > 100 THEN
    RAISE EXCEPTION 'Ugyldig bildeliste';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(_images) AS i(id uuid, storage_path text, sort_order integer)
    WHERE i.id IS NULL OR i.storage_path IS NULL OR i.sort_order IS NULL OR i.sort_order NOT BETWEEN 0 AND 99)
    OR (SELECT count(*) <> count(DISTINCT id) FROM jsonb_to_recordset(_images) AS i(id uuid)) THEN
    RAISE EXCEPTION 'Ugyldig bildeliste';
  END IF;
  IF EXISTS (SELECT 1 FROM public.listing_images old
    JOIN jsonb_to_recordset(_images) AS i(id uuid, storage_path text) ON old.id = i.id
    WHERE old.listing_id <> _listing_id OR old.storage_path <> i.storage_path) THEN
    RAISE EXCEPTION 'Ugyldig bildereferanse';
  END IF;

  DELETE FROM public.listing_images old WHERE old.listing_id = _listing_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(_images) AS i(id uuid) WHERE i.id = old.id);
  UPDATE public.listing_images old SET sort_order = i.sort_order, caption = i.caption
    FROM jsonb_to_recordset(_images) AS i(id uuid, sort_order integer, caption text)
    WHERE old.listing_id = _listing_id AND old.id = i.id;
  -- INSERT triggers enforce paths, upload cleanup locks and the 100-image limit.
  -- Existing rows use UPDATE so a retry at that limit never runs INSERT triggers.
  INSERT INTO public.listing_images (id, listing_id, storage_path, sort_order, caption)
    SELECT i.id, _listing_id, i.storage_path, i.sort_order, i.caption
    FROM jsonb_to_recordset(_images) AS i(id uuid, storage_path text, sort_order integer, caption text)
    WHERE NOT EXISTS (SELECT 1 FROM public.listing_images old WHERE old.id = i.id);

  UPDATE public.listings SET
    title = _next.title, subtitle = _next.subtitle, description = _next.description,
    category_id = _next.category_id, condition = _next.condition, is_free = _next.is_free,
    price_nok = _next.price_nok, postal_code = _next.postal_code, city = _next.city,
    lat = _next.lat, lng = _next.lng, can_ship = _next.can_ship,
    known_issues = _next.known_issues, no_known_issues = _next.no_known_issues,
    maintenance_history = _next.maintenance_history, attributes = _next.attributes,
    organization_location_id = _next.organization_location_id, status = 'active'
    WHERE id = _listing_id;
  -- Unreferenced files remain in standard_upload_objects for the guarded cleanup job.
  RETURN jsonb_build_object('id', _current.id, 'kaupet_code', _current.kaupet_code, 'already_published', false);
END;
$$;
REVOKE ALL ON FUNCTION public.publish_listing_draft(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_listing_draft(uuid, uuid, jsonb, jsonb) TO service_role;
