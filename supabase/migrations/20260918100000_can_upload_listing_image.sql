-- R2-migreringen fjerner storage.objects-policyene for listing-images (RLS
-- finnes ikke i R2), så opplastingsautorisasjonen må gjenskapes som en
-- eksplisitt sjekk serverfunksjonen kan kalle. Denne funksjonen speiler
-- nøyaktig betingelsene i `listing_images_write`/`listing_images_delete`
-- (20260902150000_storage_bucket_policies.sql), minus path-sjekken — den er
-- serverfunksjonens ansvar siden nøkkelrommet ikke lenger er en storage-path.
create or replace function public.can_upload_listing_image(
  _listing_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.listings l
    where l.id = _listing_id
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
  );
$$;

revoke all on function public.can_upload_listing_image(uuid) from public, anon;
grant execute on function public.can_upload_listing_image(uuid) to authenticated;
