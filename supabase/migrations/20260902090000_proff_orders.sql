-- Proff subscription orders (phase 0: invoices are created manually in Fiken).
-- Kept out of public.organizations on purpose: that table is world-readable via
-- organizations_public_select (USING (true)), and billing data is not public.

CREATE TABLE public.proff_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  term text NOT NULL CHECK (term IN ('monthly', 'yearly')),
  price_ex_vat_nok integer NOT NULL CHECK (price_ex_vat_nok >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invoiced', 'paid', 'cancelled')),
  billing_email text NOT NULL,
  billing_reference text,
  fiken_invoice_number text,
  period_start timestamptz,
  period_end timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proff_orders_billing_email_normalized
    CHECK (billing_email = lower(trim(billing_email))),
  CONSTRAINT proff_orders_period_check
    CHECK (
      (period_start IS NULL AND period_end IS NULL)
      OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end > period_start)
    )
);

CREATE INDEX proff_orders_status_idx ON public.proff_orders (status, created_at DESC);
CREATE INDEX proff_orders_organization_idx ON public.proff_orders (organization_id, created_at DESC);

-- One open order per organization; paid/cancelled history is unlimited.
CREATE UNIQUE INDEX proff_orders_one_open_per_org
  ON public.proff_orders (organization_id)
  WHERE status IN ('pending', 'invoiced');

CREATE TRIGGER proff_orders_set_updated_at
  BEFORE UPDATE ON public.proff_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.proff_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.proff_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.proff_orders TO service_role;

-- Extends Proff access by a whole term. Stacks on remaining access instead of
-- truncating it, and never moves the date backwards. Returns the new period so
-- the caller can record it on the order.
CREATE OR REPLACE FUNCTION public.extend_proff_access(_organization_id uuid, _months integer)
RETURNS TABLE (period_start timestamptz, period_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _start timestamptz;
  _end timestamptz;
BEGIN
  IF _months IS NULL OR _months <= 0 OR _months > 24 THEN
    RAISE EXCEPTION 'Invalid term length';
  END IF;

  UPDATE public.organizations
  SET selected_plan = 'proff',
      proff_trial_cancelled_at = NULL,
      proff_access_until = greatest(now(), coalesce(proff_access_until, now()))
        + make_interval(months => _months)
  WHERE id = _organization_id
  RETURNING
    proff_access_until - make_interval(months => _months),
    proff_access_until
  INTO _start, _end;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown organization';
  END IF;

  PERFORM public.sync_organization_entitlements(_organization_id);
  RETURN QUERY SELECT _start, _end;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_proff_access(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_proff_access(uuid, integer) TO service_role;
