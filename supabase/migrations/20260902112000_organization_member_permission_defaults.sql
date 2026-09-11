-- Superbrukere created after the permission columns were added must receive
-- the invariant full-access values before the permission check constraint runs.
CREATE OR REPLACE FUNCTION public.normalize_organization_member_permissions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'superuser' THEN
    NEW.listing_access := 'all';
    NEW.chat_access := 'all';
    NEW.can_create_listings := true;
    NEW.listing_edit_scope := 'all';
    NEW.category_access := 'all';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_organization_member_permissions()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS organization_members_normalize_permissions
  ON public.organization_members;
CREATE TRIGGER organization_members_normalize_permissions
  BEFORE INSERT OR UPDATE OF role, listing_access, chat_access, can_create_listings,
    listing_edit_scope, category_access
  ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.normalize_organization_member_permissions();
