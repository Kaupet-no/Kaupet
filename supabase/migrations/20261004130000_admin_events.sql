-- Felles hendelsesinnboks for administratorer. Radene skrives kun av
-- triggere på kildetabellene, så ingen appkode kan glemme å varsle. En
-- hendelse er åpen til en admin håndterer den — enten ved å utføre selve
-- handlingen (løse rapport, verifisere bedrift, sende faktura, slette
-- kategoriforslag) eller ved å trykke «Marker som håndtert». Status er
-- felles for alle admins. Proff-hendelsene legges inn av
-- 20261004140000_proff_invoicing.sql.

CREATE TABLE public.admin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN (
    'category_suggestion',
    'organization_registered',
    'proff_trial_started',
    'proff_cancelled',
    'proff_ordered',
    'proff_invoice_due',
    'proff_payment_overdue',
    'listing_reported',
    'user_reported'
  )),
  target_id uuid NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz,
  handled_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX admin_events_open_idx ON public.admin_events (created_at DESC)
  WHERE handled_at IS NULL;
CREATE INDEX admin_events_target_idx ON public.admin_events (target_id);

ALTER TABLE public.admin_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_events TO authenticated;
GRANT UPDATE (handled_at, handled_by) ON TABLE public.admin_events TO authenticated;

CREATE POLICY "Admins can view admin events" ON public.admin_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can handle admin events" ON public.admin_events
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Lukker åpne hendelser for et mål. Kalles fra triggerne under.
CREATE FUNCTION public.admin_events_handle_target(
  _target_id uuid,
  _kinds text[],
  _handled_by uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.admin_events
  SET handled_at = now(), handled_by = _handled_by
  WHERE target_id = _target_id AND kind = ANY (_kinds) AND handled_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.admin_events_handle_target(uuid, text[], uuid)
  FROM PUBLIC, anon, authenticated;

-- feedback: kategoriforslag -----------------------------------------------

CREATE FUNCTION public.admin_events_on_feedback() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_events (kind, target_id, title)
    VALUES ('category_suggestion', NEW.id, 'Forslag til kategori: ' || NEW.category_name);
    RETURN NEW;
  END IF;
  PERFORM public.admin_events_handle_target(OLD.id, ARRAY['category_suggestion'], auth.uid());
  RETURN OLD;
END
$$;

CREATE TRIGGER feedback_admin_events_insert
  AFTER INSERT ON public.feedback
  FOR EACH ROW WHEN (NEW.type = 'kategori')
  EXECUTE FUNCTION public.admin_events_on_feedback();

CREATE TRIGGER feedback_admin_events_delete
  AFTER DELETE ON public.feedback
  FOR EACH ROW WHEN (OLD.type = 'kategori')
  EXECUTE FUNCTION public.admin_events_on_feedback();

-- organizations: registrering, verifisering, avsluttet prøveperiode -------

CREATE FUNCTION public.admin_events_on_organization() RETURNS trigger
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

  RETURN NEW;
END
$$;

CREATE TRIGGER organizations_admin_events
  AFTER INSERT OR UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_events_on_organization();

-- reports: rapporterte annonser og brukere --------------------------------

CREATE FUNCTION public.admin_events_on_report() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_events (kind, target_id, title)
    VALUES (
      CASE WHEN NEW.listing_id IS NOT NULL THEN 'listing_reported' ELSE 'user_reported' END,
      NEW.id,
      CASE WHEN NEW.listing_id IS NOT NULL THEN 'Annonse rapportert: ' ELSE 'Bruker rapportert: ' END
        || NEW.reason
    );
  ELSIF OLD.status IS DISTINCT FROM 'resolved' AND NEW.status = 'resolved' THEN
    PERFORM public.admin_events_handle_target(
      NEW.id, ARRAY['listing_reported', 'user_reported'], coalesce(NEW.resolved_by, auth.uid())
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER reports_admin_events
  AFTER INSERT OR UPDATE OF status ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_events_on_report();

-- Backfill: det som allerede venter på en admin --------------------------

INSERT INTO public.admin_events (kind, target_id, title, created_at)
SELECT
  CASE WHEN listing_id IS NOT NULL THEN 'listing_reported' ELSE 'user_reported' END,
  id,
  CASE WHEN listing_id IS NOT NULL THEN 'Annonse rapportert: ' ELSE 'Bruker rapportert: ' END
    || reason,
  created_at
FROM public.reports
WHERE status <> 'resolved';

INSERT INTO public.admin_events (kind, target_id, title, created_at)
SELECT 'organization_registered', id,
  'Ny bedrift registrert: ' || coalesce(display_name, legal_name), created_at
FROM public.organizations
WHERE verification_status = 'unverified';
