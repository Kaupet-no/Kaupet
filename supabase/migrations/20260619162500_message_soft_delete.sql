-- Allow a sender to soft-delete their own message ("Slett melding"). The row
-- stays so the recipient still sees a "Melding slettet" placeholder and
-- conversation ordering/unread logic keeps working.

ALTER TABLE public.messages ADD COLUMN deleted_at timestamptz;

CREATE POLICY "Senders can soft-delete their own messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

GRANT UPDATE ON public.messages TO authenticated;

-- The UPDATE policy alone doesn't restrict *which* columns change; only
-- deleted_at may be touched, and only to be newly set (not cleared).
CREATE OR REPLACE FUNCTION public.enforce_message_soft_delete_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only deleted_at may be updated on messages';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'deleted_at cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_enforce_soft_delete_only
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_message_soft_delete_only();
