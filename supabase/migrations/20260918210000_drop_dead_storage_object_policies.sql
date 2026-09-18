-- R2-migreringen (kodemessig ferdig, se src/lib/storage.ts og
-- src/lib/storage.functions.ts) betyr at ingen kode lenger leser eller
-- skriver til Supabase Storage. Annonsebilder, thumbnails, 360-frames,
-- avatarer, organisasjonslogoer og meldingsvedlegg ligger nå i Cloudflare R2,
-- utenfor Postgres. RLS-policyene på `storage.objects` for disse bucketene
-- beskytter derfor ingenting lenger — de gjaldt kun `anon`/`authenticated`
-- Supabase-klientkall mot Storage-APIet, og ingen slike kall utstedes
-- (`src/lib/storage.ts` importerer ikke lenger supabase-klienten).
--
-- Dette er ikke et sikkerhetstap: den samme autorisasjonen finnes fortsatt,
-- flyttet inn i eksplisitte sjekker i serverfunksjonene i
-- src/lib/storage.functions.ts, som kalles fra klienten men selv kjører
-- server-side med service-role mot R2:
--   - listing-images (opplasting/sletting av annonsebilder og thumbnails):
--     RPC-en public.can_upload_listing_image
--     (20260918100000_can_upload_listing_image.sql), som speiler
--     listing_images_write/listing_images_delete under nøyaktig samme vilkår.
--   - listing-images (lesing): annonsebilder serveres nå fra en offentlig
--     R2-URL (se src/lib/image-url.ts) — samme lesbarhet som
--     listing_images_read ga anon/authenticated for aktive/eide annonser,
--     bare uten radnivå-filtrering, siden R2-objektet i seg selv ikke er
--     sensitivt utover annonsen det tilhører.
--   - listing-360-frames: skrives kun av service-role via capture-token-flyten
--     (uploadVehicle360Frame i src/lib/vehicle/vehicle-360.functions.ts), som
--     før. listing_360_frames_read hadde uansett ingen tilsvarende
--     skrivepolicy å erstatte.
--   - avatars: eierskapssjekk (`split_part(name,'/',1) = auth.uid()`) er nå
--     `context.userId` fra den autentiserte sesjonen i
--     uploadAvatarImage/deletePreviousAvatarImage — nøkkelen bygges
--     server-side og kan ikke forfalskes fra klienten.
--   - organization-logos: is_organization_superuser +
--     organization_has_proff_access sjekkes eksplisitt i
--     uploadOrganizationLogo/deletePreviousOrganizationLogo, samme vilkår som
--     organization_logos_superuser_insert/_update/_delete
--     (20260901140000_business_accounts.sql) krevde.
--   - message-attachments: deltakeroppslag direkte mot `conversations`
--     (buyer_id/seller_id = auth.uid()) i uploadMessageAttachment og
--     signMessageAttachmentUrls, samme vilkår som
--     message_attachments_participant_read/_insert krevde.
--
-- Policyene droppes idempotent med `if exists` siden denne migrasjonen kan
-- kjøre mot miljøer der de originale policyene aldri ble anvendt. Selve
-- bucketene og objektene i dem slettes IKKE her — det er en destruktiv
-- operasjon på data og skal være et bevisst valg i Supabase-dashbordet, ikke
-- noe en skjemamigrasjon gjør stilltiende.

-- Fra 20260902150000_storage_bucket_policies.sql:
drop policy if exists listing_images_read on storage.objects;
drop policy if exists listing_images_write on storage.objects;
drop policy if exists listing_images_delete on storage.objects;
drop policy if exists listing_360_frames_read on storage.objects;
drop policy if exists avatars_public_read on storage.objects;
drop policy if exists avatars_owner_insert on storage.objects;
drop policy if exists avatars_owner_update on storage.objects;
drop policy if exists avatars_owner_delete on storage.objects;
drop policy if exists message_attachments_participant_read on storage.objects;
drop policy if exists message_attachments_participant_insert on storage.objects;

-- Fra 20260901140000_business_accounts.sql:
drop policy if exists organization_logos_public_read on storage.objects;
drop policy if exists organization_logos_superuser_insert on storage.objects;
drop policy if exists organization_logos_superuser_update on storage.objects;
drop policy if exists organization_logos_superuser_delete on storage.objects;
