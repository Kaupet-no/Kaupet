-- Business accounts, organization entitlements and ownership boundaries.
-- This migration is append-only: existing private-account columns and policies
-- remain intact, while the policies below add the organization branch.

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_number text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  postal_code text,
  city text,
  selected_plan text,
  proff_trial_started_at timestamptz,
  proff_trial_ends_at timestamptz,
  proff_trial_cancelled_at timestamptz,
  proff_access_until timestamptz,
  website_url text,
  logo_path text,
  brand_palette text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_organization_number_format
    CHECK (organization_number ~ '^[0-9]{9}$'),
  CONSTRAINT organizations_postal_code_format
    CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{4}$'),
  CONSTRAINT organizations_selected_plan_check
    CHECK (selected_plan IS NULL OR selected_plan IN ('proff_basis', 'proff')),
  CONSTRAINT organizations_brand_palette_check
    CHECK (brand_palette IS NULL OR brand_palette IN ('forest', 'navy', 'burgundy', 'slate')),
  CONSTRAINT organizations_trial_timestamps_check
    CHECK (
      (proff_trial_started_at IS NULL AND proff_trial_ends_at IS NULL)
      OR (
        proff_trial_started_at IS NOT NULL
        AND proff_trial_ends_at IS NOT NULL
        AND proff_trial_ends_at >= proff_trial_started_at
        AND (
          proff_trial_cancelled_at IS NULL
          OR proff_trial_cancelled_at >= proff_trial_started_at
        )
      )
    ),
  CONSTRAINT organizations_access_timestamp_check
    CHECK (
      proff_access_until IS NULL
      OR proff_trial_started_at IS NULL
      OR proff_access_until >= proff_trial_started_at
    )
);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('superuser', 'member')),
  status text NOT NULL CHECK (status IN ('invited', 'active', 'deactivated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT organization_members_user_unique UNIQUE (user_id)
);

CREATE INDEX organization_members_organization_status_idx
  ON public.organization_members (organization_id, status, role);

CREATE TRIGGER organization_members_set_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.business_signup_intents (
  signup_token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_number text NOT NULL,
  legal_name text NOT NULL,
  postal_code text,
  city text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  CONSTRAINT business_signup_intents_organization_number_format
    CHECK (organization_number ~ '^[0-9]{9}$'),
  CONSTRAINT business_signup_intents_postal_code_format
    CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{4}$'),
  CONSTRAINT business_signup_intents_email_normalized
    CHECK (email IS NULL OR email = lower(trim(email)))
);
CREATE OR REPLACE FUNCTION public.cleanup_expired_business_signup_intents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.business_signup_intents
  WHERE expires_at <= now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_business_signup_intents()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER business_signup_intents_cleanup_expired
  BEFORE INSERT ON public.business_signup_intents
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_expired_business_signup_intents();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_signup_intents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organizations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.organization_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_signup_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organizations TO anon, authenticated;
GRANT SELECT ON TABLE public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_signup_intents TO service_role;


ALTER TABLE public.listings
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX listings_organization_id_idx
  ON public.listings (organization_id);

-- An organization is owned by its membership, not by client-supplied listing
-- fields. Ownership transfers set a transaction-local flag in the trusted
-- transfer functions below; all client updates remain immutable.
CREATE OR REPLACE FUNCTION public.prevent_listing_ownership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('kaupet.organization_ownership_transfer', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  THEN
    RAISE EXCEPTION 'Listing ownership cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_listing_ownership_change()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER listings_prevent_ownership_change
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_listing_ownership_change();

CREATE OR REPLACE FUNCTION public.organization_has_proff_access(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = _organization_id
      AND o.selected_plan = 'proff'
      AND o.proff_access_until IS NOT NULL
      AND now() < o.proff_access_until
  );
$$;

CREATE OR REPLACE FUNCTION public.is_organization_superuser(
  _organization_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = _organization_id
      AND m.user_id = _user_id
      AND m.role = 'superuser'
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_act_for_organization(
  _organization_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_organization_superuser(_organization_id, _user_id)
    OR EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = _organization_id
        AND m.user_id = _user_id
        AND m.role = 'member'
        AND m.status = 'active'
        AND public.organization_has_proff_access(_organization_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.sync_organization_entitlements(_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_access boolean;
BEGIN
  IF auth.uid() IS NOT NULL
    AND auth.role() <> 'service_role'
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE organization_id = _organization_id
        AND user_id = auth.uid()
        AND status = 'active'
    )
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM 1
  FROM public.organizations
  WHERE id = _organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  _has_access := public.organization_has_proff_access(_organization_id);

  IF _has_access THEN
    UPDATE public.organization_members
    SET status = 'active', updated_at = now()
    WHERE organization_id = _organization_id
      AND role = 'member'
      AND status = 'deactivated';
  ELSE
    UPDATE public.organization_members
    SET status = 'deactivated', updated_at = now()
    WHERE organization_id = _organization_id
      AND role = 'member'
      AND status = 'active';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.organization_has_proff_access(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_organization_superuser(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_act_for_organization(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_organization_entitlements(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organization_has_proff_access(uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_organization_superuser(uuid, uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_act_for_organization(uuid, uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_organization_entitlements(uuid)
  TO authenticated, service_role;
CREATE POLICY organizations_public_select
  ON public.organizations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY organization_members_self_or_superuser_select
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_organization_superuser(organization_id, auth.uid())
  );

-- This is the single transaction boundary used when a member is removed by an
-- administrator: transfer all organization listings, then remove membership.
CREATE OR REPLACE FUNCTION public.remove_organization_member(
  _organization_id uuid,
  _user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _member_role text;
  _superuser_id uuid;
BEGIN
  IF _caller IS NULL
    OR NOT public.is_organization_superuser(_organization_id, _caller)
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT public.organization_has_proff_access(_organization_id) THEN
    RAISE EXCEPTION 'Proff access is required';
  END IF;

  SELECT role
  INTO _member_role
  FROM public.organization_members
  WHERE organization_id = _organization_id
    AND user_id = _user_id
  FOR UPDATE;

  IF _member_role IS NULL OR _member_role <> 'member' THEN
    RAISE EXCEPTION 'Only ordinary organization members can be removed';
  END IF;

  SELECT user_id
  INTO _superuser_id
  FROM public.organization_members
  WHERE organization_id = _organization_id
    AND role = 'superuser'
    AND status = 'active'
  FOR UPDATE;

  IF _superuser_id IS NULL THEN
    RAISE EXCEPTION 'Organization has no active superuser';
  END IF;

  PERFORM set_config('kaupet.organization_ownership_transfer', 'on', true);
  UPDATE public.listings
  SET seller_id = _superuser_id
  WHERE organization_id = _organization_id
    AND seller_id = _user_id;
  PERFORM set_config('kaupet.organization_ownership_transfer', 'off', true);

  DELETE FROM public.organization_members
  WHERE organization_id = _organization_id
    AND user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_organization_member(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.remove_organization_member(uuid, uuid)
  TO authenticated;

-- Preserve the private listing policies and add an explicit organization
-- branch. A private listing cannot be created by a user with an active
-- organization membership, and the organization_id is always membership-
-- checked rather than trusted from the client.
ALTER POLICY "Active listings are viewable by everyone"
  ON public.listings
  USING (
    status = 'active'::public.listing_status
    OR (
      organization_id IS NULL
      AND auth.uid() = seller_id
    )
    OR (
      organization_id IS NOT NULL
      AND (
        public.is_organization_superuser(organization_id, auth.uid())
        OR (
          auth.uid() = seller_id
          AND public.can_act_for_organization(organization_id, auth.uid())
        )
      )
    )
  );

ALTER POLICY "Users can insert their own listings"
  ON public.listings
  WITH CHECK (
    auth.uid() = seller_id
    AND (
      (
        organization_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.organization_members m
          WHERE m.user_id = auth.uid()
            AND m.status = 'active'
        )
      )
      OR (
        organization_id IS NOT NULL
        AND public.can_act_for_organization(organization_id, auth.uid())
      )
    )
  );

ALTER POLICY "Users can update their own listings"
  ON public.listings
  USING (
    (
      organization_id IS NULL
      AND auth.uid() = seller_id
      AND status <> 'disabled'::public.listing_status
    )
    OR (
      organization_id IS NOT NULL
      AND (
        public.is_organization_superuser(organization_id, auth.uid())
        OR (
          auth.uid() = seller_id
          AND public.can_act_for_organization(organization_id, auth.uid())
          AND status <> 'disabled'::public.listing_status
        )
      )
    )
  )
  WITH CHECK (
    (
      organization_id IS NULL
      AND auth.uid() = seller_id
      AND status <> 'disabled'::public.listing_status
    )
    OR (
      organization_id IS NOT NULL
      AND (
        public.is_organization_superuser(organization_id, auth.uid())
        OR (
          auth.uid() = seller_id
          AND public.can_act_for_organization(organization_id, auth.uid())
          AND status <> 'disabled'::public.listing_status
        )
      )
    )
  );

ALTER POLICY "Users can delete their own listings"
  ON public.listings
  USING (
    (
      organization_id IS NULL
      AND auth.uid() = seller_id
    )
    OR (
      organization_id IS NOT NULL
      AND (
        public.is_organization_superuser(organization_id, auth.uid())
        OR (
          auth.uid() = seller_id
          AND public.can_act_for_organization(organization_id, auth.uid())
        )
      )
    )
  );


ALTER POLICY "Listing 360 frames viewable for active or owner"
  ON public.listing_360_frames
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_360_frames.listing_id
        AND (
          l.status = 'active'::public.listing_status
          OR (
            l.organization_id IS NULL
            AND l.seller_id = auth.uid()
          )
          OR (
            l.organization_id IS NOT NULL
            AND (
              public.is_organization_superuser(l.organization_id, auth.uid())
              OR (
                l.seller_id = auth.uid()
                AND public.can_act_for_organization(l.organization_id, auth.uid())
              )
            )
          )
        )
    )
  );

ALTER POLICY "Listing images viewable for active or owner"
  ON public.listing_images
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_images.listing_id
        AND (
          l.status = 'active'::public.listing_status
          OR (
            l.organization_id IS NULL
            AND l.seller_id = auth.uid()
          )
          OR (
            l.organization_id IS NOT NULL
            AND (
              public.is_organization_superuser(l.organization_id, auth.uid())
              OR (
                l.seller_id = auth.uid()
                AND public.can_act_for_organization(l.organization_id, auth.uid())
              )
            )
          )
        )
    )
  );

ALTER POLICY "Owners can manage listing 360 frames"
  ON public.listing_360_frames
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_360_frames.listing_id
        AND (
          (
            l.seller_id = auth.uid()
            AND (
              l.organization_id IS NULL
              OR public.can_act_for_organization(l.organization_id, auth.uid())
            )
          )
          OR (
            l.organization_id IS NOT NULL
            AND public.is_organization_superuser(l.organization_id, auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_360_frames.listing_id
        AND (
          (
            l.seller_id = auth.uid()
            AND (
              l.organization_id IS NULL
              OR public.can_act_for_organization(l.organization_id, auth.uid())
            )
          )
          OR (
            l.organization_id IS NOT NULL
            AND public.is_organization_superuser(l.organization_id, auth.uid())
          )
        )
    )
  );

ALTER POLICY "Owners can manage listing images"
  ON public.listing_images
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_images.listing_id
        AND (
          (
            l.seller_id = auth.uid()
            AND (
              l.organization_id IS NULL
              OR public.can_act_for_organization(l.organization_id, auth.uid())
            )
          )
          OR (
            l.organization_id IS NOT NULL
            AND public.is_organization_superuser(l.organization_id, auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_images.listing_id
        AND (
          (
            l.seller_id = auth.uid()
            AND (
              l.organization_id IS NULL
              OR public.can_act_for_organization(l.organization_id, auth.uid())
            )
          )
          OR (
            l.organization_id IS NOT NULL
            AND public.is_organization_superuser(l.organization_id, auth.uid())
          )
        )
    )
  );

ALTER POLICY "Participants can view conversations"
  ON public.conversations
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = seller_id
    OR EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = conversations.listing_id
        AND l.organization_id IS NOT NULL
        AND public.is_organization_superuser(l.organization_id, auth.uid())
    )
  );

ALTER POLICY "Participants can update conversations"
  ON public.conversations
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = seller_id
    OR EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = conversations.listing_id
        AND l.organization_id IS NOT NULL
        AND public.is_organization_superuser(l.organization_id, auth.uid())
    )
  )
  WITH CHECK (
    auth.uid() = buyer_id
    OR auth.uid() = seller_id
    OR EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = conversations.listing_id
        AND l.organization_id IS NOT NULL
        AND public.is_organization_superuser(l.organization_id, auth.uid())
    )
  );

ALTER POLICY "Participants can view messages"
  ON public.messages
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (
          c.buyer_id = auth.uid()
          OR c.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.listings l
            WHERE l.id = c.listing_id
              AND l.organization_id IS NOT NULL
              AND public.is_organization_superuser(l.organization_id, auth.uid())
          )
        )
    )
  );

ALTER POLICY "Participants can send messages"
  ON public.messages
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (
          c.buyer_id = auth.uid()
          OR c.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.listings l
            WHERE l.id = c.listing_id
              AND l.organization_id IS NOT NULL
              AND public.is_organization_superuser(l.organization_id, auth.uid())
          )
        )
    )
  );

-- The current conversation trigger protects participant-owned read/trash
-- fields. Extend it for the superuser's seller-side view without allowing the
-- superuser to rewrite participants, listing identity, or creation time.
CREATE OR REPLACE FUNCTION public.enforce_conversation_read_status_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
    OR NEW.wtb_listing_id IS DISTINCT FROM OLD.wtb_listing_id
    OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only last_message_at, read status and trash status may be updated by participants';
  END IF;

  IF _uid = OLD.buyer_id THEN
    IF NEW.seller_last_read_at IS DISTINCT FROM OLD.seller_last_read_at THEN
      RAISE EXCEPTION 'Buyer cannot update seller_last_read_at';
    END IF;
    IF NEW.seller_deleted_at IS DISTINCT FROM OLD.seller_deleted_at THEN
      RAISE EXCEPTION 'Buyer cannot update seller_deleted_at';
    END IF;

    IF NEW.buyer_deleted_at IS DISTINCT FROM OLD.buyer_deleted_at THEN
      IF OLD.buyer_deleted_at IS NULL AND NEW.buyer_deleted_at IS NOT NULL THEN
        NEW.buyer_deleted_at := statement_timestamp();
      ELSIF OLD.buyer_deleted_at IS NOT NULL AND NEW.buyer_deleted_at IS NULL THEN
        IF OLD.buyer_deleted_at < statement_timestamp() - interval '14 days' THEN
          RAISE EXCEPTION 'Conversation can no longer be restored';
        END IF;
      ELSE
        RAISE EXCEPTION 'buyer_deleted_at cannot be changed once set; restore the conversation first';
      END IF;
    END IF;
  ELSIF _uid = OLD.seller_id THEN
    IF NEW.buyer_last_read_at IS DISTINCT FROM OLD.buyer_last_read_at THEN
      RAISE EXCEPTION 'Seller cannot update buyer_last_read_at';
    END IF;
    IF NEW.buyer_deleted_at IS DISTINCT FROM OLD.buyer_deleted_at THEN
      RAISE EXCEPTION 'Seller cannot update buyer_deleted_at';
    END IF;

    IF NEW.seller_deleted_at IS DISTINCT FROM OLD.seller_deleted_at THEN
      IF OLD.seller_deleted_at IS NULL AND NEW.seller_deleted_at IS NOT NULL THEN
        NEW.seller_deleted_at := statement_timestamp();
      ELSIF OLD.seller_deleted_at IS NOT NULL AND NEW.seller_deleted_at IS NULL THEN
        IF OLD.seller_deleted_at < statement_timestamp() - interval '14 days' THEN
          RAISE EXCEPTION 'Conversation can no longer be restored';
        END IF;
      ELSE
        RAISE EXCEPTION 'seller_deleted_at cannot be changed once set; restore the conversation first';
      END IF;
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = OLD.listing_id
      AND l.organization_id IS NOT NULL
      AND public.is_organization_superuser(l.organization_id, _uid)
  ) THEN
    IF NEW.buyer_last_read_at IS DISTINCT FROM OLD.buyer_last_read_at THEN
      RAISE EXCEPTION 'Organization superuser cannot update buyer_last_read_at';
    END IF;
    IF NEW.buyer_deleted_at IS DISTINCT FROM OLD.buyer_deleted_at THEN
      RAISE EXCEPTION 'Organization superuser cannot update buyer_deleted_at';
    END IF;

    IF NEW.seller_deleted_at IS DISTINCT FROM OLD.seller_deleted_at THEN
      IF OLD.seller_deleted_at IS NULL AND NEW.seller_deleted_at IS NOT NULL THEN
        NEW.seller_deleted_at := statement_timestamp();
      ELSIF OLD.seller_deleted_at IS NOT NULL AND NEW.seller_deleted_at IS NULL THEN
        IF OLD.seller_deleted_at < statement_timestamp() - interval '14 days' THEN
          RAISE EXCEPTION 'Conversation can no longer be restored';
        END IF;
      ELSE
        RAISE EXCEPTION 'seller_deleted_at cannot be changed once set; restore the conversation first';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Public branding is intentionally readable; write/delete are restricted to
-- an active organization superuser with effective Proff access.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'organization-logos',
  'organization-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;


CREATE POLICY organization_logos_public_read
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'organization-logos');

CREATE POLICY organization_logos_superuser_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'organization-logos'
    AND position('/' IN name) > 1
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id::text = split_part(storage.objects.name, '/', 1)
        AND public.is_organization_superuser(o.id, auth.uid())
        AND public.organization_has_proff_access(o.id)
    )
  );

CREATE POLICY organization_logos_superuser_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'organization-logos'
    AND position('/' IN name) > 1
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id::text = split_part(storage.objects.name, '/', 1)
        AND public.is_organization_superuser(o.id, auth.uid())
        AND public.organization_has_proff_access(o.id)
    )
  )
  WITH CHECK (
    bucket_id = 'organization-logos'
    AND position('/' IN name) > 1
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id::text = split_part(storage.objects.name, '/', 1)
        AND public.is_organization_superuser(o.id, auth.uid())
        AND public.organization_has_proff_access(o.id)
    )
  );

CREATE POLICY organization_logos_superuser_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'organization-logos'
    AND position('/' IN name) > 1
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id::text = split_part(storage.objects.name, '/', 1)
        AND public.is_organization_superuser(o.id, auth.uid())
        AND public.organization_has_proff_access(o.id)
    )
  );

-- The trigger keeps private signup behavior byte-for-byte equivalent for users
-- without business_signup_token. A valid token is consumed in the same auth
-- transaction that creates the profile, organization and first membership.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _token_value text := NEW.raw_user_meta_data->>'business_signup_token';
  _token uuid;
  _intent public.business_signup_intents%ROWTYPE;
  _normalized_email text := lower(trim(COALESCE(NEW.email, '')));
  _organization_id uuid;
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  IF _token_value IS NULL OR btrim(_token_value) = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    _token := _token_value::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Ugyldig registreringslenke';
  END;

  DELETE FROM public.business_signup_intents
  WHERE expires_at <= now();

  SELECT *
  INTO _intent
  FROM public.business_signup_intents
  WHERE signup_token = _token
  FOR UPDATE;

  IF NOT FOUND OR _intent.expires_at <= now() THEN
    RAISE EXCEPTION 'Registreringslenken er utløpt eller ugyldig';
  END IF;

  IF _intent.email IS NULL OR _intent.email <> _normalized_email THEN
    RAISE EXCEPTION 'E-postadressen stemmer ikke med registreringslenken';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE organization_number = _intent.organization_number
  ) THEN
    RAISE EXCEPTION 'Denne bedriften er allerede registrert';
  END IF;

  INSERT INTO public.organizations (
    organization_number,
    legal_name,
    display_name,
    postal_code,
    city
  )
  VALUES (
    _intent.organization_number,
    _intent.legal_name,
    _intent.legal_name,
    _intent.postal_code,
    _intent.city
  )
  RETURNING id INTO _organization_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (_organization_id, NEW.id, 'superuser', 'active');

  DELETE FROM public.business_signup_intents
  WHERE signup_token = _token;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated, service_role;

-- Account deletion keeps existing email confirmation and seven-day archive,
-- while refusing to destroy a superuser's organization ownership prematurely.
CREATE OR REPLACE FUNCTION public.request_account_deletion(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _actual_email text;
  _membership public.organization_members%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _actual_email FROM auth.users WHERE id = _uid;
  IF _actual_email IS NULL OR lower(_actual_email) <> lower(trim(_email)) THEN
    RAISE EXCEPTION 'E-postadressen stemmer ikke';
  END IF;

  SELECT *
  INTO _membership
  FROM public.organization_members
  WHERE user_id = _uid;

  IF FOUND AND _membership.role = 'superuser'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = _membership.organization_id
        AND m.user_id <> _uid
        AND m.status IN ('invited', 'active')
    )
  THEN
    RAISE EXCEPTION 'Superbrukeren kan ikke slettes før øvrige bedriftsmedlemmer er fjernet';
  END IF;

  UPDATE public.listings
  SET status = 'archived'
  WHERE seller_id = _uid AND status <> 'archived';

  INSERT INTO public.account_deletions (user_id, confirmation_email)
  VALUES (_uid, _actual_email)
  ON CONFLICT (user_id) DO UPDATE
    SET requested_at = now(),
        scheduled_purge_at = now() + interval '7 days',
        confirmation_email = EXCLUDED.confirmation_email;
END;
$$;

-- Permanent purge transfers ordinary members' organization listings to the
-- superuser and removes a superuser's organization only when no active/invited
-- members remain. All existing private purge hardening is retained.
CREATE OR REPLACE FUNCTION public.purge_expired_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _row record;
  _membership public.organization_members%ROWTYPE;
  _superuser_id uuid;
BEGIN
  FOR _row IN
    SELECT user_id
    FROM public.account_deletions
    WHERE scheduled_purge_at <= now()
  LOOP
    SELECT *
    INTO _membership
    FROM public.organization_members
    WHERE user_id = _row.user_id
    FOR UPDATE;

    IF FOUND AND _membership.organization_id IS NOT NULL THEN
      PERFORM 1
      FROM public.organizations
      WHERE id = _membership.organization_id
      FOR UPDATE;

      IF _membership.role = 'superuser' THEN
        IF EXISTS (
          SELECT 1
          FROM public.organization_members m
          WHERE m.organization_id = _membership.organization_id
            AND m.user_id <> _row.user_id
            AND m.status IN ('invited', 'active')
        ) THEN
          RAISE EXCEPTION 'Superuser organization still has members';
        END IF;

        DELETE FROM public.organizations
        WHERE id = _membership.organization_id;
      ELSE
        _superuser_id := NULL;
        SELECT user_id
        INTO _superuser_id
        FROM public.organization_members
        WHERE organization_id = _membership.organization_id
          AND role = 'superuser'
          AND status = 'active'
        LIMIT 1;

        IF _superuser_id IS NULL THEN
          RAISE EXCEPTION 'Organization has no active superuser';
        END IF;

        PERFORM set_config('kaupet.organization_ownership_transfer', 'on', true);
        UPDATE public.listings
        SET seller_id = _superuser_id
        WHERE organization_id = _membership.organization_id
          AND seller_id = _row.user_id;
        PERFORM set_config('kaupet.organization_ownership_transfer', 'off', true);
      END IF;
    END IF;

    DELETE FROM public.wtb_listings WHERE user_id = _row.user_id;
    DELETE FROM public.listings
    WHERE seller_id = _row.user_id
      AND organization_id IS NULL;

    UPDATE public.profiles
    SET display_name = 'Slettet bruker',
        avatar_url = NULL,
        deleted_at = now(),
        updated_at = now()
    WHERE id = _row.user_id;

    DELETE FROM auth.users WHERE id = _row.user_id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_export_user_data(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id;

  _result := jsonb_build_object(
    'generated_at', now(), 'generated_by_admin_id', auth.uid(), 'user_id', _user_id,
    'auth', (SELECT jsonb_build_object(
      'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at, 'user_metadata', u.raw_user_meta_data
    ) FROM auth.users u WHERE u.id = _user_id),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _user_id),
    'roles', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.user_roles r WHERE r.user_id = _user_id), '[]'::jsonb),
    'listings', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) || jsonb_build_object(
        'images', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order) FROM public.listing_images i WHERE i.listing_id = l.id), '[]'::jsonb),
        'frames_360', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.frame_order) FROM public.listing_360_frames f WHERE f.listing_id = l.id), '[]'::jsonb)
      )) FROM public.listings l WHERE l.seller_id = _user_id
    ), '[]'::jsonb),
    'organization_memberships', COALESCE((
      SELECT jsonb_agg(to_jsonb(m))
      FROM public.organization_members m
      WHERE m.user_id = _user_id
    ), '[]'::jsonb),
    'organizations', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(o) || jsonb_build_object(
          'membership', (
            SELECT to_jsonb(m)
            FROM public.organization_members m
            WHERE m.organization_id = o.id AND m.user_id = _user_id
          ),
          'listings', COALESCE((
            SELECT jsonb_agg(to_jsonb(l))
            FROM public.listings l
            WHERE l.organization_id = o.id
          ), '[]'::jsonb)
        )
      )
      FROM public.organizations o
      WHERE EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = o.id AND m.user_id = _user_id
      )
    ), '[]'::jsonb),
    'want_to_buy_listings', COALESCE((SELECT jsonb_agg(to_jsonb(w)) FROM public.wtb_listings w WHERE w.user_id = _user_id), '[]'::jsonb),
    'capture_sessions_360', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.listing_360_capture_sessions s WHERE s.created_by = _user_id), '[]'::jsonb),
    'favorites', COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM public.favorites f WHERE f.user_id = _user_id), '[]'::jsonb),
    'conversations', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.conversations c WHERE c.buyer_id = _user_id OR c.seller_id = _user_id), '[]'::jsonb),
    'messages', COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM public.messages m WHERE m.sender_id = _user_id OR m.conversation_id IN (SELECT c.id FROM public.conversations c WHERE c.buyer_id = _user_id OR c.seller_id = _user_id)), '[]'::jsonb),
    'reviews_given', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.user_reviews r WHERE r.reviewer_id = _user_id), '[]'::jsonb),
    'reviews_received', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.user_reviews r WHERE r.reviewee_id = _user_id), '[]'::jsonb),
    'reports', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.reports r WHERE r.reporter_id = _user_id OR r.reported_user_id = _user_id OR r.resolved_by = _user_id), '[]'::jsonb),
    'blocks', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM public.user_blocks b WHERE b.blocker_id = _user_id OR b.blocked_id = _user_id), '[]'::jsonb),
    'saved_searches', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.saved_searches s WHERE s.user_id = _user_id), '[]'::jsonb),
    'saved_search_notifications', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.saved_search_notifications n WHERE n.user_id = _user_id), '[]'::jsonb),
    'want_to_buy_match_notifications', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.wtb_match_notifications n WHERE n.user_id = _user_id), '[]'::jsonb),
    'favorite_price_drops', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.favorite_price_drops n WHERE n.user_id = _user_id), '[]'::jsonb),
    'favorite_sold_notifications', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.favorite_sold_notifications n WHERE n.user_id = _user_id), '[]'::jsonb),
    'sales', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.listing_sales s WHERE s.buyer_id = _user_id OR s.seller_id = _user_id), '[]'::jsonb),
    'promotions', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.listing_promotions p WHERE p.user_id = _user_id OR p.granted_by = _user_id), '[]'::jsonb),
    'feedback', COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM public.feedback f WHERE f.user_id = _user_id), '[]'::jsonb),
    'vehicle_lookup_log', COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM public.vehicle_lookup_log v WHERE v.user_id = _user_id), '[]'::jsonb),
    'notification_preferences', (SELECT to_jsonb(n) FROM public.notification_preferences n WHERE n.user_id = _user_id),
    'push_subscriptions', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.push_subscriptions p WHERE p.user_id = _user_id), '[]'::jsonb),
    'system_messages', COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM public.system_messages m WHERE m.recipient_id = _user_id), '[]'::jsonb),
    'error_log', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM public.error_log e WHERE e.user_id = _user_id), '[]'::jsonb),
    'moderation', jsonb_build_object(
      'bans', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM public.user_bans b WHERE b.user_id = _user_id), '[]'::jsonb),
      'suspensions', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.user_suspensions s WHERE s.user_id = _user_id), '[]'::jsonb),
      'admin_actions', COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM public.admin_moderation_log l WHERE (l.target_type = 'user' AND l.target_id = _user_id::text) OR l.admin_id = _user_id), '[]'::jsonb)
    ),
    'account_deletion', (SELECT to_jsonb(a) FROM public.account_deletions a WHERE a.user_id = _user_id)
  );

  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'export_user_data', 'user', _user_id::text, COALESCE(_email, ''));

  RETURN _result;
END;
$$;

-- Keep all existing function hardening after CREATE OR REPLACE and expose only
-- the already-admin/authenticated RPC contracts.
REVOKE EXECUTE ON FUNCTION public.request_account_deletion(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text)
  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.purge_expired_accounts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_accounts()
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_export_user_data(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_export_user_data(uuid)
  TO authenticated, service_role;

-- Listing creation remains available to authenticated private and business
-- sellers; the code generator itself is safe and SECURITY DEFINER.
GRANT EXECUTE ON FUNCTION public.generate_kaupet_code() TO authenticated;
