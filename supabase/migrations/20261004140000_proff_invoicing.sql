-- Manuell fakturering av Proff som løpende abonnement (månedlig eller årlig).
--
-- * Første bestilling starter en 30 dagers prøveperiode. Bestillingen er
--   første faktura: forfall når prøven utløper, og den skal sendes minst 14
--   dager før forfall.
-- * Proff-tilgang forlenges først når en faktura registreres betalt
--   (extend_proff_access). Er den ubetalt ved forfall, opphører Proff når
--   prøven eller den betalte perioden er over — uten egen jobb.
-- * Neste faktura i et løpende abonnement har forfall når betalt periode
--   slutter. Raden opprettes når admin registrerer at fakturaen er sendt.
-- * Oppsigelse av betalt Proff setter proff_subscription_cancelled_at: Proff
--   løper ut betalt periode, og det kommer ingen ny faktura.
-- * Hver rad i proff_orders er én faktura/periode med datoer for sendt,
--   forfall, påminnelse og betaling, som admin krysser av manuelt.

ALTER TABLE public.organizations
  ADD COLUMN proff_subscription_cancelled_at timestamptz;

ALTER TABLE public.proff_orders
  ADD COLUMN invoice_sent_on date,
  ADD COLUMN invoice_due_on date,
  ADD COLUMN reminder_sent_on date,
  ADD COLUMN paid_on date,
  ADD CONSTRAINT proff_orders_invoice_dates_check
    CHECK (invoice_due_on IS NULL OR invoice_sent_on IS NULL OR invoice_due_on >= invoice_sent_on);

-- Eksisterende rader: beste anslag ut fra siste endring, så oversikten ikke
-- viser sendte/betalte fakturaer uten dato.
UPDATE public.proff_orders
SET invoice_sent_on = (updated_at AT TIME ZONE 'Europe/Oslo')::date
WHERE status IN ('invoiced', 'paid') AND fiken_invoice_number IS NOT NULL;
UPDATE public.proff_orders
SET paid_on = (updated_at AT TIME ZONE 'Europe/Oslo')::date
WHERE status = 'paid';

-- Prøvestart + bestilling i én transaksjon. Perioden er planlagt fra
-- prøvens slutt; den faktiske settes når fakturaen betales.
CREATE FUNCTION public.start_proff_trial_order(
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
  _trial_ends timestamptz := now() + interval '30 days';
  _order_id uuid;
BEGIN
  UPDATE public.organizations
  SET selected_plan = 'proff',
      proff_trial_started_at = now(),
      proff_trial_ends_at = _trial_ends,
      proff_access_until = _trial_ends,
      proff_trial_cancelled_at = NULL
  WHERE id = _organization_id AND proff_trial_started_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trial_used';
  END IF;

  INSERT INTO public.proff_orders (
    organization_id, requested_by, term, price_ex_vat_nok, billing_email, billing_reference,
    period_start, period_end
  ) VALUES (
    _organization_id, _requested_by, _term, _price_ex_vat_nok, _billing_email, _billing_reference,
    _trial_ends,
    _trial_ends + make_interval(months => CASE _term WHEN 'yearly' THEN 12 ELSE 1 END)
  )
  RETURNING id INTO _order_id;

  PERFORM public.sync_organization_entitlements(_organization_id);
  RETURN _order_id;
END
$$;

REVOKE ALL ON FUNCTION public.start_proff_trial_order(uuid, uuid, text, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_proff_trial_order(uuid, uuid, text, integer, text, text)
  TO service_role;

-- Fakturaer som skal sendes: åpne bestillinger som ikke er sendt, og neste
-- periode for løpende abonnement uten åpen faktura. send_by er siste dag
-- fakturaen kan sendes for å gi kunden 14 dagers betalingsfrist.
CREATE FUNCTION public.admin_proff_upcoming_invoices()
RETURNS TABLE (
  organization_id uuid,
  order_id uuid,
  term text,
  period_start timestamptz,
  due_on date,
  send_by date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upcoming AS (
    SELECT po.organization_id, po.id AS order_id, po.term, po.period_start,
      coalesce(
        (po.period_start AT TIME ZONE 'Europe/Oslo')::date,
        (po.created_at AT TIME ZONE 'Europe/Oslo')::date + 14
      ) AS due_on
    FROM public.proff_orders po
    WHERE po.status = 'pending'
    UNION ALL
    SELECT o.id, NULL, last_paid.term, o.proff_access_until,
      (o.proff_access_until AT TIME ZONE 'Europe/Oslo')::date
    FROM public.organizations o
    JOIN LATERAL (
      SELECT po.term FROM public.proff_orders po
      WHERE po.organization_id = o.id AND po.status = 'paid'
      ORDER BY po.period_end DESC NULLS LAST
      LIMIT 1
    ) last_paid ON true
    WHERE o.selected_plan = 'proff'
      AND o.proff_access_until > now()
      AND o.proff_subscription_cancelled_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.proff_orders open_order
        WHERE open_order.organization_id = o.id AND open_order.status IN ('pending', 'invoiced')
      )
  )
  SELECT organization_id, order_id, term, period_start, due_on, due_on - 14
  FROM upcoming;
$$;

REVOKE ALL ON FUNCTION public.admin_proff_upcoming_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_proff_upcoming_invoices() TO service_role;

-- Hendelser ---------------------------------------------------------------

-- Erstatter versjonen fra 20261004130000 med varsel om oppsigelse (kolonnen
-- finnes først her).
CREATE OR REPLACE FUNCTION public.admin_events_on_organization() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text := coalesce(NEW.display_name, NEW.legal_name);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_events (kind, target_id, title)
    VALUES ('organization_registered', NEW.id, 'Ny bedrift registrert: ' || _name);
    RETURN NEW;
  END IF;

  IF OLD.verification_status IS DISTINCT FROM 'verified'
     AND NEW.verification_status = 'verified' THEN
    PERFORM public.admin_events_handle_target(
      NEW.id, ARRAY['organization_registered'], coalesce(NEW.verified_by, auth.uid())
    );
  END IF;

  IF OLD.proff_trial_cancelled_at IS NULL AND NEW.proff_trial_cancelled_at IS NOT NULL THEN
    INSERT INTO public.admin_events (kind, target_id, title)
    VALUES ('proff_cancelled', NEW.id, _name || ' avsluttet Proff-prøveperioden');
  END IF;

  IF OLD.proff_subscription_cancelled_at IS NULL
     AND NEW.proff_subscription_cancelled_at IS NOT NULL THEN
    INSERT INTO public.admin_events (kind, target_id, title)
    VALUES (
      'proff_cancelled', NEW.id,
      _name || ' sa opp Proff – løper ut '
        || to_char(NEW.proff_access_until AT TIME ZONE 'Europe/Oslo', 'DD.MM.YYYY')
    );
  ELSIF OLD.proff_subscription_cancelled_at IS NOT NULL
     AND NEW.proff_subscription_cancelled_at IS NULL THEN
    -- Angret: oppsigelsen trenger ikke følges opp.
    PERFORM public.admin_events_handle_target(NEW.id, ARRAY['proff_cancelled'], auth.uid());
  END IF;

  RETURN NEW;
END
$$;

CREATE FUNCTION public.proff_order_in_trial(o public.organizations, po public.proff_orders)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT o.proff_trial_started_at IS NOT NULL
    AND o.proff_trial_cancelled_at IS NULL
    AND po.created_at <= o.proff_trial_ends_at
    AND now() < o.proff_trial_ends_at;
$$;

CREATE FUNCTION public.admin_events_on_proff_order() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _term text := CASE NEW.term WHEN 'yearly' THEN 'årlig' ELSE 'månedlig' END;
BEGIN
  -- Ny bestilling fra kunden (admin-registrerte neste-periode-fakturaer
  -- settes inn som 'invoiced' og trenger ingen egen hendelse).
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    INSERT INTO public.admin_events (kind, target_id, title)
    SELECT
      CASE WHEN public.proff_order_in_trial(o, NEW) THEN 'proff_trial_started' ELSE 'proff_ordered' END,
      NEW.id,
      CASE WHEN public.proff_order_in_trial(o, NEW)
        THEN coalesce(o.display_name, o.legal_name) || ' startet Proff-prøveperiode (' || _term
          || ') – utløper ' || to_char(o.proff_trial_ends_at AT TIME ZONE 'Europe/Oslo', 'DD.MM.YYYY')
          || ', send faktura innen '
          || to_char((o.proff_trial_ends_at AT TIME ZONE 'Europe/Oslo')::date - 14, 'DD.MM.YYYY')
        ELSE 'Proff bestilt (' || _term || '): ' || coalesce(o.display_name, o.legal_name)
      END
    FROM public.organizations o
    WHERE o.id = NEW.organization_id;
  END IF;

  -- Fakturaen er sendt (eller bestillingen kansellert): utsendingshendelsene lukkes.
  IF NEW.status <> 'pending' AND (TG_OP = 'INSERT' OR OLD.status = 'pending') THEN
    PERFORM public.admin_events_handle_target(
      NEW.id, ARRAY['proff_ordered', 'proff_trial_started'], auth.uid()
    );
    PERFORM public.admin_events_handle_target(
      NEW.organization_id, ARRAY['proff_invoice_due'], auth.uid()
    );
  END IF;

  -- Betalt, kansellert eller purret: forfalt-hendelsen er fulgt opp.
  IF TG_OP = 'UPDATE' AND (
    (OLD.status = 'invoiced' AND NEW.status IN ('paid', 'cancelled'))
    OR (OLD.reminder_sent_on IS NULL AND NEW.reminder_sent_on IS NOT NULL)
  ) THEN
    PERFORM public.admin_events_handle_target(NEW.id, ARRAY['proff_payment_overdue'], auth.uid());
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER proff_orders_admin_events
  AFTER INSERT OR UPDATE OF status, reminder_sent_on ON public.proff_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_events_on_proff_order();

-- Daglig: varsle om fakturaer som snart må sendes (7 dager før siste frist,
-- altså ideelt 3 uker før forfall), og om sendte fakturaer som har forfalt.
CREATE FUNCTION public.create_proff_billing_events() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_events (kind, target_id, title)
  SELECT 'proff_invoice_due', u.organization_id,
    'Send Proff-faktura (' || CASE u.term WHEN 'yearly' THEN 'årlig' ELSE 'månedlig' END
      || ') til ' || coalesce(o.display_name, o.legal_name)
      || ' innen ' || to_char(u.send_by, 'DD.MM.YYYY')
      || ' – forfall ' || to_char(u.due_on, 'DD.MM.YYYY')
  FROM public.admin_proff_upcoming_invoices() u
  JOIN public.organizations o ON o.id = u.organization_id
  WHERE u.send_by <= (now() AT TIME ZONE 'Europe/Oslo')::date + 7
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_events e
      WHERE e.kind = 'proff_invoice_due' AND e.target_id = u.organization_id
        AND e.handled_at IS NULL
    );

  INSERT INTO public.admin_events (kind, target_id, title)
  SELECT 'proff_payment_overdue', po.id,
    'Faktura ' || coalesce(po.fiken_invoice_number, '') || ' til '
      || coalesce(o.display_name, o.legal_name) || ' forfalt '
      || to_char(po.invoice_due_on, 'DD.MM.YYYY') || ' – ikke betalt'
  FROM public.proff_orders po
  JOIN public.organizations o ON o.id = po.organization_id
  WHERE po.status = 'invoiced'
    AND po.invoice_due_on < (now() AT TIME ZONE 'Europe/Oslo')::date
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_events e
      WHERE e.kind = 'proff_payment_overdue' AND e.target_id = po.id
    );
END
$$;

REVOKE ALL ON FUNCTION public.create_proff_billing_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_proff_billing_events() TO service_role;

SELECT cron.schedule(
  'proff-billing-events-daily',
  '0 5 * * *',
  'SELECT public.create_proff_billing_events();'
);

-- Backfill: åpne bestillinger som allerede venter.
INSERT INTO public.admin_events (kind, target_id, title, created_at)
SELECT
  CASE WHEN public.proff_order_in_trial(o, po) THEN 'proff_trial_started' ELSE 'proff_ordered' END,
  po.id,
  'Proff bestilt (' || CASE po.term WHEN 'yearly' THEN 'årlig' ELSE 'månedlig' END
    || '): ' || coalesce(o.display_name, o.legal_name),
  po.created_at
FROM public.proff_orders po
JOIN public.organizations o ON o.id = po.organization_id
WHERE po.status = 'pending';
