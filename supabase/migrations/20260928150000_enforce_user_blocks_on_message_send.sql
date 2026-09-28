-- send_message_rate_limited() (20260909120000, replaced 20260918220000)
-- checks conversation participation but never public.user_blocks: once a
-- conversation exists, a blocked pair could keep messaging each other even
-- though conversations_enforce_block_trigger (baseline) already stops a
-- *new* conversation between blocked users. App Store 1.2 requires blocking
-- to actually stop messages, not just new conversations.
--
-- Fix: after the existing participant check, look up the other participant
-- (buyer/seller swap; for an organization-chat sender there is no
-- buyer/seller symmetry, so the other party is always the buyer) and reject
-- with public.is_blocked_between(), the same SECURITY DEFINER helper the
-- baseline trigger uses — the sender cannot read the blocker's own
-- public.user_blocks rows directly. Rate limiting, idempotency and the
-- attachment-path checks are otherwise unchanged from 20260918220000.

CREATE OR REPLACE FUNCTION public.send_message_rate_limited(
  _conversation_id uuid,
  _sender_id uuid,
  _body text,
  _attachment_path text,
  _client_id uuid
) returns public.messages
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  inserted_message public.messages;
  recent_count integer;
  other_party_id uuid;
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

  SELECT CASE WHEN c.buyer_id = _sender_id THEN c.seller_id ELSE c.buyer_id END
    INTO other_party_id
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
    );

  IF other_party_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF public.is_blocked_between(_sender_id, other_party_id, _conversation_id) THEN
    RAISE EXCEPTION 'blocked' USING ERRCODE = 'check_violation';
  END IF;

  IF _attachment_path IS NOT NULL THEN
    IF split_part(_attachment_path, '/', 1) <> _conversation_id::text
       OR _attachment_path !~* (
         '^' || _conversation_id::text ||
         '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl)$'
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
