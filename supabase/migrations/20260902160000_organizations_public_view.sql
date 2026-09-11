-- organizations_public_select gave anon/authenticated unrestricted SELECT on
-- every column of every row, including commercial state (selected_plan,
-- proff_trial_*, proff_access_until) — anyone could dump the full customer
-- list with subscription status. See docs/SIKKERHETSVURDERING.md M-5.
--
-- Split the two concerns: the base table now requires membership (matching
-- how organization_members is already scoped), and a definer-privileged view
-- exposes only public-branding columns for every organization — the view's
-- column list is the security boundary here, not RLS, so it stays public on
-- purpose while the base table locks down to members.

DROP POLICY organizations_public_select ON public.organizations;

CREATE POLICY organizations_member_select
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.can_act_for_organization(id));

-- has_active_proff is a computed boolean, not the raw selected_plan /
-- proff_access_until columns: the public listing page needs to know whether
-- a business currently has Proff (it gates a "more from this business"
-- widget), but the exact plan value, expiry timestamp and trial history stay
-- member-only — that's the actual commercial data the finding is about.
CREATE VIEW public.organizations_public AS
  SELECT
    id,
    display_name,
    legal_name,
    organization_number,
    website_url,
    logo_path,
    brand_palette,
    created_at,
    (selected_plan = 'proff' AND proff_access_until IS NOT NULL AND proff_access_until > now())
      AS has_active_proff
  FROM public.organizations;

GRANT SELECT ON public.organizations_public TO anon, authenticated;
