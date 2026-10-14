-- KG-12-F01: «Minst én administrator» håndheves i databasen, ikke bare i
-- admin_revoke_role. Policyen "Admins can manage roles" gir administratorer
-- direkte DELETE/UPDATE på user_roles via Data API, og RPC-ens count-guard
-- låste ikke rollesettet, så to samtidige kall kunne begge telle 2.
--
-- Triggeren serialiserer fjerning av admin-rader med en transaksjonslås og
-- teller på nytt etter låsen (READ COMMITTED gir nytt snapshot per setning).
-- Den gjelder klientkall (auth.uid() satt, også gjennom SECURITY DEFINER-RPC).
-- service_role/DB-operatør (ingen auth.uid()) er gjenopprettingsveien og
-- kan fortsatt fjerne roller, f.eks. ved kaskadesletting av en auth-bruker.

CREATE OR REPLACE FUNCTION public.enforce_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role <> 'admin'
    OR (TG_OP = 'UPDATE' AND NEW.role = 'admin' AND NEW.user_id = OLD.user_id)
    OR auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.user_roles:admin'));
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin' AND id <> OLD.id
  ) THEN
    RAISE EXCEPTION 'Kan ikke fjerne siste administrator';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_last_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_roles_enforce_last_admin ON public.user_roles;
CREATE TRIGGER user_roles_enforce_last_admin
  BEFORE DELETE OR UPDATE OF role, user_id ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_last_admin();
