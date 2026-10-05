-- Angret oppsigelse lukker bare varselet for oppsigelsen som angres (det
-- nyeste), ikke et eldre «avsluttet prøveperioden»-varsel som fortsatt venter
-- på admin. Utsendingsvarselet for neste faktura legges inn med en gang i
-- stedet for ved neste daglige kjøring.
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
    PERFORM public.admin_events_handle_target(NEW.id, ARRAY['proff_invoice_due'], auth.uid());
    INSERT INTO public.admin_events (kind, target_id, title)
    VALUES (
      'proff_cancelled', NEW.id,
      _name || ' sa opp Proff – løper ut '
        || to_char(NEW.proff_access_until AT TIME ZONE 'Europe/Oslo', 'DD.MM.YYYY')
    );
  ELSIF OLD.proff_subscription_cancelled_at IS NOT NULL
     AND NEW.proff_subscription_cancelled_at IS NULL THEN
    -- Angret: oppsigelsen trenger ikke følges opp.
    UPDATE public.admin_events
    SET handled_at = now(), handled_by = auth.uid()
    WHERE id = (
      SELECT id FROM public.admin_events
      WHERE target_id = NEW.id AND kind = 'proff_cancelled' AND handled_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    );
    PERFORM public.create_proff_billing_events();
  END IF;

  RETURN NEW;
END
$$;
