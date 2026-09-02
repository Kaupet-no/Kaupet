-- Idempotent, server-owned rows for Proff bulk listing imports.
CREATE TABLE public.organization_listing_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_id uuid NOT NULL,
  external_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'created', 'failed')),
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, import_id, external_id)
);

CREATE INDEX organization_listing_imports_organization_idx
  ON public.organization_listing_imports (organization_id, created_at DESC);

CREATE TRIGGER organization_listing_imports_set_updated_at
  BEFORE UPDATE ON public.organization_listing_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organization_listing_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_listing_imports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_listing_imports TO service_role;

CREATE POLICY organization_listing_imports_member_select
  ON public.organization_listing_imports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = organization_listing_imports.organization_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );
GRANT SELECT ON TABLE public.organization_listing_imports TO authenticated;

-- Reservation and listing insertion share one transaction. The exception block
-- rolls back only the listing insert, after which the reservation is marked failed.
CREATE OR REPLACE FUNCTION public.create_listing_from_import_row(
  _organization_id uuid,
  _user_id uuid,
  _import_id uuid,
  _external_id text,
  _listing jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reservation public.organization_listing_imports%ROWTYPE;
  _listing_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;

  INSERT INTO public.organization_listing_imports (
    organization_id, user_id, import_id, external_id, status
  ) VALUES (
    _organization_id, _user_id, _import_id, trim(_external_id), 'processing'
  )
  ON CONFLICT (organization_id, import_id, external_id) DO NOTHING;

  SELECT * INTO _reservation
  FROM public.organization_listing_imports
  WHERE organization_id = _organization_id
    AND import_id = _import_id
    AND external_id = trim(_external_id)
  FOR UPDATE;

  IF _reservation.status = 'created' THEN
    RETURN jsonb_build_object('status', 'duplicate', 'listing_id', _reservation.listing_id);
  END IF;
  IF _reservation.status = 'processing' AND _reservation.user_id <> _user_id THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;
  IF _reservation.status = 'failed' THEN
    RETURN jsonb_build_object('status', 'failed', 'error', 'Raden feilet ved forrige forsøk.');
  END IF;

  BEGIN
    IF NOT public.organization_has_proff_access(_organization_id) THEN
      RAISE EXCEPTION 'Proff access is required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = _organization_id
        AND user_id = _user_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    INSERT INTO public.listings (
      seller_id, organization_id, title, subtitle, description, category_id,
      condition, is_free, price_nok, postal_code, city, lat, lng, can_ship,
      known_issues, no_known_issues, maintenance_history, attributes,
      status, published_at
    ) VALUES (
      _user_id,
      _organization_id,
      _listing->>'title',
      NULLIF(_listing->>'subtitle', ''),
      _listing->>'description',
      (_listing->>'category_id')::uuid,
      NULLIF(_listing->>'condition', '')::public.listing_condition,
      COALESCE((_listing->>'is_free')::boolean, false),
      NULLIF(_listing->>'price_nok', '')::integer,
      NULLIF(_listing->>'postal_code', ''),
      NULLIF(_listing->>'city', ''),
      NULLIF(_listing->>'lat', '')::double precision,
      NULLIF(_listing->>'lng', '')::double precision,
      NULLIF(_listing->>'can_ship', '')::boolean,
      NULLIF(_listing->>'known_issues', ''),
      COALESCE((_listing->>'no_known_issues')::boolean, false),
      NULLIF(_listing->>'maintenance_history', ''),
      COALESCE(_listing->'attributes', '{}'::jsonb),
      'active',
      now()
    ) RETURNING id INTO _listing_id;

    UPDATE public.organization_listing_imports
    SET status = 'created', listing_id = _listing_id, error_code = NULL
    WHERE id = _reservation.id;
    RETURN jsonb_build_object('status', 'created', 'listing_id', _listing_id);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.organization_listing_imports
    SET status = 'failed', error_code = 'listing_insert_failed'
    WHERE id = _reservation.id;
    RETURN jsonb_build_object('status', 'failed', 'error', 'Annonsen kunne ikke opprettes. Kontroller feltene.');
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.create_listing_from_import_row(uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_listing_from_import_row(uuid, uuid, uuid, text, jsonb)
  TO service_role;
