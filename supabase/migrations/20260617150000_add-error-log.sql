-- =========================================
-- Table: error_log
-- Audit trail for server-side errors that should not block the user-facing
-- operation but must remain visible to admins (e.g. best-effort bookkeeping
-- writes after an external payment action already succeeded).
-- =========================================
CREATE TABLE public.error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  error_message text NOT NULL,
  error_code text,
  context jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX error_log_created_idx ON public.error_log (created_at DESC);

GRANT ALL ON public.error_log TO service_role;
ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;
-- No client-facing policies: only service_role (via logServerError) writes,
-- and reads go through the SECURITY DEFINER RPC below.

CREATE OR REPLACE FUNCTION public.admin_list_error_log(_limit int DEFAULT 100)
RETURNS TABLE(
  id uuid,
  function_name text,
  error_message text,
  error_code text,
  context jsonb,
  user_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT e.id, e.function_name, e.error_message, e.error_code, e.context, e.user_id, e.created_at
  FROM public.error_log e
  ORDER BY e.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_error_log(integer) FROM anon, public;
