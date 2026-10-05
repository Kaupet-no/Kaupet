-- Bestilling og gjenopptakelse må lykkes sammen. En avtale avsluttet av
-- Kaupet kan bestilles på nytt først etter at tilgangen er utløpt.
CREATE FUNCTION public.request_proff_subscription_order(
  _organization_id uuid,
  _requested_by uuid,
  _term text,
  _price_ex_vat_nok integer,
  _billing_email text,
  _billing_reference text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org public.organizations;
  _order_id uuid;
BEGIN
  SELECT * INTO STRICT _org FROM public.organizations
  WHERE id = _organization_id FOR UPDATE;

  IF _org.proff_ended_by_kaupet_at IS NOT NULL AND _org.proff_access_until > now() THEN
    RAISE EXCEPTION 'agreement_ended_by_kaupet';
  END IF;

  IF _org.proff_subscription_cancelled_at IS NOT NULL OR _org.proff_ended_by_kaupet_at IS NOT NULL THEN
    UPDATE public.organizations
    SET proff_subscription_cancelled_at = NULL, proff_ended_by_kaupet_at = NULL
    WHERE id = _organization_id;
  END IF;

  IF _org.proff_trial_started_at IS NULL THEN
    RETURN public.start_proff_trial_order(
      _organization_id, _requested_by, _term, _price_ex_vat_nok, _billing_email, _billing_reference
    );
  END IF;

  INSERT INTO public.proff_orders (
    organization_id, requested_by, term, price_ex_vat_nok, billing_email, billing_reference
  ) VALUES (
    _organization_id, _requested_by, _term, _price_ex_vat_nok, _billing_email, _billing_reference
  ) RETURNING id INTO _order_id;
  RETURN _order_id;
END
$$;
REVOKE ALL ON FUNCTION public.request_proff_subscription_order(uuid, uuid, text, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_proff_subscription_order(uuid, uuid, text, integer, text, text)
  TO service_role;

-- Betaling, tilgang og fakturaperiode lagres i én transaksjon. Ved feil
-- rulles også betalingsstatusen tilbake, slik at admin kan prøve igjen.
CREATE FUNCTION public.mark_proff_order_paid(
  _order_id uuid,
  _paid_on date,
  _fiken_invoice_number text DEFAULT NULL
) RETURNS TABLE (
  organization_id uuid,
  term text,
  fiken_invoice_number text,
  first_period boolean,
  period_start timestamptz,
  period_end timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.proff_orders;
  _org public.organizations;
  _organization_id uuid;
  _period record;
  _first_period boolean;
BEGIN
  IF _paid_on IS NULL OR char_length(_fiken_invoice_number) > 40 THEN
    RAISE EXCEPTION 'invalid_payment';
  END IF;

  -- Samme låserekkefølge som bestilling: organisasjon før faktura.
  SELECT po.organization_id INTO _organization_id FROM public.proff_orders po WHERE po.id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_payable'; END IF;
  SELECT * INTO STRICT _org FROM public.organizations WHERE id = _organization_id FOR UPDATE;
  SELECT * INTO STRICT _order FROM public.proff_orders WHERE id = _order_id FOR UPDATE;
  IF _order.status NOT IN ('pending', 'invoiced') THEN
    RAISE EXCEPTION 'order_not_payable';
  END IF;

  _first_period := NOT coalesce(
    _org.selected_plan = 'proff' AND _org.proff_access_until > now()
      AND (_org.proff_trial_ends_at IS NULL OR _org.proff_access_until > _org.proff_trial_ends_at),
    false
  );
  UPDATE public.proff_orders po
  SET status = 'paid', paid_on = _paid_on,
      fiken_invoice_number = coalesce(nullif(trim(_fiken_invoice_number), ''), po.fiken_invoice_number)
  WHERE po.id = _order_id
  RETURNING po.* INTO _order;

  SELECT * INTO STRICT _period FROM public.extend_proff_access(
    _organization_id, CASE _order.term WHEN 'yearly' THEN 12 ELSE 1 END
  );
  UPDATE public.proff_orders po
  SET period_start = _period.period_start, period_end = _period.period_end
  WHERE po.id = _order_id;

  RETURN QUERY SELECT _organization_id, _order.term, _order.fiken_invoice_number,
    _first_period, _period.period_start, _period.period_end;
END
$$;
REVOKE ALL ON FUNCTION public.mark_proff_order_paid(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_proff_order_paid(uuid, date, text) TO service_role;
