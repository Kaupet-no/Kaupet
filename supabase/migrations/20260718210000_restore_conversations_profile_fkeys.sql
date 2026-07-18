-- conversations_buyer_id_fkey/conversations_seller_id_fkey (til auth.users) ble
-- droppet i 20260604202136 for å hindre CASCADE-sletting av samtaler når en
-- bruker sletter kontoen sin (kontoer anonymiseres i stedet for å slettes).
--
-- Men PostgREST-spørringer i klienten (meldinger.index.tsx, messages-button.tsx)
-- bruker fortsatt disse constraint-navnene som embed-hint for å joine
-- profiles-tabellen (`profiles!conversations_buyer_id_fkey`). Uten en constraint
-- med akkurat dette navnet svarer PostgREST 400 PGRST200 ("could not find a
-- relationship") på alle disse kallene, permanent.
--
-- Gjenoppretter FK-ene mot public.profiles i stedet for auth.users, slik at
-- navnene matcher det klienten forventer, uten å gjeninnføre CASCADE-risikoen
-- (profiles-rader slettes aldri — kun anonymiseres ved kontosletting).
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) NOT VALID;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_seller_id_fkey
  FOREIGN KEY (seller_id) REFERENCES public.profiles(id) NOT VALID;

ALTER TABLE public.conversations VALIDATE CONSTRAINT conversations_buyer_id_fkey;
ALTER TABLE public.conversations VALIDATE CONSTRAINT conversations_seller_id_fkey;
