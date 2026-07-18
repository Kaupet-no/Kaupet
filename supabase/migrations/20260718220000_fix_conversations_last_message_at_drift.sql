-- conversations.last_message_at ble kun satt fra klienten, i et eget UPDATE-kall
-- etter at meldingen ble satt inn (meldinger.$id.tsx). Dette to-stegs-mønsteret
-- kan gå ut av synk (avbrutt request, race condition, eller en melding som
-- senere fjernes uten at last_message_at justeres). Når last_message_at peker
-- på et tidspunkt nyere enn noen faktisk melding, kan mottakeren aldri markere
-- samtalen som lest — isUnread() vil alltid returnere true.
--
-- 1) Reparer eksisterende avvik: resynk last_message_at til faktisk siste melding.
UPDATE public.conversations c
SET last_message_at = m.max_created_at
FROM (
  SELECT conversation_id, max(created_at) AS max_created_at
  FROM public.messages
  GROUP BY conversation_id
) m
WHERE c.id = m.conversation_id
  AND c.last_message_at IS DISTINCT FROM m.max_created_at;

-- 2) Flytt oppdateringen server-side, atomisk med meldingsinnsettingen, slik at
--    de aldri kan drifte fra hverandre igjen.
CREATE OR REPLACE FUNCTION public.messages_bump_conversation_last_message_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id
    AND last_message_at < NEW.created_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_bump_conversation_last_message_at_trg
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_bump_conversation_last_message_at();
