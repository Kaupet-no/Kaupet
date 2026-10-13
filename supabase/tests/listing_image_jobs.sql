-- KG-15-F01 / KG-10-F01: tidsavgrenset claim og atomisk, idempotent fullføring.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(16);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000e001', 'image-jobs-pgtap@example.com');
INSERT INTO public.organizations (id, organization_number, legal_name, display_name)
VALUES ('00000000-0000-4000-8000-00000000e101', '999000301', 'Bildejobb AS', 'Bildejobb');
INSERT INTO public.listings (id, seller_id, organization_id, title, status, price_nok) VALUES
  ('00000000-0000-4000-8000-00000000e201', '00000000-0000-4000-8000-00000000e001',
   '00000000-0000-4000-8000-00000000e101', 'Annonse med bildejobb', 'draft', 100);
INSERT INTO public.listing_image_jobs (id, organization_id, listing_id, source_url) VALUES
  ('00000000-0000-4000-8000-00000000e301', '00000000-0000-4000-8000-00000000e101',
   '00000000-0000-4000-8000-00000000e201', 'https://example.com/a.jpg'),
  ('00000000-0000-4000-8000-00000000e302', '00000000-0000-4000-8000-00000000e101',
   '00000000-0000-4000-8000-00000000e201', 'https://example.com/b.jpg');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.complete_listing_image_job(uuid,integer,text,text,integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
  'public.complete_listing_image_job(uuid,integer,text,text,integer)', 'EXECUTE'),
  'Klienter kan ikke fullføre bildejobber');

SET LOCAL request.jwt.claim.role = 'service_role';

CREATE TEMP TABLE claimed AS
  SELECT id, attempts FROM public.claim_listing_image_jobs(100)
  WHERE listing_id = '00000000-0000-4000-8000-00000000e201';
SELECT is((SELECT count(*)::int FROM claimed), 2, 'Ventende jobber claimes');
SELECT is((SELECT count(*)::int FROM public.claim_listing_image_jobs(100)
  WHERE listing_id = '00000000-0000-4000-8000-00000000e201'), 0,
  'Et aktivt lån claimes ikke på nytt');

-- Workeren dør: lånet utløper (updated_at settes ellers av triggeren).
ALTER TABLE public.listing_image_jobs DISABLE TRIGGER listing_image_jobs_set_updated_at;
UPDATE public.listing_image_jobs SET updated_at = now() - interval '11 minutes'
WHERE id = '00000000-0000-4000-8000-00000000e301';
ALTER TABLE public.listing_image_jobs ENABLE TRIGGER listing_image_jobs_set_updated_at;

SELECT results_eq(
  $$SELECT id, attempts FROM public.claim_listing_image_jobs(100)
    WHERE listing_id = '00000000-0000-4000-8000-00000000e201'$$,
  $$VALUES ('00000000-0000-4000-8000-00000000e301'::uuid, 2)$$,
  'Utgått processing-lån claimes på nytt med nytt forsøksnummer');

SELECT is(public.complete_listing_image_job('00000000-0000-4000-8000-00000000e301', 1,
  '00000000-0000-4000-8000-00000000e201/00000000-0000-4000-8000-00000000e401.jpg', 'h', 1),
  'stale', 'Den gamle workeren kan ikke fullføre etter overtakelse');
SELECT is((SELECT count(*)::int FROM public.listing_images
  WHERE listing_id = '00000000-0000-4000-8000-00000000e201'), 0,
  'Den gamle workeren skrev ingen bilderad');

SELECT is(public.complete_listing_image_job('00000000-0000-4000-8000-00000000e301', 2,
  '00000000-0000-4000-8000-00000000e201/00000000-0000-4000-8000-00000000e402.jpg', 'h', 1),
  'done', 'Gjeldende claim fullfører');
SELECT is((SELECT status FROM public.listing_image_jobs
  WHERE id = '00000000-0000-4000-8000-00000000e301'), 'done', 'Jobben er done');
SELECT is((SELECT count(*)::int FROM public.listing_images
  WHERE source_url = 'https://example.com/a.jpg'), 1, 'Én bilderad per jobb');

SELECT is(public.complete_listing_image_job('00000000-0000-4000-8000-00000000e301', 2,
  '00000000-0000-4000-8000-00000000e201/00000000-0000-4000-8000-00000000e403.jpg', 'h', 1),
  'stale', 'Gjentatt fullføring er en no-op');
SELECT is((SELECT count(*)::int FROM public.listing_images
  WHERE source_url = 'https://example.com/a.jpg'), 1, 'Gjentatt fullføring gir ingen duplikat');

-- En ny synk erstatter bildesettet mens jobb b behandles.
SELECT lives_ok($$SELECT public.enqueue_listing_image_jobs(
  '00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-00000000e201',
  ARRAY['https://example.com/a.jpg'], true)$$, 'Erstattende synk fjerner jobb b');
SELECT is(public.complete_listing_image_job('00000000-0000-4000-8000-00000000e302', 1,
  '00000000-0000-4000-8000-00000000e201/00000000-0000-4000-8000-00000000e404.jpg', 'h', 1),
  'stale', 'En erstattet jobb kan ikke fullføres');
SELECT is((SELECT count(*)::int FROM public.listing_images
  WHERE source_url = 'https://example.com/b.jpg'), 0,
  'Erstattet jobb legger ikke gamle bilder tilbake');

-- En jobb som dreper workeren hver gang gis opp etter 24 timer i stedet
-- for å claimes hvert tiende minutt for alltid.
ALTER TABLE public.listing_image_jobs DISABLE TRIGGER listing_image_jobs_set_updated_at;
INSERT INTO public.listing_image_jobs
  (id, organization_id, listing_id, source_url, status, attempts, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-00000000e303', '00000000-0000-4000-8000-00000000e101',
  '00000000-0000-4000-8000-00000000e201', 'https://example.com/c.jpg', 'processing', 40,
  now() - interval '25 hours', now() - interval '11 minutes');
ALTER TABLE public.listing_image_jobs ENABLE TRIGGER listing_image_jobs_set_updated_at;
SELECT is((SELECT count(*)::int FROM public.claim_listing_image_jobs(100)
  WHERE id = '00000000-0000-4000-8000-00000000e303'), 0,
  'Utløpt lån eldre enn 24 timer claimes ikke');
SELECT is((SELECT status FROM public.listing_image_jobs
  WHERE id = '00000000-0000-4000-8000-00000000e303'), 'failed',
  'Utløpt lån eldre enn 24 timer markeres failed');

SELECT * FROM finish();
ROLLBACK;
