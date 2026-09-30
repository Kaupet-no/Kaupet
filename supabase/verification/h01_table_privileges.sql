-- Run after migrations against local Supabase: psql -v ON_ERROR_STOP=1 -f this-file
-- The transaction creates an ephemeral public table and always rolls it back.
BEGIN;
SET LOCAL ROLE postgres;

CREATE TABLE public.h01_table_privilege_probe (id integer);

DO $$
DECLARE
  _relation record;
  _role name;
  _privilege text;
  _client_roles constant name[] := ARRAY['anon', 'authenticated'];
  _client_privileges text[] := ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'];
BEGIN
  IF has_table_privilege('anon', 'public.listings', 'SELECT') IS DISTINCT FROM true
     OR has_table_privilege('anon', 'public.listings', 'DELETE') IS DISTINCT FROM true
     OR has_table_privilege('authenticated', 'public.listings', 'SELECT') IS DISTINCT FROM true
     OR has_table_privilege('authenticated', 'public.listings', 'DELETE') IS DISTINCT FROM true
     OR has_table_privilege('anon', 'public.listings', 'INSERT') IS DISTINCT FROM false
     OR has_table_privilege('anon', 'public.listings', 'UPDATE') IS DISTINCT FROM false
     OR has_table_privilege('authenticated', 'public.listings', 'INSERT') IS DISTINCT FROM false
     OR has_table_privilege('authenticated', 'public.listings', 'UPDATE') IS DISTINCT FROM false
     OR has_table_privilege('service_role', 'public.listings', 'SELECT') IS DISTINCT FROM true
     OR has_table_privilege('service_role', 'public.listings', 'INSERT') IS DISTINCT FROM true
     OR has_table_privilege('service_role', 'public.listings', 'UPDATE') IS DISTINCT FROM true
     OR has_table_privilege('service_role', 'public.listings', 'DELETE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'H01 changed existing listings DML grants';
  END IF;

  IF has_table_privilege('service_role', 'public.h01_table_privilege_probe', 'SELECT') IS DISTINCT FROM true
     OR has_table_privilege('service_role', 'public.h01_table_privilege_probe', 'INSERT') IS DISTINCT FROM true
     OR has_table_privilege('service_role', 'public.h01_table_privilege_probe', 'UPDATE') IS DISTINCT FROM true
     OR has_table_privilege('service_role', 'public.h01_table_privilege_probe', 'DELETE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'H01 changed postgres default service-role DML grants';
  END IF;

  IF current_setting('server_version_num')::integer >= 170000 THEN
    _client_privileges := array_append(_client_privileges, 'MAINTAIN');
  END IF;

  FOR _relation IN
    SELECT c.oid, format('%I.%I', n.nspname, c.relname) AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    FOREACH _role IN ARRAY _client_roles LOOP
      FOREACH _privilege IN ARRAY _client_privileges LOOP
        IF has_table_privilege(_role, _relation.oid, _privilege) THEN
          RAISE EXCEPTION 'H01 left % privilege for % on %', _privilege, _role, _relation.name;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

ROLLBACK;
