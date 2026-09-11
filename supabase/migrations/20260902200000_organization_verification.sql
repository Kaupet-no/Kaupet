-- Anyone could register a business account for any Norwegian organization
-- number and become its superuser — nothing tied the registrant to the
-- actual company, and the only protection was "first to register". This
-- adds a minimum-viable gate: a newly registered organization starts
-- 'unverified' and cannot create or update (including publish) any listing
-- until an admin approves it. Existing organizations are grandfathered in as
-- 'verified' — this is about new registrations, not retroactively
-- disrupting live businesses. See docs/SIKKERHETSVURDERING.md M-4.

ALTER TABLE public.organizations
  ADD COLUMN verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified')),
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.organizations SET verification_status = 'verified', verified_at = now();

CREATE OR REPLACE FUNCTION public.organization_is_verified(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = _organization_id AND o.verification_status = 'verified'
  );
$$;

REVOKE ALL ON FUNCTION public.organization_is_verified(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organization_is_verified(uuid) TO anon, authenticated, service_role;

-- Wrap the full grant (superuser included — an unverified org's own
-- superuser must not be able to publish under the company name either) in
-- the verification check, same integration point organization_has_proff_access
-- already uses.
CREATE OR REPLACE FUNCTION public.can_create_organization_listing(
  _organization_id uuid,
  _location_id uuid,
  _category_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.organization_is_verified(_organization_id) AND (
    public.is_organization_superuser(_organization_id, _user_id)
    OR EXISTS (
      SELECT 1
      FROM public.organization_location_members lm
      JOIN public.organization_locations l ON l.id = lm.location_id
      JOIN public.organization_members m ON m.organization_id = _organization_id AND m.user_id = _user_id
      WHERE lm.location_id = _location_id AND lm.user_id = _user_id
        AND lm.organization_id = _organization_id AND l.active AND m.status = 'active'
        AND public.organization_has_proff_access(_organization_id)
        AND (
          m.can_create_listings
          AND (m.category_access = 'all' OR _category_id IS NULL OR EXISTS (
            SELECT 1 FROM public.organization_member_categories mc
            WHERE mc.organization_id = _organization_id AND mc.user_id = _user_id AND mc.category_id = _category_id
          ))
        )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_update_organization_listing(
  _organization_id uuid,
  _location_id uuid,
  _seller_id uuid,
  _status public.listing_status,
  _category_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.organization_is_verified(_organization_id) AND (
    public.is_organization_superuser(_organization_id, _user_id)
    OR EXISTS (
      SELECT 1
      FROM public.organization_location_members lm
      JOIN public.organization_locations l ON l.id = lm.location_id
      JOIN public.organization_members m ON m.organization_id = _organization_id AND m.user_id = _user_id
      WHERE lm.location_id = _location_id AND lm.user_id = _user_id
        AND lm.organization_id = _organization_id AND l.active AND m.status = 'active'
        AND public.organization_has_proff_access(_organization_id)
        AND (
          lm.role = 'manager'
          OR lm.listing_edit_scope = 'all'
          OR (lm.listing_edit_scope = 'own' AND _seller_id = _user_id)
          OR (_status = 'draft'::public.listing_status AND _seller_id = _user_id
            AND public.can_create_organization_listing(_organization_id, _location_id, _category_id, _user_id))
        )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_verify_organization(_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.organizations
    SET verification_status = 'verified', verified_at = now(), verified_by = auth.uid()
    WHERE id = _organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_organization(uuid) TO authenticated;
