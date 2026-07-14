
-- Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions in public schema.
-- These functions are either admin-only, called by triggers (run as owner), or invoked
-- by authenticated users via the app. None should be callable by anonymous visitors.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon;',
                   r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role;',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;
