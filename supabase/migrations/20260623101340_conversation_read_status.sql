-- Flytt "lest melding"-status fra klient-side localStorage til databasen, slik
-- at den synkroniseres på tvers av enheter/faner/økter for samme bruker.

ALTER TABLE public.conversations ADD COLUMN buyer_last_read_at timestamptz;
ALTER TABLE public.conversations ADD COLUMN seller_last_read_at timestamptz;

-- Den eksisterende "Participants can update conversations"-policyen tillater
-- UPDATE på alle kolonner for begge parter (brukt i dag bl.a. for å sette
-- last_message_at når man sender en melding). Lås ned identitets-/relasjons-
-- feltene, og sørg for at hver part kun kan sette sin egen *_last_read_at.
CREATE OR REPLACE FUNCTION public.enforce_conversation_read_status_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
    OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only last_message_at/buyer_last_read_at/seller_last_read_at may be updated by participants';
  END IF;
  IF auth.uid() = OLD.buyer_id AND NEW.seller_last_read_at IS DISTINCT FROM OLD.seller_last_read_at THEN
    RAISE EXCEPTION 'Buyer cannot update seller_last_read_at';
  END IF;
  IF auth.uid() = OLD.seller_id AND NEW.buyer_last_read_at IS DISTINCT FROM OLD.buyer_last_read_at THEN
    RAISE EXCEPTION 'Seller cannot update buyer_last_read_at';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversations_enforce_read_status_only
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_read_status_only();
