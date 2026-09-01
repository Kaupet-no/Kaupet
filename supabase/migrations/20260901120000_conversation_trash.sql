ALTER TABLE public.conversations
  ADD COLUMN buyer_deleted_at timestamptz,
  ADD COLUMN seller_deleted_at timestamptz;

COMMENT ON COLUMN public.conversations.buyer_deleted_at IS
  'When the buyer moved the conversation to trash. Restorable for 14 days; retained afterwards because the seller still owns the shared conversation.';
COMMENT ON COLUMN public.conversations.seller_deleted_at IS
  'When the seller moved the conversation to trash. Restorable for 14 days; retained afterwards because the buyer still owns the shared conversation.';

CREATE INDEX conversations_buyer_trash_idx
  ON public.conversations (buyer_id, buyer_deleted_at DESC)
  WHERE buyer_deleted_at IS NOT NULL;
CREATE INDEX conversations_seller_trash_idx
  ON public.conversations (seller_id, seller_deleted_at DESC)
  WHERE seller_deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_conversation_read_status_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
    OR NEW.wtb_listing_id IS DISTINCT FROM OLD.wtb_listing_id
    OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only last_message_at, read status and trash status may be updated by participants';
  END IF;

  IF _uid = OLD.buyer_id THEN
    IF NEW.seller_last_read_at IS DISTINCT FROM OLD.seller_last_read_at THEN
      RAISE EXCEPTION 'Buyer cannot update seller_last_read_at';
    END IF;
    IF NEW.seller_deleted_at IS DISTINCT FROM OLD.seller_deleted_at THEN
      RAISE EXCEPTION 'Buyer cannot update seller_deleted_at';
    END IF;

    IF NEW.buyer_deleted_at IS DISTINCT FROM OLD.buyer_deleted_at THEN
      IF OLD.buyer_deleted_at IS NULL AND NEW.buyer_deleted_at IS NOT NULL THEN
        NEW.buyer_deleted_at := statement_timestamp();
      ELSIF OLD.buyer_deleted_at IS NOT NULL AND NEW.buyer_deleted_at IS NULL THEN
        IF OLD.buyer_deleted_at < statement_timestamp() - interval '14 days' THEN
          RAISE EXCEPTION 'Conversation can no longer be restored';
        END IF;
      ELSE
        RAISE EXCEPTION 'buyer_deleted_at cannot be changed once set; restore the conversation first';
      END IF;
    END IF;
  ELSIF _uid = OLD.seller_id THEN
    IF NEW.buyer_last_read_at IS DISTINCT FROM OLD.buyer_last_read_at THEN
      RAISE EXCEPTION 'Seller cannot update buyer_last_read_at';
    END IF;
    IF NEW.buyer_deleted_at IS DISTINCT FROM OLD.buyer_deleted_at THEN
      RAISE EXCEPTION 'Seller cannot update buyer_deleted_at';
    END IF;

    IF NEW.seller_deleted_at IS DISTINCT FROM OLD.seller_deleted_at THEN
      IF OLD.seller_deleted_at IS NULL AND NEW.seller_deleted_at IS NOT NULL THEN
        NEW.seller_deleted_at := statement_timestamp();
      ELSIF OLD.seller_deleted_at IS NOT NULL AND NEW.seller_deleted_at IS NULL THEN
        IF OLD.seller_deleted_at < statement_timestamp() - interval '14 days' THEN
          RAISE EXCEPTION 'Conversation can no longer be restored';
        END IF;
      ELSE
        RAISE EXCEPTION 'seller_deleted_at cannot be changed once set; restore the conversation first';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
