-- Oppsigelse fra kunden og avslutning fra Kaupet lagres atomisk: avtalestatus
-- og kansellering av åpne fakturaer lykkes eller feiler sammen. claimed er
-- false når avtalen allerede var sagt opp/avsluttet, så serveren sender bare
-- én bekreftelse også ved dobbeltklikk.

CREATE FUNCTION public.cancel_proff_subscription(_organization_id uuid)
RETURNS TABLE (
  claimed boolean,
  access_until timestamptz,
  sent_invoice_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claimed boolean;
  _sent_invoice_number text;
BEGIN
  UPDATE public.organizations
  SET proff_subscription_cancelled_at = now()
  WHERE id = _organization_id AND proff_subscription_cancelled_at IS NULL;
  _claimed := FOUND;

  -- Kanselleres også ved nytt forsøk, så en tidligere avbrutt oppsigelse fullføres.
  WITH cancelled AS (
    UPDATE public.proff_orders po
    SET status = 'cancelled', admin_note = 'Sagt opp av kunden'
    WHERE po.organization_id = _organization_id AND po.status IN ('pending', 'invoiced')
    RETURNING po.fiken_invoice_number
  )
  SELECT c.fiken_invoice_number INTO _sent_invoice_number
  FROM cancelled c WHERE c.fiken_invoice_number IS NOT NULL LIMIT 1;

  RETURN QUERY
  SELECT _claimed, o.proff_access_until, _sent_invoice_number
  FROM public.organizations o WHERE o.id = _organization_id;
END
$$;
REVOKE ALL ON FUNCTION public.cancel_proff_subscription(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_proff_subscription(uuid) TO service_role;

CREATE FUNCTION public.end_proff_agreement(
  _organization_id uuid,
  _admin_id uuid,
  _note text DEFAULT NULL
) RETURNS TABLE (
  claimed boolean,
  access_until timestamptz,
  overdue_invoice_number text,
  overdue_due_on date,
  credited_invoice_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org public.organizations;
  _note_clean text := nullif(trim(_note), '');
  _today date := (now() AT TIME ZONE 'Europe/Oslo')::date;
  _overdue_number text;
  _overdue_due date;
  _credited_number text;
BEGIN
  SELECT * INTO STRICT _org FROM public.organizations
  WHERE id = _organization_id FOR UPDATE;

  IF _org.proff_ended_by_kaupet_at IS NOT NULL THEN
    RETURN QUERY SELECT false,
      CASE WHEN _org.proff_access_until > now() THEN _org.proff_access_until END,
      NULL::text, NULL::date, NULL::text;
    RETURN;
  END IF;

  -- Sendte fakturaer som kanselleres må krediteres i Fiken; e-posten nevner
  -- en eventuell forfalt faktura særskilt.
  WITH cancelled AS (
    UPDATE public.proff_orders po
    SET status = 'cancelled', admin_note = coalesce(_note_clean, 'Avtalen avsluttet av Kaupet')
    WHERE po.organization_id = _organization_id AND po.status IN ('pending', 'invoiced')
    RETURNING po.fiken_invoice_number, po.invoice_sent_on, po.invoice_due_on
  ), sent AS (
    SELECT * FROM cancelled
    WHERE invoice_sent_on IS NOT NULL AND fiken_invoice_number IS NOT NULL
  ), overdue AS (
    SELECT * FROM sent WHERE invoice_due_on < _today ORDER BY invoice_due_on LIMIT 1
  )
  SELECT (SELECT fiken_invoice_number FROM sent LIMIT 1),
    (SELECT fiken_invoice_number FROM overdue),
    (SELECT invoice_due_on FROM overdue)
  INTO _credited_number, _overdue_number, _overdue_due;

  UPDATE public.organizations
  SET proff_ended_by_kaupet_at = now(),
      proff_subscription_cancelled_at = coalesce(proff_subscription_cancelled_at, now())
  WHERE id = _organization_id;

  IF _org.proff_subscription_cancelled_at IS NULL THEN
    -- Triggeren lager «sa opp Proff»-hendelsen; her er det admin selv som avsluttet.
    UPDATE public.admin_events
    SET handled_at = now(), handled_by = _admin_id
    WHERE id = (
      SELECT id FROM public.admin_events
      WHERE target_id = _organization_id AND kind = 'proff_cancelled' AND handled_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;

  INSERT INTO public.admin_moderation_log (admin_id, action, target_type, target_id, reason)
  VALUES (_admin_id, 'end_proff_agreement', 'organization', _organization_id::text, _note_clean);

  RETURN QUERY SELECT true,
    CASE WHEN _org.proff_access_until > now() THEN _org.proff_access_until END,
    _overdue_number, _overdue_due, _credited_number;
END
$$;
REVOKE ALL ON FUNCTION public.end_proff_agreement(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_proff_agreement(uuid, uuid, text) TO service_role;
