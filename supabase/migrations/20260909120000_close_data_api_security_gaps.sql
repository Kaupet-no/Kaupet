-- Expand phase for the Data API hardening found by the 2026-09-09 security
-- review. Add validated server functions and integrity checks without revoking
-- access used by the currently deployed Worker; revocations follow at cutover.

-- Messages -----------------------------------------------------------------

ALTER TABLE public.messages
  ADD COLUMN client_id uuid;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_client_id_key UNIQUE (sender_id, client_id);

CREATE INDEX messages_sender_created_at_idx
  ON public.messages (sender_id, created_at DESC);


CREATE FUNCTION public.send_message_rate_limited(
  _conversation_id uuid,
  _sender_id uuid,
  _body text,
  _attachment_path text,
  _client_id uuid
) RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_message public.messages;
  recent_count integer;
BEGIN
  IF _sender_id IS NULL OR _client_id IS NULL THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;

  IF length(_body) > 4000 OR (btrim(_body) = '' AND _attachment_path IS NULL) THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;

  SELECT * INTO inserted_message
  FROM public.messages
  WHERE sender_id = _sender_id AND client_id = _client_id;
  IF FOUND THEN
    RETURN inserted_message;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    LEFT JOIN public.listings l ON l.id = c.listing_id
    WHERE c.id = _conversation_id
      AND (
        c.buyer_id = _sender_id
        OR c.seller_id = _sender_id
        OR (
          l.organization_id IS NOT NULL
          AND public.can_access_organization_chat(
            l.organization_id,
            l.organization_location_id,
            l.seller_id,
            _sender_id
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF _attachment_path IS NOT NULL THEN
    IF split_part(_attachment_path, '/', 1) <> _conversation_id::text
       OR NOT EXISTS (
         SELECT 1
         FROM storage.objects o
         WHERE o.bucket_id = 'message-attachments'
           AND o.name = _attachment_path
       )
    THEN
      RAISE EXCEPTION 'invalid_attachment';
    END IF;
  END IF;

  -- Serialize sends from one account so concurrent requests cannot race past
  -- the two count checks.
  PERFORM pg_advisory_xact_lock(hashtextextended(_sender_id::text, 0));

  SELECT * INTO inserted_message
  FROM public.messages
  WHERE sender_id = _sender_id AND client_id = _client_id;
  IF FOUND THEN
    RETURN inserted_message;
  END IF;

  SELECT count(*) INTO recent_count
  FROM public.messages
  WHERE sender_id = _sender_id
    AND created_at >= now() - interval '10 seconds';
  IF recent_count >= 12 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT count(*) INTO recent_count
  FROM public.messages
  WHERE sender_id = _sender_id
    AND created_at >= now() - interval '1 hour';
  IF recent_count >= 120 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.messages (
    conversation_id,
    sender_id,
    body,
    attachment_path,
    client_id
  ) VALUES (
    _conversation_id,
    _sender_id,
    btrim(_body),
    _attachment_path,
    _client_id
  )
  RETURNING * INTO inserted_message;

  RETURN inserted_message;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message_rate_limited(uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_message_rate_limited(uuid, uuid, text, text, uuid)
  TO service_role;

-- Listing image metadata ----------------------------------------------------

ALTER TABLE public.listing_images
  ADD CONSTRAINT listing_images_caption_length
  CHECK (caption IS NULL OR length(caption) <= 140);

CREATE FUNCTION public.validate_listing_image_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  image_count integer;
  uploader_id uuid;
BEGIN
  BEGIN
    uploader_id := split_part(NEW.storage_path, '/', 1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_listing_image';
  END;

  IF split_part(NEW.storage_path, '/', 2) <> NEW.listing_id::text
     OR NOT EXISTS (
       SELECT 1
       FROM storage.objects o
       WHERE o.bucket_id = 'listing-images'
         AND o.name = NEW.storage_path
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.listings l
       WHERE l.id = NEW.listing_id
         AND (
           (l.organization_id IS NULL AND l.seller_id = uploader_id)
           OR (
             l.organization_id IS NOT NULL
             AND public.can_update_organization_listing(
               l.organization_id,
               l.organization_location_id,
               l.seller_id,
               l.status,
               l.category_id,
               uploader_id
             )
           )
         )
     )
  THEN
    RAISE EXCEPTION 'invalid_listing_image';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.listing_id::text, 1));
    SELECT count(*) INTO image_count
    FROM public.listing_images
    WHERE listing_id = NEW.listing_id;
    IF image_count >= 20 THEN
      RAISE EXCEPTION 'listing_image_limit';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_listing_image_reference()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER listing_images_validate_reference
  BEFORE INSERT OR UPDATE OF listing_id, storage_path
  ON public.listing_images
  FOR EACH ROW EXECUTE FUNCTION public.validate_listing_image_reference();

-- Search statistics --------------------------------------------------------


DELETE FROM public.listing_category_word_stats WHERE listing_count <= 0;
DELETE FROM public.listing_keyword_stats WHERE listing_count <= 0;

CREATE FUNCTION public.delete_zero_listing_category_word_stat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.listing_category_word_stats
  WHERE lexeme = NEW.lexeme
    AND category_id = NEW.category_id
    AND listing_count <= 0;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.delete_zero_listing_keyword_stat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.listing_keyword_stats
  WHERE word = NEW.word
    AND category_id = NEW.category_id
    AND listing_count <= 0;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_zero_listing_category_word_stat()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_zero_listing_keyword_stat()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER listing_category_word_stats_delete_zero
  AFTER INSERT OR UPDATE OF listing_count
  ON public.listing_category_word_stats
  FOR EACH ROW
  WHEN (NEW.listing_count <= 0)
  EXECUTE FUNCTION public.delete_zero_listing_category_word_stat();

CREATE TRIGGER listing_keyword_stats_delete_zero
  AFTER INSERT OR UPDATE OF listing_count
  ON public.listing_keyword_stats
  FOR EACH ROW
  WHEN (NEW.listing_count <= 0)
  EXECUTE FUNCTION public.delete_zero_listing_keyword_stat();


-- Remove accidental PUBLIC grants from app-owned functions created after the
-- default privilege hardening migration.
REVOKE ALL ON FUNCTION public.admin_list_pending_vehicle_entries() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_search_listings(text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listing_stats(uuid) FROM PUBLIC, anon;

-- Endpoint rate-limit retention -------------------------------------------

CREATE INDEX endpoint_rate_limits_window_started_at_idx
  ON public.endpoint_rate_limits (window_started_at);

CREATE OR REPLACE FUNCTION public.check_endpoint_rate_limit(
  _bucket text,
  _key_hash text,
  _limit integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_attempts integer;
  window_interval interval;
BEGIN
  IF length(_key_hash) <> 64 OR _limit <= 0 OR _window_seconds <= 0 THEN
    RAISE EXCEPTION 'Invalid rate-limit input';
  END IF;
  window_interval := make_interval(secs => _window_seconds);

  INSERT INTO public.endpoint_rate_limits AS limits
    (bucket, key_hash, window_started_at, attempts)
  VALUES (_bucket, _key_hash, now(), 1)
  ON CONFLICT (bucket, key_hash) DO UPDATE SET
    attempts = CASE
      WHEN limits.window_started_at < now() - window_interval THEN 1
      ELSE limits.attempts + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at < now() - window_interval THEN now()
      ELSE limits.window_started_at
    END
  RETURNING attempts INTO current_attempts;

  RETURN current_attempts <= _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.check_endpoint_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_endpoint_rate_limit(text, text, integer, integer)
  TO service_role;

CREATE FUNCTION public.purge_endpoint_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.endpoint_rate_limits
  WHERE window_started_at < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.purge_endpoint_rate_limits()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_endpoint_rate_limits() TO service_role;

SELECT cron.schedule(
  'endpoint-rate-limit-retention-daily',
  '45 3 * * *',
  'SELECT public.purge_endpoint_rate_limits();'
);
