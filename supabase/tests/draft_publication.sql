BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(23);
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000a001', 'publish-pgtap@example.com'),
  ('00000000-0000-4000-8000-00000000a002', 'other-publish-pgtap@example.com');
INSERT INTO public.listings (id, seller_id, title, status, price_nok) VALUES
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a001', 'Utkast med bilder', 'draft', 100),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000a001', 'Utkast for rollback', 'draft', 100),
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000a001', 'Maks antall bilder', 'draft', 100);
CREATE TEMP TABLE publish_images AS SELECT jsonb_build_array(jsonb_build_object(
  'id', '00000000-0000-4000-8000-00000000c001',
  'storage_path', '00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000c001.jpg',
  'sort_order', 0, 'caption', 'Ærlig bilde 🚲')) AS images;
SELECT ok(NOT has_column_privilege('authenticated', 'public.listing_images', 'id', 'INSERT'),
  'Klientens kolonnerettigheter utvides ikke');
SELECT ok(NOT has_function_privilege('anon', 'public.publish_listing_draft(uuid,uuid,jsonb,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.publish_listing_draft(uuid,uuid,jsonb,jsonb)', 'EXECUTE'),
  'Anonym og innlogget klient kan ikke velge en vilkårlig publiseringsaktør');
SELECT ok(has_function_privilege('service_role', 'public.publish_listing_draft(uuid,uuid,jsonb,jsonb)', 'EXECUTE'),
  'Autentisert server kan publisere');
SET LOCAL request.jwt.claim.role = 'service_role';
SELECT throws_ok($$SELECT public.publish_listing_draft('00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000a002', '{}', '[]')$$, '42501', 'Du har ikke tilgang til denne annonsen',
  'Annen bruker kan ikke publisere eierens utkast');
SELECT throws_ok($$SELECT public.publish_listing_draft('00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000a001', '{}', NULL)$$, 'P0001', 'Ugyldig bildeliste', 'NULL-bildeliste avvises');
SELECT throws_ok($$SELECT public.publish_listing_draft('00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000a001', '{}', '[{}]')$$, 'P0001', 'Ugyldig bildeliste', 'Ufullstendig bilde avvises');
SELECT throws_ok($$SELECT public.publish_listing_draft('00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000a001', '{}', (SELECT images || images FROM publish_images))$$,
  'P0001', 'Ugyldig bildeliste', 'Duplikate bilde-ID-er avvises');
-- Real service-role grants, rather than the browser's mocked INSERT/UPSERT.
GRANT SELECT ON publish_images TO service_role;
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.publish_listing_draft('00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000a001', '{"title":"Publisert med bilde"}', (SELECT images FROM publish_images))$$,
  'Bildeinnsetting og publisering lykkes med faktiske databaserettigheter');
RESET ROLE;
SELECT is((SELECT status::text FROM listings WHERE id = '00000000-0000-4000-8000-00000000b001'), 'active', 'Annonsen er aktiv');
SELECT is((SELECT count(*) FROM listing_images WHERE listing_id = '00000000-0000-4000-8000-00000000b001'), 1::bigint, 'Bildet er knyttet til annonsen');
SELECT is(public.publish_listing_draft('00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000a001', '{"title":"Sent forsøk"}', '[]')->>'already_published',
  'true', 'Sent forsøk bekrefter publisering');
SELECT is((SELECT title FROM listings WHERE id = '00000000-0000-4000-8000-00000000b001'), 'Publisert med bilde', 'Sent forsøk endrer ikke feltene');
SELECT is((SELECT count(*) FROM listing_images WHERE listing_id = '00000000-0000-4000-8000-00000000b001'), 1::bigint, 'Sent forsøk uten bilder sletter ikke publiserte bilder');
INSERT INTO listing_images (id, listing_id, storage_path, sort_order) VALUES (
  '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000b002',
  '00000000-0000-4000-8000-00000000b002/00000000-0000-4000-8000-00000000c002.jpg', 0);
SELECT throws_ok($$SELECT public.publish_listing_draft('00000000-0000-4000-8000-00000000b002',
  '00000000-0000-4000-8000-00000000a001', '{}', '[{"id":"00000000-0000-4000-8000-00000000c003","storage_path":"invalid.jpg","sort_order":0}]')$$,
  'P0001', 'invalid_listing_image', 'Ugyldig bildesti avbryter hele transaksjonen');
SELECT is((SELECT status::text FROM listings WHERE id = '00000000-0000-4000-8000-00000000b002'), 'draft', 'Mislykket publisering beholder utkastet');
SELECT is((SELECT count(*) FROM listing_images WHERE listing_id = '00000000-0000-4000-8000-00000000b002'), 1::bigint, 'Tidligere bildesletting rulles tilbake ved feil');
SELECT lives_ok($$SELECT public.publish_listing_draft('00000000-0000-4000-8000-00000000b002',
  '00000000-0000-4000-8000-00000000a001', '{}', '[]')$$, 'Tom bildeliste publiserer uten bilder');
SELECT is((SELECT count(*) FROM listing_images WHERE listing_id = '00000000-0000-4000-8000-00000000b002'), 0::bigint, 'Tom bildeliste erstatter utkastets bilder');
SELECT throws_ok($$SELECT public.publish_listing_draft('00000000-0000-4000-8000-00000000b003',
  '00000000-0000-4000-8000-00000000a001', '{}', (SELECT images FROM publish_images))$$,
  'P0001', 'Ugyldig bildereferanse', 'Bilde-ID fra en annen annonse kan ikke overtas');
SELECT throws_ok($$SELECT public.publish_listing_draft('00000000-0000-4000-8000-00000000b003',
  '00000000-0000-4000-8000-00000000a001', '{}', (SELECT jsonb_agg('{}'::jsonb) FROM generate_series(1,101)))$$,
  'P0001', 'Ugyldig bildeliste', '101 bilder avvises');
INSERT INTO listing_images (id, listing_id, storage_path, sort_order)
  SELECT md5('publish-image-' || n)::uuid, '00000000-0000-4000-8000-00000000b003',
    '00000000-0000-4000-8000-00000000b003/' || md5('publish-image-' || n)::uuid || '.jpg', n
  FROM generate_series(0,99) n;
SELECT lives_ok($$SELECT public.publish_listing_draft('00000000-0000-4000-8000-00000000b003',
  '00000000-0000-4000-8000-00000000a001', '{}',
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'storage_path', storage_path, 'sort_order', 99-sort_order, 'caption', repeat('ø',140)))
   FROM listing_images WHERE listing_id = '00000000-0000-4000-8000-00000000b003'))$$,
  '100 eksisterende bilder kan publiseres og omordnes uten INSERT ved grensen');
SELECT is((SELECT count(*) FROM listing_images WHERE listing_id = '00000000-0000-4000-8000-00000000b003'), 100::bigint, 'Alle 100 bilder beholdes');
SELECT is((SELECT caption FROM listing_images WHERE id = md5('publish-image-0')::uuid), repeat('ø',140), 'Bildetekst på 140 tegn lagres');
SELECT * FROM finish();
ROLLBACK;
