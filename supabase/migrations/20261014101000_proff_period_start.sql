-- KG-14-F02: periodestarten ble rekonstruert som slutt - N måneder. Ved
-- månedsslutt klamper Postgres (31. jan + 1 mnd = 28. feb, 28. feb - 1 mnd =
-- 28. jan), så period_start i proff_orders kom tre dager for tidlig. Starten
-- beregnes nå én gang under radlås, og slutten avledes fra den.
-- Kroppen er ellers lik 20260902090000_proff_orders.sql (eneste definisjon).
-- Festet til UTC som mark_organization_location_charge_invoiced
-- (20261014102000): månedsaritmetikken skjer ellers i øktas TimeZone.

CREATE OR REPLACE FUNCTION public.extend_proff_access(_organization_id uuid, _months integer)
RETURNS TABLE (period_start timestamptz, period_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  _start timestamptz;
  _end timestamptz;
BEGIN
  IF _months IS NULL OR _months <= 0 OR _months > 24 THEN
    RAISE EXCEPTION 'Invalid term length';
  END IF;

  SELECT greatest(now(), coalesce(proff_access_until, now()))
  INTO _start
  FROM public.organizations
  WHERE id = _organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown organization';
  END IF;

  _end := _start + make_interval(months => _months);

  UPDATE public.organizations
  SET selected_plan = 'proff',
      proff_trial_cancelled_at = NULL,
      proff_access_until = _end
  WHERE id = _organization_id;

  PERFORM public.sync_organization_entitlements(_organization_id);
  RETURN QUERY SELECT _start, _end;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_proff_access(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_proff_access(uuid, integer) TO service_role;
