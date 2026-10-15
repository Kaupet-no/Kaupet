-- Merker bilder som er KI-generert ifølge C2PA-/IPTC-metadata i originalfilen.
-- Klienten leser metadataen før komprimering (som fjerner den) og sender
-- flagget med. Selgeren setter det kun ved INSERT; det kan ikke endres senere.

ALTER TABLE public.listing_images
  ADD COLUMN ai_generated boolean NOT NULL DEFAULT false;

GRANT INSERT (ai_generated) ON TABLE public.listing_images TO authenticated;

-- Uendret fra 20261013120000, bortsett fra ai_generated i INSERT.
CREATE OR REPLACE FUNCTION public.sync_listing_images(_listing_id uuid, _images jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server access required' USING ERRCODE = '42501';
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
  INSERT INTO public.listing_images (id, listing_id, storage_path, sort_order, caption, ai_generated)
    SELECT i.id, _listing_id, i.storage_path, i.sort_order, i.caption, coalesce(i.ai_generated, false)
    FROM jsonb_to_recordset(_images)
      AS i(id uuid, storage_path text, sort_order integer, caption text, ai_generated boolean)
    WHERE NOT EXISTS (SELECT 1 FROM public.listing_images old WHERE old.id = i.id);
  -- Unreferenced files remain in standard_upload_objects for the guarded cleanup job.
END;
$$;
