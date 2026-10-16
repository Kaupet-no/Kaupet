BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(10);

-- Isoler: bare de to testadministratorene finnes i transaksjonen.
DELETE FROM public.user_roles WHERE role = 'admin';
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'admin-a-pgtap@example.com'),
  ('00000000-0000-4000-8000-0000000000a2', 'admin-b-pgtap@example.com');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'admin'),
  ('00000000-0000-4000-8000-0000000000a2', 'admin');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok($$DELETE FROM public.user_roles
  WHERE user_id = '00000000-0000-4000-8000-0000000000a2' AND role = 'admin'$$,
  'Admin kan fjerne en annen admin når én blir igjen');
SELECT throws_ok($$DELETE FROM public.user_roles
  WHERE user_id = '00000000-0000-4000-8000-0000000000a1' AND role = 'admin'$$,
  'P0001', 'Kan ikke fjerne siste administrator', 'Direkte DELETE av siste admin avvises');
SELECT throws_ok($$UPDATE public.user_roles SET role = 'user'
  WHERE user_id = '00000000-0000-4000-8000-0000000000a1' AND role = 'admin'$$,
  'P0001', 'Kan ikke fjerne siste administrator', 'Direkte UPDATE bort fra admin avvises');
SELECT throws_ok($$UPDATE public.user_roles SET user_id = '00000000-0000-4000-8000-0000000000a2'
  WHERE user_id = '00000000-0000-4000-8000-0000000000a1' AND role = 'admin'$$,
  'P0001', 'Kan ikke fjerne siste administrator', 'Flytting av siste adminrad avvises');
SELECT throws_ok($$SELECT public.admin_revoke_role('00000000-0000-4000-8000-0000000000a1')$$,
  'P0001', 'Kan ikke fjerne siste administrator', 'RPC avviser fortsatt siste admin');
SELECT throws_ok($$SELECT public.request_account_deletion('admin-a-pgtap@example.com')$$,
  'P0001', 'Kan ikke slette kontoen til siste administrator',
  'Siste admin kan ikke bestille kontosletting');
SELECT lives_ok($$INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-4000-8000-0000000000a2', 'admin')$$, 'Ny admin kan legges til');
SELECT lives_ok($$SELECT public.request_account_deletion('admin-a-pgtap@example.com')$$,
  'Admin kan bestille kontosletting når en annen admin blir igjen');
SELECT throws_ok($$DELETE FROM public.user_roles
  WHERE user_id = '00000000-0000-4000-8000-0000000000a2' AND role = 'admin'$$,
  'P0001', 'Kan ikke fjerne siste administrator',
  'Admin med ventende sletting teller ikke som gjenværende');

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
DELETE FROM public.user_roles WHERE user_id = '00000000-0000-4000-8000-0000000000a2';
SELECT lives_ok($$DELETE FROM public.user_roles WHERE role = 'admin'$$,
  'DB-operatør uten auth.uid() kan fortsatt gjenopprette/rydde');

SELECT * FROM finish();
ROLLBACK;
