-- Oppsigelse lukker utsendingsvarselet også når neste faktura ikke er opprettet.
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
    PERFORM public.admin_events_handle_target(NEW.id, ARRAY['proff_cancelled'], auth.uid());
  END IF;

  RETURN NEW;
END
$$;

-- Rydd også varsler opprettet før rettingen.
UPDATE public.admin_events e
SET handled_at = now()
FROM public.organizations o
WHERE e.target_id = o.id AND e.kind = 'proff_invoice_due'
  AND e.handled_at IS NULL AND o.proff_subscription_cancelled_at IS NOT NULL;
