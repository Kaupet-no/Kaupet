-- storage.objects policies for listing-images, avatars, listing-360-frames
-- and message-attachments did not exist in this repo — the actual access
-- control for private annonse-bilder, 360-bilder and chat-vedlegg lived only
-- in production and was not reviewable or reproducible. See
-- docs/SIKKERHETSVURDERING.md K-2.
--
-- Path conventions (enforced below, matching src/lib/storage.ts and
-- src/lib/vehicle/vehicle-360.functions.ts):
--   listing-images:       {uploaderId}/{listingId}/{file}
--   listing-360-frames:   {listingId}/{frameOrder}.{ext}   (service-role only writes)
--   avatars:               {userId}/avatar-{ts}.{ext}       (public bucket)
--   message-attachments:  {conversationId}/{file}

update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
  where id in ('listing-images', 'avatars', 'listing-360-frames', 'message-attachments');

-- listing-images / listing-360-frames ---------------------------------------
-- Mirrors the visibility already established for the listing_images /
-- listing_360_frames *metadata* tables (see "... viewable for active or
-- owner" / "Owners can manage ..." policies in
-- 20260902130000_organization_locations_and_billing.sql): active listings
-- are public, a personal listing's owner or an org listing's authorized
-- member can see/manage it, and a buyer can see what they purchased. Those
-- helper functions are already GRANT EXECUTE'd to anon/authenticated;
-- public.has_role() is not, so it cannot be called directly from a storage
-- policy (only from inside other SECURITY DEFINER functions).
--
-- Path convention: listing-images is {uploaderId}/{listingId}/{file} — the
-- uploader is whoever's session made the request (the seller for a personal
-- listing, any authorized org member for an org listing), not necessarily
-- listings.seller_id. listing-360-frames is {listingId}/{frameOrder}.{ext}
-- and is only ever written by service-role (capture-token flow, no user
-- session — see uploadVehicle360Frame), so it needs no write policy here.

create policy listing_images_read
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'listing-images'
    and exists (
      select 1 from public.listings l
      where l.id::text = split_part(storage.objects.name, '/', 2)
        and (
          l.status = 'active'
          or (l.organization_id is null and l.seller_id = auth.uid())
          or (
            l.organization_id is not null
            and public.can_view_organization_listing(
              l.organization_id, l.organization_location_id, l.seller_id, auth.uid()
            )
          )
          or exists (
            select 1 from public.listing_sales s
            where s.listing_id = l.id and s.buyer_id = auth.uid()
          )
        )
    )
  );

create policy listing_images_write
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-images'
    and split_part(name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from public.listings l
      where l.id::text = split_part(name, '/', 2)
        and (
          (l.organization_id is null and l.seller_id = auth.uid())
          or (
            l.organization_id is not null
            and public.can_update_organization_listing(
              l.organization_id, l.organization_location_id, l.seller_id,
              l.status, l.category_id, auth.uid()
            )
          )
        )
    )
  );

create policy listing_images_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and split_part(name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from public.listings l
      where l.id::text = split_part(name, '/', 2)
        and (
          (l.organization_id is null and l.seller_id = auth.uid())
          or (
            l.organization_id is not null
            and public.can_update_organization_listing(
              l.organization_id, l.organization_location_id, l.seller_id,
              l.status, l.category_id, auth.uid()
            )
          )
        )
    )
  );

create policy listing_360_frames_read
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'listing-360-frames'
    and exists (
      select 1 from public.listings l
      where l.id::text = split_part(storage.objects.name, '/', 1)
        and (
          l.status = 'active'
          or (l.organization_id is null and l.seller_id = auth.uid())
          or (
            l.organization_id is not null
            and public.can_view_organization_listing(
              l.organization_id, l.organization_location_id, l.seller_id, auth.uid()
            )
          )
          or exists (
            select 1 from public.listing_sales s
            where s.listing_id = l.id and s.buyer_id = auth.uid()
          )
        )
    )
  );

-- avatars -----------------------------------------------------------------
-- Public bucket (branding-style read), but writes are owner-only.

create policy avatars_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

create policy avatars_owner_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

create policy avatars_owner_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

create policy avatars_owner_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

-- message-attachments -------------------------------------------------------
-- Only the two conversation participants may read or write.

create policy message_attachments_participant_read
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id::text = split_part(storage.objects.name, '/', 1)
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

create policy message_attachments_participant_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id::text = split_part(name, '/', 1)
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );
