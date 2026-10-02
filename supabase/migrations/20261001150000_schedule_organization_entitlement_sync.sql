-- requireOrganizationMember skal ikke lenger kjøre sync_organization_entitlements
-- (radlås + skriving) på hvert lesekall. Utløpt Proff-tilgang fanges i stedet
-- av denne planlagte jobben, som kun deaktiverer medlemmer. Reaktivering skjer
-- allerede på skrivestier (f.eks. extend_proff_access).
CREATE OR REPLACE FUNCTION public.sync_expired_organization_entitlements()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  FOR _org_id IN
    SELECT DISTINCT organization_id
    FROM public.organization_members
    WHERE role = 'member'
      AND status = 'active'
      AND NOT public.organization_has_proff_access(organization_id)
  LOOP
    PERFORM public.sync_organization_entitlements(_org_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_expired_organization_entitlements()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_expired_organization_entitlements()
  TO service_role;

SELECT cron.schedule('sync-organization-entitlements-10min', '*/10 * * * *', 'SELECT public.sync_expired_organization_entitlements();');
