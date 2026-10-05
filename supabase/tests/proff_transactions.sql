BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(17);

INSERT INTO public.organizations (id, organization_number, legal_name, display_name,
  selected_plan, proff_trial_started_at, proff_trial_ends_at, proff_access_until,
  proff_subscription_cancelled_at, proff_ended_by_kaupet_at)
VALUES ('00000000-0000-4000-8000-000000000101', '999000101', 'Transaksjon AS', 'Transaksjon',
  'proff', now() - interval '60 days', now() - interval '30 days', now() + interval '10 days', now(), now());

SELECT throws_ok($$SELECT public.request_proff_subscription_order(
  '00000000-0000-4000-8000-000000000101', NULL, 'monthly', 1490, 'faktura@example.com')$$,
  'P0001', 'agreement_ended_by_kaupet', 'Kunden kan ikke gjenoppta adminavsluttet tilgang før utløp');
SELECT ok((SELECT proff_ended_by_kaupet_at IS NOT NULL FROM organizations
  WHERE id = '00000000-0000-4000-8000-000000000101'), 'Avslutningen bevares ved avvist bestilling');
UPDATE organizations SET proff_access_until = now() - interval '1 day'
  WHERE id = '00000000-0000-4000-8000-000000000101';
SELECT throws_ok($$SELECT public.request_proff_subscription_order(
  '00000000-0000-4000-8000-000000000101', NULL, 'monthly', 1490, 'UGYLDIG@example.com')$$,
  '23514', NULL, 'Mislykket innsetting ruller tilbake gjenopptakelsen');
SELECT ok((SELECT proff_ended_by_kaupet_at IS NOT NULL AND proff_subscription_cancelled_at IS NOT NULL
  FROM organizations WHERE id = '00000000-0000-4000-8000-000000000101'), 'Begge avslutningsflagg bevares');
SELECT lives_ok($$SELECT public.request_proff_subscription_order(
  '00000000-0000-4000-8000-000000000101', NULL, 'monthly', 1490, 'faktura@example.com')$$,
  'Ny bestilling tillates etter at tilgangen har utløpt');
SELECT ok((SELECT proff_ended_by_kaupet_at IS NULL AND proff_subscription_cancelled_at IS NULL
  FROM organizations WHERE id = '00000000-0000-4000-8000-000000000101'), 'Vellykket bestilling gjenopptar avtalen');

INSERT INTO organizations (id, organization_number, legal_name, display_name)
VALUES ('00000000-0000-4000-8000-000000000102', '999000102', 'Betaling AS', 'Betaling');
CREATE TEMP TABLE payment_fixture AS SELECT public.request_proff_subscription_order(
  '00000000-0000-4000-8000-000000000102', NULL, 'monthly', 1490, 'faktura@example.com') AS order_id;
CREATE TEMP TABLE access_before AS SELECT proff_access_until FROM organizations
  WHERE id = '00000000-0000-4000-8000-000000000102';

-- Fremprovoser feil i siste lagring, etter at tilgangen allerede er forlenget.
CREATE FUNCTION pg_temp.reject_payment_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id = '00000000-0000-4000-8000-000000000102'
    AND current_setting('kaupet_test.fail_period', true) = 'on' THEN
    RAISE EXCEPTION 'forced_period_failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_reject_payment_period BEFORE UPDATE OF period_start, period_end ON proff_orders
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_payment_period();
SET LOCAL kaupet_test.fail_period = 'on';
SELECT throws_ok($$SELECT public.mark_proff_order_paid((SELECT order_id FROM payment_fixture), current_date)$$,
  'P0001', 'forced_period_failure', 'Feil i siste lagring avbryter hele betalingen');
SELECT is((SELECT status FROM proff_orders WHERE id = (SELECT order_id FROM payment_fixture)),
  'pending', 'Fakturaen er fortsatt ubetalt etter feil');
SELECT is((SELECT proff_access_until FROM organizations WHERE id = '00000000-0000-4000-8000-000000000102'),
  (SELECT proff_access_until FROM access_before), 'Tilgangsforlengelsen rulles tilbake');
SELECT ok((SELECT handled_at IS NULL FROM admin_events WHERE target_id = (SELECT order_id FROM payment_fixture)
  AND kind = 'proff_trial_started'), 'Hendelsen forblir åpen etter feil');
SET LOCAL kaupet_test.fail_period = 'off';
SELECT lives_ok($$SELECT public.mark_proff_order_paid((SELECT order_id FROM payment_fixture), current_date)$$,
  'Admin kan prøve betalingen på nytt');
SELECT is((SELECT status FROM proff_orders WHERE id = (SELECT order_id FROM payment_fixture)),
  'paid', 'Vellykket betaling lagres');
SELECT ok((SELECT po.period_end = o.proff_access_until FROM proff_orders po JOIN organizations o ON o.id = po.organization_id
  WHERE po.id = (SELECT order_id FROM payment_fixture)), 'Fakturaperiode og tilgang er konsistente');
SELECT throws_ok($$SELECT public.mark_proff_order_paid((SELECT order_id FROM payment_fixture), current_date)$$,
  'P0001', 'order_not_payable', 'Samme betaling kan ikke forlenge tilgang to ganger');
SELECT ok(NOT has_function_privilege('anon', 'public.mark_proff_order_paid(uuid,date,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.mark_proff_order_paid(uuid,date,text)', 'EXECUTE'),
  'Klientroller kan ikke registrere betaling direkte');
SELECT ok(NOT has_function_privilege('anon', 'public.request_proff_subscription_order(uuid,uuid,text,integer,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.request_proff_subscription_order(uuid,uuid,text,integer,text,text)', 'EXECUTE'),
  'Klientroller kan ikke bestille med vilkårlig aktør og pris');
SELECT ok(has_function_privilege('service_role', 'public.mark_proff_order_paid(uuid,date,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.request_proff_subscription_order(uuid,uuid,text,integer,text,text)', 'EXECUTE'),
  'Serveren har tilgang til de atomiske operasjonene');
SELECT * FROM finish();
ROLLBACK;
