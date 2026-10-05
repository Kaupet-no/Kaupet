BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(33);

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
-- Kaupet avslutter avtalen -------------------------------------------------
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000000aa', 'admin-pgtap@example.com');
INSERT INTO organizations (id, organization_number, legal_name, display_name, selected_plan,
  proff_trial_started_at, proff_trial_ends_at, proff_access_until)
VALUES ('00000000-0000-4000-8000-000000000103', '999000103', 'Avslutning AS', 'Avslutning', 'proff',
  now() - interval '90 days', now() - interval '60 days', now() + interval '10 days');
INSERT INTO proff_orders (organization_id, term, price_ex_vat_nok, billing_email, status,
  fiken_invoice_number, invoice_sent_on, invoice_due_on)
VALUES ('00000000-0000-4000-8000-000000000103', 'monthly', 1490, 'faktura@example.com', 'invoiced',
  'F-103', current_date - 20, current_date - 5);

CREATE FUNCTION pg_temp.reject_moderation_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('kaupet_test.fail_log', true) = 'on' THEN
    RAISE EXCEPTION 'forced_log_failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_reject_moderation_log BEFORE INSERT ON admin_moderation_log
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_moderation_log();
SET LOCAL kaupet_test.fail_log = 'on';
SELECT throws_ok($$SELECT * FROM public.end_proff_agreement('00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-0000000000aa', 'Mislighold')$$,
  'P0001', 'forced_log_failure', 'Feil i siste steg avbryter hele avslutningen');
SELECT is((SELECT status FROM proff_orders WHERE organization_id = '00000000-0000-4000-8000-000000000103'),
  'invoiced', 'Fakturaen er ikke kansellert etter feil');
SELECT ok((SELECT proff_ended_by_kaupet_at IS NULL AND proff_subscription_cancelled_at IS NULL
  FROM organizations WHERE id = '00000000-0000-4000-8000-000000000103'), 'Avtalestatus er urørt etter feil');
SET LOCAL kaupet_test.fail_log = 'off';

CREATE TEMP TABLE ended AS SELECT * FROM public.end_proff_agreement(
  '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000000aa', 'Mislighold');
SELECT ok((SELECT claimed FROM ended), 'Første avslutning registreres');
SELECT is((SELECT overdue_invoice_number || '|' || credited_invoice_number FROM ended),
  'F-103|F-103', 'Forfalt og kreditert faktura rapporteres');
SELECT is((SELECT status FROM proff_orders WHERE organization_id = '00000000-0000-4000-8000-000000000103'),
  'cancelled', 'Åpen faktura kanselleres');
SELECT ok((SELECT proff_ended_by_kaupet_at IS NOT NULL AND proff_subscription_cancelled_at IS NOT NULL
  FROM organizations WHERE id = '00000000-0000-4000-8000-000000000103'), 'Avtalen er avsluttet av Kaupet');
SELECT is((SELECT count(*)::int FROM admin_events WHERE target_id = '00000000-0000-4000-8000-000000000103'
  AND kind = 'proff_cancelled' AND handled_at IS NULL), 0, 'Admin trenger ikke følge opp egen avslutning');
SELECT is((SELECT count(*)::int FROM admin_moderation_log
  WHERE target_id = '00000000-0000-4000-8000-000000000103'), 1, 'Avslutningen logges');
SELECT ok(NOT (SELECT claimed FROM public.end_proff_agreement('00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-0000000000aa')), 'Dobbeltklikk gir ingen ny avslutning');
SELECT is((SELECT count(*)::int FROM admin_moderation_log
  WHERE target_id = '00000000-0000-4000-8000-000000000103'), 1, 'Dobbeltklikk logges ikke på nytt');

-- Kunden sier opp betalt Proff ---------------------------------------------
INSERT INTO organizations (id, organization_number, legal_name, display_name, selected_plan,
  proff_access_until)
VALUES ('00000000-0000-4000-8000-000000000104', '999000104', 'Oppsigelse AS', 'Oppsigelse', 'proff',
  now() + interval '10 days');
INSERT INTO proff_orders (organization_id, term, price_ex_vat_nok, billing_email, status,
  fiken_invoice_number, invoice_sent_on, invoice_due_on)
VALUES ('00000000-0000-4000-8000-000000000104', 'monthly', 1490, 'faktura@example.com', 'invoiced',
  'F-104', current_date, current_date + 14);
SET LOCAL kaupet_test.fail_order_cancel = 'on';
CREATE FUNCTION pg_temp.reject_order_cancel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id = '00000000-0000-4000-8000-000000000104'
    AND current_setting('kaupet_test.fail_order_cancel', true) = 'on' THEN
    RAISE EXCEPTION 'forced_cancel_failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_reject_order_cancel BEFORE UPDATE OF status ON proff_orders
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_order_cancel();
SELECT throws_ok($$SELECT * FROM public.cancel_proff_subscription('00000000-0000-4000-8000-000000000104')$$,
  'P0001', 'forced_cancel_failure', 'Feil ved kansellering av faktura avbryter oppsigelsen');
SELECT ok((SELECT proff_subscription_cancelled_at IS NULL FROM organizations
  WHERE id = '00000000-0000-4000-8000-000000000104'), 'Oppsigelsen rulles tilbake');
SET LOCAL kaupet_test.fail_order_cancel = 'off';
SELECT is((SELECT claimed::text || '|' || sent_invoice_number
  FROM public.cancel_proff_subscription('00000000-0000-4000-8000-000000000104')),
  'true|F-104', 'Oppsigelse kansellerer og rapporterer sendt faktura');
SELECT ok(NOT (SELECT claimed FROM public.cancel_proff_subscription('00000000-0000-4000-8000-000000000104')),
  'Dobbeltklikk gir ingen ny oppsigelse');
SELECT ok(NOT has_function_privilege('authenticated', 'public.end_proff_agreement(uuid,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.cancel_proff_subscription(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.end_proff_agreement(uuid,uuid,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.cancel_proff_subscription(uuid)', 'EXECUTE'),
  'Oppsigelsesoperasjonene er kun for serveren');
SELECT * FROM finish();
ROLLBACK;
