-- Business locations, private billing data, location-scoped permissions and address snapshots.
-- Append-only replacement for the organization-wide address/scope contracts.

ALTER TABLE public.business_signup_intents
  ADD COLUMN IF NOT EXISTS visiting_address_line text,
  ADD COLUMN IF NOT EXISTS visiting_postal_code text,
  ADD COLUMN IF NOT EXISTS visiting_city text,
  ADD COLUMN IF NOT EXISTS billing_address_line text,
  ADD COLUMN IF NOT EXISTS billing_postal_code text,
  ADD COLUMN IF NOT EXISTS billing_city text;

ALTER TABLE public.business_signup_intents
  DROP CONSTRAINT IF EXISTS business_signup_intents_postal_code_format;
ALTER TABLE public.business_signup_intents
  ADD CONSTRAINT business_signup_intents_visiting_postal_code_format
    CHECK (visiting_postal_code IS NULL OR visiting_postal_code ~ '^[0-9]{4}$'),
  ADD CONSTRAINT business_signup_intents_billing_postal_code_format
    CHECK (billing_postal_code IS NULL OR billing_postal_code ~ '^[0-9]{4}$');

CREATE TABLE public.organization_billing_profiles (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  billing_email text NOT NULL,
  address_line text,
  postal_code text,
  city text,
  registry_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_billing_profiles_email_normalized
    CHECK (billing_email = lower(trim(billing_email))),
  CONSTRAINT organization_billing_profiles_postal_code_format
    CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{4}$')
);
CREATE TRIGGER organization_billing_profiles_set_updated_at
  BEFORE UPDATE ON public.organization_billing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.organization_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address_line text,
  postal_code text,
  city text,
  lat double precision,
  lng double precision,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_locations_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT organization_locations_postal_code_format CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{4}$'),
  CONSTRAINT organization_locations_address_pair CHECK (
    address_line IS NULL
    OR (postal_code IS NOT NULL AND city IS NOT NULL)
  ),
  CONSTRAINT organization_locations_id_organization_unique UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX organization_locations_one_default
  ON public.organization_locations (organization_id) WHERE is_default;
CREATE INDEX organization_locations_organization_idx
  ON public.organization_locations (organization_id, active, is_default);
CREATE TRIGGER organization_locations_set_updated_at
  BEFORE UPDATE ON public.organization_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.organization_location_members (
  location_id uuid NOT NULL REFERENCES public.organization_locations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.organization_members(user_id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'manager')),
  listing_access text NOT NULL DEFAULT 'own' CHECK (listing_access IN ('own', 'all')),
  listing_edit_scope text NOT NULL DEFAULT 'own' CHECK (listing_edit_scope IN ('none', 'own', 'all')),
  chat_access text NOT NULL DEFAULT 'own' CHECK (chat_access IN ('own', 'all')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, user_id),
  FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_members(organization_id, user_id) ON DELETE CASCADE,
  CONSTRAINT organization_location_members_location_organization_fk
    FOREIGN KEY (location_id, organization_id)
    REFERENCES public.organization_locations(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT organization_location_members_permission_combinations CHECK (
    (listing_edit_scope <> 'all' OR listing_access = 'all')
  )
);
CREATE INDEX organization_location_members_user_idx
  ON public.organization_location_members (user_id, location_id);
CREATE TRIGGER organization_location_members_set_updated_at
  BEFORE UPDATE ON public.organization_location_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_organization_location_member_permissions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'manager' THEN
    NEW.listing_access := 'all';
    NEW.listing_edit_scope := 'all';
    NEW.chat_access := 'all';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organization_location_members_normalize_permissions
  BEFORE INSERT OR UPDATE OF role, listing_access, listing_edit_scope, chat_access
  ON public.organization_location_members
  FOR EACH ROW EXECUTE FUNCTION public.normalize_organization_location_member_permissions();

CREATE TABLE public.organization_location_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL UNIQUE REFERENCES public.organization_locations(id) ON DELETE CASCADE,
  unit_price_ex_vat_nok integer NOT NULL DEFAULT 249 CHECK (unit_price_ex_vat_nok = 249),
  billing_interval_months integer NOT NULL DEFAULT 1 CHECK (billing_interval_months IN (1, 12)),
  next_period_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER organization_location_subscriptions_set_updated_at
  BEFORE UPDATE ON public.organization_location_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.organization_location_charge_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.organization_location_subscriptions(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  amount_ex_vat_nok integer NOT NULL CHECK (amount_ex_vat_nok = 249 OR amount_ex_vat_nok = 2988),
  fiken_invoice_number text,
  invoiced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, period_start)
);
CREATE INDEX organization_location_charge_periods_due_idx
  ON public.organization_location_charge_periods (invoiced_at, period_start);

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS organization_location_id uuid REFERENCES public.organization_locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS show_visiting_address boolean NOT NULL DEFAULT false;
CREATE INDEX listings_organization_location_idx
  ON public.listings (organization_location_id);

CREATE TABLE public.listing_visiting_addresses (
  listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  address_line text NOT NULL,
  postal_code text NOT NULL CHECK (postal_code ~ '^[0-9]{4}$'),
  city text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(m.organization_id::text, ', ' ORDER BY m.organization_id)
  INTO missing
  FROM (
    SELECT DISTINCT m.organization_id
    FROM public.organization_members m
    LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.role = 'superuser' AND m.status = 'active'
      AND (u.email IS NULL OR length(trim(u.email)) = 0)
  ) m;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot backfill billing email for organizations: %', missing;
  END IF;
END;
$$;

INSERT INTO public.organization_billing_profiles (organization_id, billing_email, address_line, postal_code, city)
SELECT o.id, lower(trim(u.email)), NULL, o.postal_code, o.city
FROM public.organizations o
JOIN LATERAL (
  SELECT m.user_id
  FROM public.organization_members m
  WHERE m.organization_id = o.id AND m.status IN ('active', 'invited')
  ORDER BY m.created_at ASC
  LIMIT 1
) first_member ON true
JOIN auth.users u ON u.id = first_member.user_id
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO public.organization_locations (organization_id, name, address_line, postal_code, city, lat, lng, is_default)
SELECT o.id, 'Hovedlokasjon', NULL, o.postal_code, o.city, o.lat, o.lng, true
FROM public.organizations o
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_location_members (
  location_id, user_id, organization_id, role, listing_access, listing_edit_scope, chat_access
)
SELECT l.id, m.user_id, m.organization_id,
       CASE WHEN m.role = 'superuser' THEN 'manager' ELSE 'member' END,
       CASE WHEN m.role = 'superuser' THEN 'all' ELSE m.listing_access END,
       CASE WHEN m.role = 'superuser' THEN 'all' ELSE m.listing_edit_scope END,
       CASE WHEN m.role = 'superuser' THEN 'all' ELSE m.chat_access END
FROM public.organization_locations l
JOIN public.organization_members m ON m.organization_id = l.organization_id
WHERE l.is_default
ON CONFLICT (location_id, user_id) DO NOTHING;

UPDATE public.listings l
SET organization_location_id = loc.id
FROM public.organization_locations loc
WHERE l.organization_id = loc.organization_id
  AND loc.is_default
  AND l.organization_id IS NOT NULL
  AND l.organization_location_id IS NULL;

INSERT INTO public.organization_location_subscriptions (location_id, billing_interval_months, next_period_start)
SELECT l.id,
       CASE WHEN order_row.term = 'yearly' THEN 12 ELSE 1 END,
       CASE
         WHEN o.proff_access_until IS NOT NULL AND o.proff_access_until > now() THEN o.proff_access_until
         ELSE date_trunc('month', now()) + interval '1 month'
       END
FROM public.organization_locations l
JOIN public.organizations o ON o.id = l.organization_id
LEFT JOIN LATERAL (
  SELECT po.term
  FROM public.proff_orders po
  WHERE po.organization_id = o.id AND po.status IN ('pending', 'invoiced', 'paid')
  ORDER BY po.created_at DESC
  LIMIT 1
) order_row ON true
WHERE NOT l.is_default
ON CONFLICT (location_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_manage_organization_location(
  _location_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_locations l
    JOIN public.organization_members m ON m.organization_id = l.organization_id AND m.user_id = _user_id
    LEFT JOIN public.organization_location_members lm ON lm.location_id = l.id AND lm.user_id = _user_id
    WHERE l.id = _location_id AND l.active AND m.status = 'active'
      AND (m.role = 'superuser' OR (lm.role = 'manager'))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_organization_listing(
  _organization_id uuid,
  _location_id uuid,
  _seller_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_organization_superuser(_organization_id, _user_id)
    OR EXISTS (
      SELECT 1
      FROM public.organization_location_members lm
      JOIN public.organization_members m ON m.organization_id = _organization_id AND m.user_id = _user_id
      WHERE lm.location_id = _location_id AND lm.user_id = _user_id
        AND lm.organization_id = _organization_id AND lm.role IN ('member', 'manager')
        AND m.status = 'active'
        AND public.organization_has_proff_access(_organization_id)
        AND (lm.listing_access = 'all' OR _seller_id = _user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_create_organization_listing(
  _organization_id uuid,
  _location_id uuid,
  _category_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_organization_superuser(_organization_id, _user_id)
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
  SELECT public.is_organization_superuser(_organization_id, _user_id)
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
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_organization_chat(
  _organization_id uuid,
  _location_id uuid,
  _seller_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_organization_superuser(_organization_id, _user_id)
    OR EXISTS (
      SELECT 1
      FROM public.organization_location_members lm
      JOIN public.organization_members m ON m.organization_id = _organization_id AND m.user_id = _user_id
      WHERE lm.location_id = _location_id AND lm.user_id = _user_id
        AND lm.organization_id = _organization_id AND m.status = 'active'
        AND public.organization_has_proff_access(_organization_id)
        AND (lm.role = 'manager' OR lm.chat_access = 'all' OR _seller_id = _user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_organization_location(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_organization_listing(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_create_organization_listing(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_update_organization_listing(uuid, uuid, uuid, public.listing_status, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_organization_chat(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_organization_location(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_organization_listing(uuid, uuid, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_organization_listing(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_update_organization_listing(uuid, uuid, uuid, public.listing_status, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_organization_chat(uuid, uuid, uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.organization_billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_location_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_location_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_location_charge_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_visiting_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_billing_profiles, public.organization_locations,
  public.organization_location_members, public.organization_location_subscriptions,
  public.organization_location_charge_periods, public.listing_visiting_addresses
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organization_locations, public.organization_location_members TO authenticated;
GRANT SELECT ON TABLE public.listing_visiting_addresses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

CREATE POLICY organization_locations_member_select ON public.organization_locations
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = organization_locations.organization_id AND m.user_id = auth.uid() AND m.status = 'active')
  );
CREATE POLICY organization_locations_manager_update ON public.organization_locations
  FOR UPDATE TO authenticated USING (public.can_manage_organization_location(id, auth.uid()))
  WITH CHECK (public.can_manage_organization_location(id, auth.uid()));
CREATE POLICY organization_location_members_member_select ON public.organization_location_members
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.can_manage_organization_location(location_id, auth.uid())
  );
CREATE POLICY organization_location_members_manager_write ON public.organization_location_members
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_organization_location(location_id, auth.uid()));
CREATE POLICY organization_location_members_manager_update ON public.organization_location_members
  FOR UPDATE TO authenticated USING (public.can_manage_organization_location(location_id, auth.uid()))
  WITH CHECK (public.can_manage_organization_location(location_id, auth.uid()));
CREATE POLICY organization_location_members_manager_delete ON public.organization_location_members
  FOR DELETE TO authenticated USING (public.can_manage_organization_location(location_id, auth.uid()));
CREATE POLICY organization_billing_profiles_superuser_select ON public.organization_billing_profiles
  FOR SELECT TO authenticated USING (public.is_organization_superuser(organization_id, auth.uid()));
CREATE POLICY organization_location_subscriptions_superuser_select ON public.organization_location_subscriptions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.organization_locations l WHERE l.id = location_id AND public.is_organization_superuser(l.organization_id, auth.uid()))
  );
CREATE POLICY organization_location_charge_periods_superuser_select ON public.organization_location_charge_periods
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.organization_location_subscriptions s JOIN public.organization_locations l ON l.id = s.location_id WHERE s.id = subscription_id AND public.is_organization_superuser(l.organization_id, auth.uid()))
  );
CREATE POLICY listing_visiting_addresses_public_select ON public.listing_visiting_addresses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_visiting_addresses.listing_id
        AND ((l.status = 'active'::public.listing_status AND l.show_visiting_address)
          OR (l.organization_id IS NOT NULL AND public.can_view_organization_listing(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())))
    )
  );

ALTER POLICY "Active listings are viewable by everyone" ON public.listings
  USING (
    status = 'active'::public.listing_status
    OR (organization_id IS NULL AND auth.uid() = seller_id)
    OR (organization_id IS NOT NULL AND public.can_view_organization_listing(organization_id, organization_location_id, seller_id, auth.uid()))
  );
ALTER POLICY "Users can insert their own listings" ON public.listings
  WITH CHECK (
    auth.uid() = seller_id AND (
      (organization_id IS NULL AND organization_location_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.status = 'active'))
      OR (organization_id IS NOT NULL AND public.can_create_organization_listing(organization_id, organization_location_id, category_id, auth.uid()))
    )
  );
ALTER POLICY "Users can update their own listings" ON public.listings
  USING (
    (organization_id IS NULL AND organization_location_id IS NULL AND auth.uid() = seller_id AND status <> 'disabled'::public.listing_status)
    OR (organization_id IS NOT NULL AND public.can_update_organization_listing(organization_id, organization_location_id, seller_id, status, category_id, auth.uid()))
  )
  WITH CHECK (
    (organization_id IS NULL AND organization_location_id IS NULL AND auth.uid() = seller_id AND status <> 'disabled'::public.listing_status)
    OR (organization_id IS NOT NULL AND public.can_update_organization_listing(organization_id, organization_location_id, seller_id, status, category_id, auth.uid()))
  );
ALTER POLICY "Users can delete their own listings" ON public.listings
  USING (
    (organization_id IS NULL AND organization_location_id IS NULL AND auth.uid() = seller_id)
    OR (organization_id IS NOT NULL AND public.can_update_organization_listing(organization_id, organization_location_id, seller_id, status, category_id, auth.uid()))
  );

ALTER POLICY "Listing 360 frames viewable for active or owner" ON public.listing_360_frames
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_360_frames.listing_id AND (l.status = 'active'::public.listing_status OR (l.organization_id IS NULL AND l.seller_id = auth.uid()) OR (l.organization_id IS NOT NULL AND public.can_view_organization_listing(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())))));
ALTER POLICY "Listing images viewable for active or owner" ON public.listing_images
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_images.listing_id AND (l.status = 'active'::public.listing_status OR (l.organization_id IS NULL AND l.seller_id = auth.uid()) OR (l.organization_id IS NOT NULL AND public.can_view_organization_listing(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())))));
ALTER POLICY "Owners can manage listing 360 frames" ON public.listing_360_frames
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_360_frames.listing_id AND ((l.organization_id IS NULL AND l.seller_id = auth.uid()) OR (l.organization_id IS NOT NULL AND public.can_update_organization_listing(l.organization_id, l.organization_location_id, l.seller_id, l.status, l.category_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_360_frames.listing_id AND ((l.organization_id IS NULL AND l.seller_id = auth.uid()) OR (l.organization_id IS NOT NULL AND public.can_update_organization_listing(l.organization_id, l.organization_location_id, l.seller_id, l.status, l.category_id, auth.uid())))));
ALTER POLICY "Owners can manage listing images" ON public.listing_images
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_images.listing_id AND ((l.organization_id IS NULL AND l.seller_id = auth.uid()) OR (l.organization_id IS NOT NULL AND public.can_update_organization_listing(l.organization_id, l.organization_location_id, l.seller_id, l.status, l.category_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_images.listing_id AND ((l.organization_id IS NULL AND l.seller_id = auth.uid()) OR (l.organization_id IS NOT NULL AND public.can_update_organization_listing(l.organization_id, l.organization_location_id, l.seller_id, l.status, l.category_id, auth.uid())))));

ALTER POLICY "Participants can view conversations" ON public.conversations
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR EXISTS (SELECT 1 FROM public.listings l WHERE l.id = conversations.listing_id AND l.organization_id IS NOT NULL AND public.can_access_organization_chat(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())));
ALTER POLICY "Participants can update conversations" ON public.conversations
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR EXISTS (SELECT 1 FROM public.listings l WHERE l.id = conversations.listing_id AND l.organization_id IS NOT NULL AND public.can_access_organization_chat(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())))
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id OR EXISTS (SELECT 1 FROM public.listings l WHERE l.id = conversations.listing_id AND l.organization_id IS NOT NULL AND public.can_access_organization_chat(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())));
ALTER POLICY "Participants can view messages" ON public.messages
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid() OR EXISTS (SELECT 1 FROM public.listings l WHERE l.id = c.listing_id AND l.organization_id IS NOT NULL AND public.can_access_organization_chat(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())))));
ALTER POLICY "Participants can send messages" ON public.messages
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid() OR EXISTS (SELECT 1 FROM public.listings l WHERE l.id = c.listing_id AND l.organization_id IS NOT NULL AND public.can_access_organization_chat(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())))));

ALTER TABLE public.listings
  ADD CONSTRAINT listings_organization_location_status_check CHECK (
    (organization_id IS NULL AND organization_location_id IS NULL)
    OR (organization_id IS NOT NULL AND (status = 'draft'::public.listing_status OR organization_location_id IS NOT NULL))
  );

CREATE OR REPLACE FUNCTION public.create_organization_location(
  _organization_id uuid, _name text, _address_line text, _postal_code text, _city text
)
RETURNS public.organization_locations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.organization_locations; _interval integer := 1; _next timestamptz;
BEGIN
  IF NOT public.is_organization_superuser(_organization_id, auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 OR _address_line IS NULL OR length(trim(_address_line)) = 0 OR _postal_code !~ '^[0-9]{4}$' OR _city IS NULL OR length(trim(_city)) = 0 THEN RAISE EXCEPTION 'Invalid location'; END IF;
  SELECT CASE WHEN po.term = 'yearly' THEN 12 ELSE 1 END INTO _interval FROM public.proff_orders po WHERE po.organization_id = _organization_id AND po.status IN ('pending', 'invoiced', 'paid') ORDER BY po.created_at DESC LIMIT 1;
  _next := (SELECT CASE WHEN proff_access_until > now() THEN proff_access_until ELSE date_trunc('month', now()) + interval '1 month' END FROM public.organizations WHERE id = _organization_id);
  INSERT INTO public.organization_locations (organization_id, name, address_line, postal_code, city, is_default, active) VALUES (_organization_id, trim(_name), trim(_address_line), _postal_code, trim(_city), false, true) RETURNING * INTO _row;
  INSERT INTO public.organization_location_subscriptions (location_id, billing_interval_months, next_period_start) VALUES (_row.id, COALESCE(_interval, 1), _next);
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.create_organization_location(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_location(uuid, text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_organization_location_member_permissions(
  _location_id uuid, _user_id uuid, _role text, _listing_access text, _listing_edit_scope text, _chat_access text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _caller uuid := auth.uid(); _caller_role text; _target_role text; _target_status text;
BEGIN
  SELECT organization_id INTO _org FROM public.organization_locations WHERE id = _location_id AND active;
  IF _org IS NULL OR NOT public.can_manage_organization_location(_location_id, _caller) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT m.role INTO _caller_role FROM public.organization_members m WHERE m.organization_id = _org AND m.user_id = _caller AND m.status = 'active';
  SELECT m.role, m.status INTO _target_role, _target_status FROM public.organization_members m WHERE m.organization_id = _org AND m.user_id = _user_id;
  IF _target_role IS NULL OR _target_status <> 'active' OR (_caller_role <> 'superuser' AND _user_id = _caller) OR _role NOT IN ('member', 'manager') THEN RAISE EXCEPTION 'Invalid location member'; END IF;
  IF _caller_role <> 'superuser' AND _target_role <> 'member' THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.organization_location_members (location_id, organization_id, user_id, role, listing_access, listing_edit_scope, chat_access)
  VALUES (_location_id, _org, _user_id, _role, _listing_access, _listing_edit_scope, _chat_access)
  ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role, listing_access = EXCLUDED.listing_access, listing_edit_scope = EXCLUDED.listing_edit_scope, chat_access = EXCLUDED.chat_access, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_organization_location_member_permissions(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_organization_location_member_permissions(uuid, uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_organization_location_member(_location_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _caller uuid := auth.uid(); _remaining integer;
BEGIN
  SELECT organization_id INTO _org FROM public.organization_locations WHERE id = _location_id AND active;
  IF _org IS NULL OR NOT public.can_manage_organization_location(_location_id, _caller) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_locations WHERE id = _location_id AND is_default) THEN RAISE EXCEPTION 'Standardlokasjonen kan ikke miste tilordning'; END IF;
  DELETE FROM public.organization_location_members WHERE location_id = _location_id AND user_id = _user_id;
  SELECT count(*) INTO _remaining FROM public.organization_location_members lm JOIN public.organization_members m ON m.user_id = lm.user_id AND m.organization_id = _org WHERE lm.user_id = _user_id AND m.status = 'active';
  IF _remaining = 0 THEN RAISE EXCEPTION 'Aktiv bruker må ha minst én lokasjon'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_organization_location_member(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.remove_organization_location_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _token_value text := NEW.raw_user_meta_data->>'business_signup_token'; _token uuid; _intent public.business_signup_intents%ROWTYPE; _normalized_email text := lower(trim(COALESCE(NEW.email, ''))); _organization_id uuid; _location_id uuid;
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.raw_user_meta_data->>'avatar_url') ON CONFLICT (id) DO NOTHING;
  IF _token_value IS NULL OR btrim(_token_value) = '' THEN RETURN NEW; END IF;
  BEGIN _token := _token_value::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Ugyldig registreringslenke'; END;
  DELETE FROM public.business_signup_intents WHERE expires_at <= now();
  SELECT * INTO _intent FROM public.business_signup_intents WHERE signup_token = _token FOR UPDATE;
  IF NOT FOUND OR _intent.expires_at <= now() THEN RAISE EXCEPTION 'Registreringslenken er utløpt eller ugyldig'; END IF;
  IF _intent.email IS NULL OR _intent.email <> _normalized_email THEN RAISE EXCEPTION 'E-postadressen stemmer ikke med registreringslenken'; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE organization_number = _intent.organization_number) THEN RAISE EXCEPTION 'Denne bedriften er allerede registrert'; END IF;
  INSERT INTO public.organizations (organization_number, legal_name, display_name) VALUES (_intent.organization_number, _intent.legal_name, _intent.legal_name) RETURNING id INTO _organization_id;
  INSERT INTO public.organization_billing_profiles (organization_id, billing_email, address_line, postal_code, city, registry_refreshed_at) VALUES (_organization_id, _normalized_email, COALESCE(_intent.billing_address_line, _intent.visiting_address_line), COALESCE(_intent.billing_postal_code, _intent.visiting_postal_code), COALESCE(_intent.billing_city, _intent.visiting_city), now());
  INSERT INTO public.organization_locations (organization_id, name, address_line, postal_code, city, is_default) VALUES (_organization_id, 'Hovedlokasjon', _intent.visiting_address_line, _intent.visiting_postal_code, _intent.visiting_city, true) RETURNING id INTO _location_id;
  INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES (_organization_id, NEW.id, 'superuser', 'active');
  INSERT INTO public.organization_location_members (location_id, organization_id, user_id, role, listing_access, listing_edit_scope, chat_access) VALUES (_location_id, _organization_id, NEW.id, 'manager', 'all', 'all', 'all');
  DELETE FROM public.business_signup_intents WHERE signup_token = _token;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS organization_locations_manager_update ON public.organization_locations;
CREATE POLICY organization_locations_manager_update ON public.organization_locations
  FOR UPDATE TO authenticated USING (public.can_manage_organization_location(id, auth.uid()))
  WITH CHECK (public.can_manage_organization_location(id, auth.uid()));

CREATE OR REPLACE FUNCTION public.mark_organization_location_charge_invoiced(
  _subscription_id uuid,
  _period_start timestamptz,
  _fiken_invoice_number text
)
RETURNS public.organization_location_charge_periods
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _subscription public.organization_location_subscriptions%ROWTYPE;
DECLARE _period public.organization_location_charge_periods%ROWTYPE;
DECLARE _period_end timestamptz;
BEGIN
  SELECT * INTO _subscription
  FROM public.organization_location_subscriptions
  WHERE id = _subscription_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  _period_end := _period_start + make_interval(months => _subscription.billing_interval_months);
  INSERT INTO public.organization_location_charge_periods (
    subscription_id, period_start, period_end, amount_ex_vat_nok,
    fiken_invoice_number, invoiced_at
  ) VALUES (
    _subscription_id, _period_start, _period_end,
    _subscription.unit_price_ex_vat_nok * _subscription.billing_interval_months,
    NULLIF(trim(_fiken_invoice_number), ''), now()
  )
  ON CONFLICT (subscription_id, period_start) DO UPDATE
    SET fiken_invoice_number = COALESCE(public.organization_location_charge_periods.fiken_invoice_number, EXCLUDED.fiken_invoice_number),
        invoiced_at = COALESCE(public.organization_location_charge_periods.invoiced_at, EXCLUDED.invoiced_at)
  RETURNING * INTO _period;
  IF _subscription.next_period_start <= _period_start THEN
    UPDATE public.organization_location_subscriptions
    SET next_period_start = _period_end
    WHERE id = _subscription_id;
  END IF;
  RETURN _period;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_organization_location_charge_invoiced(uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_organization_location_charge_invoiced(uuid, timestamptz, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_listing_from_import_row(
  _organization_id uuid,
  _user_id uuid,
  _import_id uuid,
  _external_id text,
  _listing jsonb,
  _location_id uuid,
  _show_visiting_address boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _result jsonb; _listing_id uuid; _location public.organization_locations%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Server access required'; END IF;
  SELECT * INTO _location FROM public.organization_locations
  WHERE id = _location_id AND organization_id = _organization_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
  IF NOT public.can_create_organization_listing(_organization_id, _location_id, (_listing->>'category_id')::uuid, _user_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  _result := public.create_listing_from_import_row(
    _organization_id, _user_id, _import_id, _external_id,
    _listing || jsonb_build_object(
      'postal_code', COALESCE(_location.postal_code, ''),
      'city', COALESCE(_location.city, ''),
      'lat', _location.lat,
      'lng', _location.lng
    )
  );
  _listing_id := NULLIF(_result->>'listing_id', '')::uuid;
  IF _listing_id IS NOT NULL AND _result->>'status' = 'created' THEN
    UPDATE public.listings
    SET organization_location_id = _location_id,
        show_visiting_address = _show_visiting_address,
        postal_code = _location.postal_code,
        city = _location.city,
        lat = _location.lat,
        lng = _location.lng
    WHERE id = _listing_id;
    IF _show_visiting_address AND _location.address_line IS NOT NULL
      AND _location.postal_code IS NOT NULL AND _location.city IS NOT NULL THEN
      INSERT INTO public.listing_visiting_addresses(listing_id, address_line, postal_code, city)
      VALUES (_listing_id, _location.address_line, _location.postal_code, _location.city)
      ON CONFLICT (listing_id) DO UPDATE SET address_line = EXCLUDED.address_line, postal_code = EXCLUDED.postal_code, city = EXCLUDED.city;
    END IF;
  END IF;
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_listing_from_import_row(uuid, uuid, uuid, text, jsonb, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_listing_from_import_row(uuid, uuid, uuid, text, jsonb, uuid, boolean) TO service_role;
