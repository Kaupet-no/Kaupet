-- ============ user_verifications ============
CREATE TABLE public.user_verifications (
  user_id uuid NOT NULL,
  provider text NOT NULL,
  verified_name text NOT NULL,
  subject text NOT NULL,
  phone_e164 text,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 months'),
  PRIMARY KEY (user_id, provider)
);

GRANT SELECT ON public.user_verifications TO authenticated;
GRANT ALL ON public.user_verifications TO service_role;

ALTER TABLE public.user_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own verifications"
  ON public.user_verifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies: only service_role (callback) may write.

-- ============ vipps_oauth_states ============
CREATE TABLE public.vipps_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

GRANT ALL ON public.vipps_oauth_states TO service_role;

ALTER TABLE public.vipps_oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

-- ============ user_verification_status RPC ============
CREATE OR REPLACE FUNCTION public.user_verification_status(_user_id uuid)
RETURNS TABLE(
  provider text,
  verified_name text,
  verified_at timestamptz,
  expires_at timestamptz,
  is_valid boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.provider,
    v.verified_name,
    v.verified_at,
    v.expires_at,
    (v.expires_at > now()) AS is_valid
  FROM public.user_verifications v
  WHERE v.user_id = _user_id
    AND v.expires_at > now()
  ORDER BY v.verified_at DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.user_verification_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_verification_status(uuid) TO anon, authenticated, service_role;