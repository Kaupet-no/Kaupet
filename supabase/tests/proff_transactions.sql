BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(52);

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
-- Tilstandsovergang og feilgjetting: avbrutt prøveavslutning og gammel adminflate.
INSERT INTO organizations (id, organization_number, legal_name, display_name, selected_plan,
  proff_trial_started_at, proff_trial_ends_at, proff_access_until)
VALUES ('00000000-0000-4000-8000-000000000105', '999000105', 'Prøve AS', 'Prøve', 'proff',
  now(), now() + interval '30 days', now() + interval '30 days');
INSERT INTO proff_orders (organization_id, term, price_ex_vat_nok, billing_email, status,
  fiken_invoice_number, invoice_sent_on, invoice_due_on)
VALUES ('00000000-0000-4000-8000-000000000105', 'monthly', 1490, 'faktura@example.com', 'invoiced',
  'F-105', current_date, current_date + 30);
CREATE FUNCTION pg_temp.reject_trial_cancel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id = '00000000-0000-4000-8000-000000000105'
    AND current_setting('kaupet_test.fail_trial_cancel', true) = 'on' THEN
    RAISE EXCEPTION 'forced_trial_cancel_failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_reject_trial_cancel BEFORE UPDATE OF status ON proff_orders
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_trial_cancel();
SET LOCAL kaupet_test.fail_trial_cancel = 'on';
SELECT throws_ok($$SELECT * FROM public.cancel_proff_trial('00000000-0000-4000-8000-000000000105')$$,
  'P0001', 'forced_trial_cancel_failure', 'Fakturafeil ruller tilbake prøveavslutningen');
SELECT ok((SELECT selected_plan = 'proff' AND proff_trial_cancelled_at IS NULL
  AND proff_access_until = proff_trial_ends_at FROM organizations
  WHERE id = '00000000-0000-4000-8000-000000000105'), 'Prøvetilgangen bevares ved feil');
SELECT is((SELECT status FROM proff_orders WHERE organization_id = '00000000-0000-4000-8000-000000000105'),
  'invoiced', 'Fakturaen bevares ved feil');
SET LOCAL kaupet_test.fail_trial_cancel = 'off';
SELECT is((SELECT claimed::text || '|' || sent_invoice_number FROM public.cancel_proff_trial(
  '00000000-0000-4000-8000-000000000105')), 'true|F-105', 'Retry avslutter prøven og rapporterer faktura');
SELECT ok((SELECT selected_plan = 'proff_basis' AND proff_trial_cancelled_at IS NOT NULL
  AND proff_access_until <= now() FROM organizations
  WHERE id = '00000000-0000-4000-8000-000000000105'), 'Vellykket avslutning stopper prøvetilgangen');
SELECT is((SELECT status FROM proff_orders WHERE organization_id = '00000000-0000-4000-8000-000000000105'),
  'cancelled', 'Vellykket avslutning kansellerer fakturaen');
SELECT ok(NOT (SELECT claimed FROM public.cancel_proff_trial('00000000-0000-4000-8000-000000000105')),
  'Dobbeltklikk sender ingen ny prøvebekreftelse');
SELECT throws_ok($$SELECT public.cancel_proff_trial('00000000-0000-4000-8000-000000000103')$$,
  'P0001', 'trial_not_cancellable', 'Prøveavslutning kan ikke kutte en betalt periode');

INSERT INTO organizations (id, organization_number, legal_name, display_name, selected_plan, proff_access_until)
VALUES ('00000000-0000-4000-8000-000000000106', '999000106', 'Fornyelse AS', 'Fornyelse', 'proff', now() + interval '10 days');
INSERT INTO organization_billing_profiles (organization_id, billing_email)
VALUES ('00000000-0000-4000-8000-000000000106', 'faktura@example.com');
INSERT INTO proff_orders (organization_id, term, price_ex_vat_nok, billing_email, status)
VALUES ('00000000-0000-4000-8000-000000000106', 'monthly', 1490, 'faktura@example.com', 'paid');
SELECT lives_ok($$SELECT public.register_proff_invoice_sent('F-106', current_date, current_date + 14,
  NULL, '00000000-0000-4000-8000-000000000106', 'monthly', 1490)$$,
  'Aktiv betalt avtale kan faktureres');
SELECT lives_ok($$SELECT public.cancel_proff_subscription('00000000-0000-4000-8000-000000000106')$$,
  'Oppsigelse kansellerer registrert fornyelsesfaktura');
SELECT throws_ok($$SELECT public.register_proff_invoice_sent('F-107', current_date, current_date + 14,
  NULL, '00000000-0000-4000-8000-000000000106', 'monthly', 1490)$$,
  'P0001', 'agreement_not_renewable', 'Gammel adminflate kan ikke fakturere oppsagt avtale');
SELECT is((SELECT count(*)::int FROM proff_orders WHERE organization_id = '00000000-0000-4000-8000-000000000106'
  AND status IN ('pending', 'invoiced')), 0, 'Avvist fakturering etterlater ingen åpen faktura');
UPDATE organizations SET proff_subscription_cancelled_at = NULL, proff_ended_by_kaupet_at = now()
WHERE id = '00000000-0000-4000-8000-000000000106';
SELECT throws_ok($$SELECT public.register_proff_invoice_sent('F-107', current_date, current_date + 14,
  NULL, '00000000-0000-4000-8000-000000000106', 'monthly', 1490)$$,
  'P0001', 'agreement_not_renewable', 'Kaupet-avsluttet avtale kan ikke faktureres');
UPDATE organizations SET proff_ended_by_kaupet_at = NULL, proff_access_until = now() - interval '1 day'
WHERE id = '00000000-0000-4000-8000-000000000106';
SELECT throws_ok($$SELECT public.register_proff_invoice_sent('F-107', current_date, current_date + 14,
  NULL, '00000000-0000-4000-8000-000000000106', 'monthly', 1490)$$,
  'P0001', 'agreement_not_renewable', 'Utløpt avtale kan ikke automatisk fornyes');
UPDATE organizations SET proff_access_until = now() + interval '10 days', selected_plan = 'proff_basis'
WHERE id = '00000000-0000-4000-8000-000000000106';
SELECT throws_ok($$SELECT public.register_proff_invoice_sent('F-107', current_date, current_date + 14,
  NULL, '00000000-0000-4000-8000-000000000106', 'monthly', 1490)$$,
  'P0001', 'agreement_not_renewable', 'Basisplan kan ikke faktureres som fornyelse');
INSERT INTO proff_orders (id, organization_id, term, price_ex_vat_nok, billing_email)
VALUES ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000106', 'monthly', 1490, 'faktura@example.com');
SELECT lives_ok($$SELECT public.register_proff_invoice_sent('F-107', current_date, current_date + 14,
  '00000000-0000-4000-8000-000000000107')$$, 'Eksplisitt ny bestilling kan faktureres før tilgang starter');
SELECT throws_ok($$SELECT public.register_proff_invoice_sent('F-107', current_date, current_date + 14,
  '00000000-0000-4000-8000-000000000107')$$,
  'P0001', 'order_not_invoiceable', 'Samme bestilling registreres ikke sendt to ganger');
SELECT ok(NOT has_function_privilege('anon', 'public.cancel_proff_trial(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.cancel_proff_trial(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.cancel_proff_trial(uuid)', 'EXECUTE'),
  'Prøveavslutning er kun tilgjengelig for serveren');
SELECT ok(NOT has_function_privilege('anon', 'public.register_proff_invoice_sent(text,date,date,uuid,uuid,text,integer,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.register_proff_invoice_sent(text,date,date,uuid,uuid,text,integer,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.register_proff_invoice_sent(text,date,date,uuid,uuid,text,integer,uuid)', 'EXECUTE'),
  'Fakturaregistrering er kun tilgjengelig for serveren');

SELECT * FROM finish();
ROLLBACK;
