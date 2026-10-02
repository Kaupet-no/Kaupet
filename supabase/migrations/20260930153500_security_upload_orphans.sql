-- Register standard R2 objects before upload so failed metadata writes cannot
-- leave permanently untracked objects. Cleanup only ever deletes these keys.
CREATE TABLE public.standard_upload_objects (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL CHECK (bucket IN ('BILDER', 'VEDLEGG')),
  object_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready', 'deleting', 'deleted')),
  claimed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  UNIQUE (bucket, object_key),
  CHECK (
    (bucket = 'BILDER' AND object_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-thumb)?|avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(logo|contact)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp|jxl)$')
    OR (bucket = 'VEDLEGG' AND object_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl)$')
  )
);
CREATE INDEX standard_upload_objects_cleanup_idx
  ON public.standard_upload_objects (created_at, id)
  WHERE state IN ('ready', 'deleting');
CREATE INDEX standard_upload_objects_tombstone_idx
  ON public.standard_upload_objects (claimed_at, id)
  WHERE state IN ('deleting', 'deleted');
COMMENT ON TABLE public.standard_upload_objects IS
  'Eksaktregister og 7-dagers tombstones for standard R2-opplastinger; attempts >= 10 beholdes som oppryddingsavvik og kan inspiseres her.';
ALTER TABLE public.standard_upload_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.standard_upload_objects FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.standard_upload_objects TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.standard_upload_objects_id_seq TO service_role;

CREATE FUNCTION public.register_standard_upload_object(_bucket text, _key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.standard_upload_objects (bucket, object_key)
  VALUES (_bucket, _key)
  ON CONFLICT (bucket, object_key) DO UPDATE
    SET object_key = EXCLUDED.object_key
    WHERE standard_upload_objects.state = 'ready';
  IF NOT FOUND THEN RAISE EXCEPTION 'R2-objektet er under opprydding'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.register_standard_upload_object(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_standard_upload_object(text, text) TO service_role;

CREATE FUNCTION public.standard_upload_is_referenced(_bucket text, _key text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _bucket = 'BILDER' THEN
      EXISTS (
        SELECT 1 FROM public.listing_images
        WHERE listing_id = split_part(_key, '/', 1)::uuid AND storage_path = _key
      )
      OR EXISTS (
        SELECT 1 FROM public.listing_images
        WHERE listing_id = split_part(_key, '/', 1)::uuid
          AND storage_path = regexp_replace(_key, '-thumb(\.(jpg|png|webp|jxl))$', '\1')
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = split_part(_key, '/', 1)::uuid
          AND right(avatar_url, length(_key) + 1) = '/' || _key
      )
      OR EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = split_part(_key, '/', 1)::uuid AND logo_path = _key
      )
      OR EXISTS (
        SELECT 1 FROM public.organization_location_contacts
        WHERE organization_id = split_part(_key, '/', 1)::uuid AND avatar_path = _key
      )
    WHEN _bucket = 'VEDLEGG' THEN
      EXISTS (
        SELECT 1 FROM public.messages
        WHERE conversation_id = split_part(_key, '/', 1)::uuid AND attachment_path = _key
      )
    ELSE false
  END
$$;
REVOKE ALL ON FUNCTION public.standard_upload_is_referenced(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.standard_upload_is_referenced(text, text) TO service_role;

-- Metadata writers lock the registered object (and a listing image's derived
-- thumbnail) before attaching it. A concurrent cleanup claim then serializes
-- with this guard and cannot delete a newly referenced object.
CREATE FUNCTION public.guard_standard_upload_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bucket text;
  _key text;
  _keys text[] := ARRAY[]::text[];
  _match text[];
  _state text;
BEGIN
  IF TG_TABLE_NAME = 'listing_images' THEN
    _bucket := 'BILDER';
    _key := NEW.storage_path;
    _keys := ARRAY[_key, regexp_replace(_key, '(\.(jpg|png|webp|jxl))$', '-thumb\1')];
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    _bucket := 'BILDER';
    _match := regexp_match(NEW.avatar_url, '/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl))$');
    IF _match IS NOT NULL THEN _keys := ARRAY[_match[1]]; END IF;
  ELSIF TG_TABLE_NAME = 'organizations' THEN
    _bucket := 'BILDER'; _key := NEW.logo_path;
    IF _key IS NOT NULL THEN _keys := ARRAY[_key]; END IF;
  ELSIF TG_TABLE_NAME = 'organization_location_contacts' THEN
    _bucket := 'BILDER'; _key := NEW.avatar_path;
    IF _key IS NOT NULL THEN _keys := ARRAY[_key]; END IF;
  ELSIF TG_TABLE_NAME = 'messages' THEN
    _bucket := 'VEDLEGG'; _key := NEW.attachment_path;
    IF _key IS NOT NULL THEN _keys := ARRAY[_key]; END IF;
  END IF;

  IF cardinality(_keys) > 0 THEN
    FOR _state IN
      SELECT state FROM public.standard_upload_objects
      WHERE bucket = _bucket AND object_key = ANY(_keys)
      ORDER BY object_key FOR UPDATE
    LOOP
      IF _state <> 'ready' THEN RAISE EXCEPTION 'R2-objektet er under opprydding'; END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_standard_upload_reference() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER listing_images_guard_standard_upload
  BEFORE INSERT OR UPDATE OF storage_path ON public.listing_images
  FOR EACH ROW EXECUTE FUNCTION public.guard_standard_upload_reference();
CREATE TRIGGER profiles_guard_standard_upload
  BEFORE INSERT OR UPDATE OF avatar_url ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_standard_upload_reference();
CREATE TRIGGER organizations_guard_standard_upload
  BEFORE INSERT OR UPDATE OF logo_path ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_standard_upload_reference();
CREATE TRIGGER organization_contacts_guard_standard_upload
  BEFORE INSERT OR UPDATE OF avatar_path ON public.organization_location_contacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_standard_upload_reference();
CREATE TRIGGER messages_guard_standard_upload
  BEFORE INSERT OR UPDATE OF attachment_path ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_standard_upload_reference();

CREATE FUNCTION public.claim_orphan_standard_uploads(_limit integer)
RETURNS TABLE (id bigint, bucket text, object_key text, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.standard_upload_objects%ROWTYPE;
BEGIN
  -- ponytail: én referansesjekk per gammel kandidat; materialiser referansestier hvis oppryddingen blir treg.
  DELETE FROM public.standard_upload_objects
  WHERE standard_upload_objects.id IN (
    SELECT o.id FROM public.standard_upload_objects o
    WHERE o.state = 'deleted'
      AND o.claimed_at < now() - interval '7 days'
      AND NOT public.standard_upload_is_referenced(o.bucket, o.object_key)
    ORDER BY o.claimed_at, o.id
    FOR UPDATE SKIP LOCKED
    LIMIT 100
  );

  FOR _row IN
    SELECT * FROM public.standard_upload_objects o
    WHERE o.created_at < now() - interval '24 hours'
      AND o.attempts < 10
      AND (o.state = 'ready' OR (o.state = 'deleting' AND o.claimed_at < now() - interval '15 minutes'))
      AND NOT public.standard_upload_is_referenced(o.bucket, o.object_key)
    ORDER BY o.created_at, o.id
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(_limit, 0), 100)
  LOOP
    IF NOT public.standard_upload_is_referenced(_row.bucket, _row.object_key) THEN
      UPDATE public.standard_upload_objects
      SET state = 'deleting', claimed_at = now()
      WHERE standard_upload_objects.id = _row.id;
      id := _row.id; bucket := _row.bucket; object_key := _row.object_key; attempts := _row.attempts;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_orphan_standard_uploads(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_orphan_standard_uploads(integer) TO service_role;

CREATE FUNCTION public.finish_orphan_standard_upload(_id bigint, _deleted boolean, _error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _deleted THEN
    UPDATE public.standard_upload_objects
    SET state = 'deleted', claimed_at = now(), last_error = NULL
    WHERE id = _id AND state = 'deleting';
  ELSE
    UPDATE public.standard_upload_objects
    SET claimed_at = now(), attempts = attempts + 1, last_error = left(_error, 1000)
    WHERE id = _id AND state = 'deleting';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_orphan_standard_upload(bigint, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_orphan_standard_upload(bigint, boolean, text) TO service_role;
