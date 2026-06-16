CREATE TABLE public.vipps_webhook_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL UNIQUE CHECK (mode IN ('test','production')),
  webhook_id text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.vipps_webhook_secrets TO service_role;

ALTER TABLE public.vipps_webhook_secrets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER vipps_webhook_secrets_set_updated_at
  BEFORE UPDATE ON public.vipps_webhook_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();