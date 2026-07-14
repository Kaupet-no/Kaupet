
-- Block scope enum
CREATE TYPE public.block_scope AS ENUM ('all', 'conversation');

-- user_blocks table
CREATE TABLE public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  scope public.block_scope NOT NULL,
  conversation_id uuid,
  listing_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (blocker_id <> blocked_id),
  CHECK (
    (scope = 'all' AND conversation_id IS NULL)
    OR (scope = 'conversation' AND conversation_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX user_blocks_all_unique
  ON public.user_blocks (blocker_id, blocked_id)
  WHERE scope = 'all';
CREATE UNIQUE INDEX user_blocks_conv_unique
  ON public.user_blocks (blocker_id, conversation_id)
  WHERE scope = 'conversation';
CREATE INDEX user_blocks_blocker_idx ON public.user_blocks (blocker_id);
CREATE INDEX user_blocks_blocked_idx ON public.user_blocks (blocked_id);

GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own blocks" ON public.user_blocks
  FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "Users insert own blocks" ON public.user_blocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users delete own blocks" ON public.user_blocks
  FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- Helper: is there a block between A and B that covers this conversation?
-- Returns true if either direction has scope='all' OR scope='conversation' on this conversation.
CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE
      (
        (b.blocker_id = _a AND b.blocked_id = _b)
        OR (b.blocker_id = _b AND b.blocked_id = _a)
      )
      AND (
        b.scope = 'all'
        OR (b.scope = 'conversation' AND b.conversation_id = _conversation_id)
      )
  );
$$;

-- Trigger: prevent sending messages when blocked
CREATE OR REPLACE FUNCTION public.messages_enforce_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _other uuid;
BEGIN
  SELECT CASE WHEN c.buyer_id = NEW.sender_id THEN c.seller_id ELSE c.buyer_id END
    INTO _other
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF _other IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_blocked_between(NEW.sender_id, _other, NEW.conversation_id) THEN
    RAISE EXCEPTION 'Meldingen kan ikke sendes fordi samtalen er blokkert'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_enforce_block_trigger
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_enforce_block();

-- Trigger: prevent creating a new conversation when there is an 'all' block in either direction
CREATE OR REPLACE FUNCTION public.conversations_enforce_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE b.scope = 'all'
      AND (
        (b.blocker_id = NEW.buyer_id AND b.blocked_id = NEW.seller_id)
        OR (b.blocker_id = NEW.seller_id AND b.blocked_id = NEW.buyer_id)
      )
  ) THEN
    RAISE EXCEPTION 'Samtalen kan ikke opprettes fordi en av brukerne har blokkert den andre'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversations_enforce_block_trigger
BEFORE INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.conversations_enforce_block();
