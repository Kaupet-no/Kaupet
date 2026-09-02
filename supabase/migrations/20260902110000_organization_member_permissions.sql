ALTER TABLE public.organization_members
  ADD COLUMN listing_access text NOT NULL DEFAULT 'own'
    CHECK (listing_access IN ('own', 'all')),
  ADD COLUMN chat_access text NOT NULL DEFAULT 'own'
    CHECK (chat_access IN ('own', 'all')),
  ADD COLUMN can_create_listings boolean NOT NULL DEFAULT true,
  ADD COLUMN listing_edit_scope text NOT NULL DEFAULT 'own'
    CHECK (listing_edit_scope IN ('none', 'own', 'all')),
  ADD COLUMN category_access text NOT NULL DEFAULT 'all'
    CHECK (category_access IN ('all', 'restricted')),

-- Existing ordinary members keep today's behavior. Superusers already had full access.
UPDATE public.organization_members
SET listing_access = 'all',
    chat_access = 'all',
    can_create_listings = true,
    listing_edit_scope = 'all',
    category_access = 'all'
WHERE role = 'superuser';
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_permission_combinations CHECK (
    (role <> 'superuser' OR (
      listing_access = 'all'
      AND chat_access = 'all'
      AND can_create_listings
      AND listing_edit_scope = 'all'
      AND category_access = 'all'
    ))
    AND (listing_edit_scope <> 'all' OR listing_access = 'all')
    AND (can_create_listings OR category_access = 'all')
  );

CREATE TABLE public.organization_member_categories (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, category_id),
  FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_members(organization_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX organization_member_categories_category_idx
  ON public.organization_member_categories (category_id);

ALTER TABLE public.organization_member_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_member_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organization_member_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_member_categories TO service_role;

CREATE POLICY organization_member_categories_self_or_superuser_select
  ON public.organization_member_categories FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_organization_superuser(organization_id, auth.uid())
  );

CREATE OR REPLACE FUNCTION public.can_view_organization_listing(
  _organization_id uuid,
  _seller_id uuid,
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
        AND (m.listing_access = 'all' OR m.user_id = _seller_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_create_organization_listing(
  _organization_id uuid,
  _category_id uuid,
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
        AND m.can_create_listings
        AND public.organization_has_proff_access(_organization_id)
        AND (
          m.category_access = 'all'
          OR _category_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.organization_member_categories mc
            WHERE mc.organization_id = m.organization_id
              AND mc.user_id = m.user_id
              AND mc.category_id = _category_id
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_update_organization_listing(
  _organization_id uuid,
  _seller_id uuid,
  _status public.listing_status,
  _category_id uuid,
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
        AND (
          m.listing_edit_scope = 'all'
          OR (m.listing_edit_scope = 'own' AND m.user_id = _seller_id)
          OR (
            _status = 'draft'::public.listing_status
            AND m.user_id = _seller_id
            AND public.can_create_organization_listing(_organization_id, _category_id, _user_id)
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_organization_chat(
  _organization_id uuid,
  _seller_id uuid,
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
        AND (m.chat_access = 'all' OR m.user_id = _seller_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_organization_listing(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_create_organization_listing(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_update_organization_listing(uuid, uuid, public.listing_status, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_organization_chat(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_organization_listing(uuid, uuid, uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_organization_listing(uuid, uuid, uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_update_organization_listing(uuid, uuid, public.listing_status, uuid, uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_organization_chat(uuid, uuid, uuid)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_organization_listing_category_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.role() = 'service_role' OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
  THEN
    IF NOT public.can_create_organization_listing(
      NEW.organization_id,
      NEW.category_id,
      auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not authorized for this listing category';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_organization_listing_category_permission()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER listings_enforce_organization_category_permission
  BEFORE INSERT OR UPDATE OF category_id, organization_id, seller_id ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_listing_category_permission();

CREATE OR REPLACE FUNCTION public.update_organization_member_permissions(
  _organization_id uuid,
  _user_id uuid,
  _role text,
  _listing_access text,
  _chat_access text,
  _can_create_listings boolean,
  _listing_edit_scope text,
  _category_access text,
  _allowed_category_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _current_role text;
  _current_status text;
  _active_superusers integer;
  _category_count integer;
BEGIN
  IF _caller IS NULL
    OR NOT public.is_organization_superuser(_organization_id, _caller)
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT public.organization_has_proff_access(_organization_id) THEN
    RAISE EXCEPTION 'Proff access is required';
  END IF;

  IF _role NOT IN ('superuser', 'member')
    OR _listing_access NOT IN ('own', 'all')
    OR _chat_access NOT IN ('own', 'all')
    OR _listing_edit_scope NOT IN ('none', 'own', 'all')
    OR _category_access NOT IN ('all', 'restricted')
    OR (_listing_edit_scope = 'all' AND _listing_access <> 'all')
    OR (NOT _can_create_listings AND _category_access <> 'all')
    OR (_role = 'superuser' AND NOT (
      _listing_access = 'all'
      AND _chat_access = 'all'
      AND _can_create_listings
      AND _listing_edit_scope = 'all'
      AND _category_access = 'all'
    ))
  THEN
    RAISE EXCEPTION 'Invalid organization member permissions';
  END IF;

  IF _category_access = 'restricted' AND COALESCE(cardinality(_allowed_category_ids), 0) = 0 THEN
    RAISE EXCEPTION 'At least one category is required';
  END IF;

  IF _category_access = 'restricted' THEN
    SELECT count(*) INTO _category_count
    FROM public.categories
    WHERE id = ANY(_allowed_category_ids);
    IF _category_count <> COALESCE(cardinality(_allowed_category_ids), 0) THEN
      RAISE EXCEPTION 'One or more categories are invalid';
    END IF;
  END IF;

  SELECT role, status
  INTO _current_role, _current_status
  FROM public.organization_members
  WHERE organization_id = _organization_id
    AND user_id = _user_id
  FOR UPDATE;

  IF _current_role IS NULL THEN
    RAISE EXCEPTION 'Organization member not found';
  END IF;

  IF _current_role = 'superuser'
    AND _role = 'member'
    AND _current_status = 'active'
  THEN
    SELECT count(*) INTO _active_superusers
    FROM public.organization_members
    WHERE organization_id = _organization_id
      AND role = 'superuser'
      AND status = 'active';
    IF _active_superusers <= 1 THEN
      RAISE EXCEPTION 'Organization must keep an active superuser';
    END IF;
  END IF;

  UPDATE public.organization_members
  SET role = _role,
      listing_access = _listing_access,
      chat_access = _chat_access,
      can_create_listings = _can_create_listings,
      listing_edit_scope = _listing_edit_scope,
      category_access = _category_access
  WHERE organization_id = _organization_id
    AND user_id = _user_id;

  DELETE FROM public.organization_member_categories
  WHERE organization_id = _organization_id
    AND user_id = _user_id;

  IF _category_access = 'restricted' THEN
    INSERT INTO public.organization_member_categories (organization_id, user_id, category_id)
    SELECT _organization_id, _user_id, category_id
    FROM unnest(_allowed_category_ids) AS category_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_organization_member_permissions(
  uuid, uuid, text, text, text, boolean, text, text, uuid[]
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_organization_member_permissions(
  uuid, uuid, text, text, text, boolean, text, text, uuid[]
) TO authenticated;

ALTER POLICY "Active listings are viewable by everyone"
  ON public.listings
  USING (
    status = 'active'::public.listing_status
    OR (organization_id IS NULL AND auth.uid() = seller_id)
    OR (
      organization_id IS NOT NULL
      AND public.can_view_organization_listing(organization_id, seller_id, auth.uid())
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
        AND public.can_create_organization_listing(organization_id, category_id, auth.uid())
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
      AND public.can_update_organization_listing(
        organization_id,
        seller_id,
        status,
        category_id,
        auth.uid()
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
      AND public.can_update_organization_listing(
        organization_id,
        seller_id,
        status,
        category_id,
        auth.uid()
      )
    )
  );

ALTER POLICY "Users can delete their own listings"
  ON public.listings
  USING (
    (organization_id IS NULL AND auth.uid() = seller_id)
    OR (
      organization_id IS NOT NULL
      AND public.can_update_organization_listing(
        organization_id,
        seller_id,
        status,
        category_id,
        auth.uid()
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
          OR (l.organization_id IS NULL AND l.seller_id = auth.uid())
          OR (
            l.organization_id IS NOT NULL
            AND public.can_view_organization_listing(l.organization_id, l.seller_id, auth.uid())
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
          OR (l.organization_id IS NULL AND l.seller_id = auth.uid())
          OR (
            l.organization_id IS NOT NULL
            AND public.can_view_organization_listing(l.organization_id, l.seller_id, auth.uid())
          )
        )
    )
  );

ALTER POLICY "Owners can manage listing 360 frames"
  ON public.listing_360_frames
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_360_frames.listing_id
        AND (
          (l.organization_id IS NULL AND l.seller_id = auth.uid())
          OR (
            l.organization_id IS NOT NULL
            AND public.can_update_organization_listing(
              l.organization_id, l.seller_id, l.status, l.category_id, auth.uid()
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_360_frames.listing_id
        AND (
          (l.organization_id IS NULL AND l.seller_id = auth.uid())
          OR (
            l.organization_id IS NOT NULL
            AND public.can_update_organization_listing(
              l.organization_id, l.seller_id, l.status, l.category_id, auth.uid()
            )
          )
        )
    )
  );

ALTER POLICY "Owners can manage listing images"
  ON public.listing_images
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_images.listing_id
        AND (
          (l.organization_id IS NULL AND l.seller_id = auth.uid())
          OR (
            l.organization_id IS NOT NULL
            AND public.can_update_organization_listing(
              l.organization_id, l.seller_id, l.status, l.category_id, auth.uid()
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_images.listing_id
        AND (
          (l.organization_id IS NULL AND l.seller_id = auth.uid())
          OR (
            l.organization_id IS NOT NULL
            AND public.can_update_organization_listing(
              l.organization_id, l.seller_id, l.status, l.category_id, auth.uid()
            )
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
        AND public.can_access_organization_chat(l.organization_id, l.seller_id, auth.uid())
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
        AND public.can_access_organization_chat(l.organization_id, l.seller_id, auth.uid())
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
        AND public.can_access_organization_chat(l.organization_id, l.seller_id, auth.uid())
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
              AND public.can_access_organization_chat(l.organization_id, l.seller_id, auth.uid())
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
              AND public.can_access_organization_chat(l.organization_id, l.seller_id, auth.uid())
          )
        )
    )
  );

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
      AND public.can_access_organization_chat(l.organization_id, l.seller_id, _uid)
  ) THEN
    IF NEW.buyer_last_read_at IS DISTINCT FROM OLD.buyer_last_read_at THEN
      RAISE EXCEPTION 'Organization user cannot update buyer_last_read_at';
    END IF;
    IF NEW.buyer_deleted_at IS DISTINCT FROM OLD.buyer_deleted_at THEN
      RAISE EXCEPTION 'Organization user cannot update buyer_deleted_at';
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
