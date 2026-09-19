-- R2-migreringen (kodemessig ferdig, se src/lib/storage.ts,
-- src/lib/storage.functions.ts og src/lib/r2.server.ts) betyr at bilder og
-- meldingsvedlegg aldri lenger skrives til Supabase Storage. Dermed fylles
-- `storage.objects` aldri mer, og de to funksjonene under — som fram til nå
-- har krevd en matchende rad der — avviser i praksis ALT etter cutover:
--
--   1. `public.validate_listing_image_reference()` (trigger på
--      `listing_images`) krevde i tillegg at stien fulgte det gamle
--      Supabase Storage-skjemaet `{uploaderUserId}/{listingId}/{fil}` (første
--      segment cast til uuid som "uploader_id", andre segment sjekket mot
--      NEW.listing_id). Det nye R2-nøkkelskjemaet er `{listingId}/{uuid}.{ext}`
--      — bare to segmenter, ingen bruker-id i stien, siden opplastingen ikke
--      lenger autoriseres av en path-basert storage-policy (se
--      20260918210000_drop_dead_storage_object_policies.sql).
--   2. `public.send_message_rate_limited(...)` krevde tilsvarende en
--      matchende `storage.objects`-rad for meldingsvedlegget.
--
-- Denne migrasjonen erstatter begge funksjonene med `create or replace`
-- (migrasjonene som opprettet dem, 20260909120000_close_data_api_security_gaps.sql,
-- er allerede anvendt i produksjon og redigeres ikke).
--
-- Hva som erstatter storage.objects-sjekken:
--
-- `validate_listing_image_reference`:
--   - Stiformatet valideres nå mot `{listingId}/{uuid}.{ext}` med én
--     forankret regex mot HELE `NEW.storage_path` (samme form som
--     `send_message_rate_limited` bruker for vedleggsstier under, med
--     `NEW.listing_id::text` i stedet for samtale-id-en) — ikke separate
--     `split_part`-sjekk av første og andre segment som før, siden den
--     varianten ikke forankrer strengens slutt og dermed slipper gjennom en
--     sti med et uventet tredje segment (`{listingId}/{uuid}.jpg/noe`).
--   - Eksistenssjekken mot `storage.objects` fjernes uten erstatning: Postgres
--     har ingen måte å verifisere at et R2-objekt finnes, og skal ikke få en.
--     Selve opplastingen skjer uansett kun gjennom
--     uploadListingImage/uploadListingImageThumb (src/lib/storage.functions.ts),
--     som først sjekker RPC-en `can_upload_listing_image`
--     (20260918100000_can_upload_listing_image.sql) før noe skrives til R2.
--   - Autorisasjonssjekken ("uploader_id fra stien") kan ikke lenger utledes
--     av stien, siden bruker-id-en ikke lenger er en del av nøkkelen. Den
--     erstattes med `auth.uid()`. Dette er trygt fordi begge innsettingene
--     som trigger funksjonen — src/features/listing-edit/use-inline-listing-images.ts
--     (linje ~133) og src/routes/ny-annonse.tsx (linje ~1311) — går via
--     `supabase.from("listing_images").insert(...)` fra nettleserklienten med
--     brukerens egen sesjon (authenticated-rollen), aldri via
--     service-role/supabaseAdmin. `auth.uid()` er dermed alltid satt når
--     triggeren kjører. Betingelsen er for øvrig identisk med RLS-policyen
--     "Owners can manage listing images" som allerede håndheves på
--     `listing_images` (20260902130000_organization_locations_and_billing.sql)
--     og med RPC-en `can_upload_listing_image` — triggeren er dermed et
--     forsvar i dybden, ikke den eneste sperren.
--   - Grensen på 20 bilder per annonse og `pg_advisory_xact_lock`-mekanismen
--     (den eneste håndhevelsen av MAX_LISTING_IMAGES på serversiden) er
--     UENDRET.
--
-- `send_message_rate_limited`:
--   - `storage.objects`-sjekken beskyttet mot at en klient kunne oppgi en
--     vilkårlig `attachment_path` for en fil som aldri faktisk var lastet opp
--     (eller som tilhørte en annen samtale/bucket). Nå som vedlegg lastes opp
--     via uploadMessageAttachment (src/lib/storage.functions.ts) — en
--     serverfunksjon som selv verifiserer at brukeren er buyer_id/seller_id i
--     samtalen FØR den skriver til den private VEDLEGG-bucketen i R2, og som
--     bygger nøkkelen server-side som `{conversationId}/{uuid}.{ext}` — er
--     eksistenssjekken i praksis erstattet av den opplastingsflyten. Det
--     eneste som gjenstår å validere i databasefunksjonen er at
--     `_attachment_path` faktisk har det nøkkelformatet for DENNE samtalen
--     (uendret prefikssjekk, nå supplert med et format-regex som speiler
--     MESSAGE_ATTACHMENT_PATH_RE i src/lib/storage.functions.ts) — en klient
--     kan fortsatt ikke få funksjonen til å godta en sti for en annen samtale
--     eller et vilkårlig strukturert vedlegg.
--   - Resten av funksjonen — rate limiting (12/10s, 120/t), deltakersjekk mot
--     `conversation_id`/`_sender_id` og idempotens via `client_id` — er
--     UENDRET.
--
-- Merk: `send_message_rate_limited` kalles kun fra `supabaseAdmin`
-- (service-role) i src/lib/messages.functions.ts, med `_sender_id` satt til
-- `context.userId` fra den autentiserte sesjonen (ikke fra klientinput).
-- `auth.uid()` er dermed IKKE tilgjengelig inni denne funksjonen — men den
-- var aldri brukt her (funksjonen bruker den eksplisitte `_sender_id`-
-- parameteren for alle sjekker), så dette påvirker ikke fiksen.
--
-- Øvrige `storage.objects`-treff i migrasjonshistorikken
-- (20260901140000_business_accounts.sql, 20260902150000_storage_bucket_policies.sql)
-- er RLS-policyer på selve `storage.objects`-tabellen, allerede droppet av
-- 20260918210000_drop_dead_storage_object_policies.sql. Ingen andre
-- databasefunksjoner enn de to under refererer `storage.objects`.

create or replace function public.validate_listing_image_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  image_count integer;
begin
  IF NEW.storage_path !~* (
       '^' || NEW.listing_id::text ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl)$'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.listings l
       WHERE l.id = NEW.listing_id
         AND (
           (l.organization_id IS NULL AND l.seller_id = auth.uid())
           OR (
             l.organization_id IS NOT NULL
             AND public.can_update_organization_listing(
               l.organization_id,
               l.organization_location_id,
               l.seller_id,
               l.status,
               l.category_id,
               auth.uid()
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

-- Trigger-koblingen fra 20260909120000_close_data_api_security_gaps.sql
-- (listing_images_validate_reference, BEFORE INSERT OR UPDATE OF listing_id,
-- storage_path) står urørt — CREATE OR REPLACE FUNCTION endrer ikke
-- funksjonens identitet, så den eksisterende triggeren peker fortsatt på den
-- nye funksjonskroppen uten at triggeren må opprettes på nytt.

create or replace function public.send_message_rate_limited(
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
