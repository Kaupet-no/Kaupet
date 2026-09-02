-- The location-scoped contracts are live in 20260902130000. Remove the
-- superseded organization-wide address and permission columns only after the
-- application has moved to organization_locations and its memberships.

DROP TRIGGER IF EXISTS organization_members_normalize_permissions
  ON public.organization_members;
DROP FUNCTION IF EXISTS public.normalize_organization_member_permissions();
DROP TRIGGER IF EXISTS organizations_clear_coordinates
  ON public.organizations;
DROP FUNCTION IF EXISTS public.clear_organization_coordinates_on_address_change();

DROP TRIGGER IF EXISTS listings_enforce_organization_category_permission
  ON public.listings;
DROP FUNCTION IF EXISTS public.update_organization_member_permissions(
  uuid, uuid, text, text, text, boolean, text, text, uuid[]
);
DROP FUNCTION IF EXISTS public.can_view_organization_listing(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.can_create_organization_listing(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.can_update_organization_listing(
  uuid, uuid, public.listing_status, uuid, uuid
);
DROP FUNCTION IF EXISTS public.can_access_organization_chat(uuid, uuid, uuid);

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_permission_combinations,
  DROP COLUMN IF EXISTS listing_access,
  DROP COLUMN IF EXISTS chat_access,
  DROP COLUMN IF EXISTS listing_edit_scope;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS postal_code,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS lat,
  DROP COLUMN IF EXISTS lng;
