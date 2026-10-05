-- Prøveavslutning og fakturaregistrering bruker samme organisasjonslås som
-- betaling, bestilling og oppsigelse. Ingen faktura kan opprettes etter at
-- oppsigelsen har vunnet låsen, og feil ruller tilbake hele prøveavslutningen.
CREATE FUNCTION public.cancel_proff_trial(_organization_id uuid)
RETURNS TABLE (claimed boolean, cancelled_at timestamptz, sent_invoice_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _org public.organizations;
  _sent_number text;
BEGIN
  SELECT * INTO STRICT _org FROM public.organizations
  WHERE id = _organization_id FOR UPDATE;
  IF _org.proff_trial_cancelled_at IS NOT NULL THEN
    RETURN QUERY SELECT false, _org.proff_trial_cancelled_at, NULL::text;
    RETURN;
  END IF;
  IF _org.selected_plan IS DISTINCT FROM 'proff' OR _org.proff_trial_ends_at IS NULL
     OR _org.proff_access_until IS NULL OR _org.proff_access_until <= now()
     OR _org.proff_access_until > _org.proff_trial_ends_at THEN
    RAISE EXCEPTION 'trial_not_cancellable';
  END IF;
  UPDATE public.organizations
  SET selected_plan = 'proff_basis', proff_trial_cancelled_at = now(), proff_access_until = now()
  WHERE id = _organization_id;
  WITH cancelled AS (
    UPDATE public.proff_orders SET status = 'cancelled', admin_note = 'Avsluttet av kunden'
    WHERE organization_id = _organization_id AND status IN ('pending', 'invoiced')
    RETURNING fiken_invoice_number
  )
  SELECT fiken_invoice_number INTO _sent_number FROM cancelled
  WHERE fiken_invoice_number IS NOT NULL LIMIT 1;
  PERFORM public.sync_organization_entitlements(_organization_id);
  RETURN QUERY SELECT true, now(), _sent_number;
END
$$;
REVOKE ALL ON FUNCTION public.cancel_proff_trial(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_proff_trial(uuid) TO service_role;

CREATE FUNCTION public.register_proff_invoice_sent(
  _invoice_number text, _sent_on date, _due_on date,
  _order_id uuid DEFAULT NULL, _organization_id uuid DEFAULT NULL,
  _term text DEFAULT NULL, _price_ex_vat_nok integer DEFAULT NULL, _requested_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _org public.organizations;
  _org_id uuid := _organization_id;
  _id uuid;
  _billing_email text;
BEGIN
  IF _invoice_number IS NULL OR length(trim(_invoice_number)) NOT BETWEEN 1 AND 40
     OR _sent_on IS NULL OR _due_on IS NULL OR _due_on < _sent_on
     OR (_order_id IS NULL) = (_organization_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_invoice';
  END IF;
  IF _order_id IS NOT NULL THEN
    SELECT organization_id INTO _org_id FROM public.proff_orders WHERE id = _order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'order_not_invoiceable'; END IF;
  END IF;
  SELECT * INTO STRICT _org FROM public.organizations WHERE id = _org_id FOR UPDATE;
  IF _org.proff_subscription_cancelled_at IS NOT NULL OR _org.proff_ended_by_kaupet_at IS NOT NULL THEN
    RAISE EXCEPTION 'agreement_not_renewable';
  END IF;
  IF _order_id IS NOT NULL THEN
    UPDATE public.proff_orders
    SET status = 'invoiced', fiken_invoice_number = trim(_invoice_number),
        invoice_sent_on = _sent_on, invoice_due_on = _due_on
    WHERE id = _order_id AND status = 'pending' RETURNING id INTO _id;
    IF NOT FOUND THEN RAISE EXCEPTION 'order_not_invoiceable'; END IF;
    RETURN _id;
  END IF;
  IF _org.selected_plan IS DISTINCT FROM 'proff' OR _org.proff_access_until IS NULL
     OR _org.proff_access_until <= now()
     OR NOT EXISTS (SELECT 1 FROM public.proff_orders WHERE organization_id = _org_id AND status = 'paid') THEN
    RAISE EXCEPTION 'agreement_not_renewable';
  END IF;
  SELECT billing_email INTO STRICT _billing_email FROM public.organization_billing_profiles
  WHERE organization_id = _org_id;
  INSERT INTO public.proff_orders (organization_id, requested_by, term, price_ex_vat_nok,
    billing_email, status, fiken_invoice_number, invoice_sent_on, invoice_due_on, period_start, period_end)
  VALUES (_org_id, _requested_by, _term, _price_ex_vat_nok, _billing_email, 'invoiced',
    trim(_invoice_number), _sent_on, _due_on, _org.proff_access_until,
    _org.proff_access_until + make_interval(months => CASE _term WHEN 'yearly' THEN 12 ELSE 1 END))
  RETURNING id INTO _id;
  RETURN _id;
END
$$;
REVOKE ALL ON FUNCTION public.register_proff_invoice_sent(text,date,date,uuid,uuid,text,integer,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_proff_invoice_sent(text,date,date,uuid,uuid,text,integer,uuid)
  TO service_role;
