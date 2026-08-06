-- "Ris og Ros"-tilbakemeldinger fra brukere (også uinnloggede). Skrives og
-- leses utelukkende via server functions med service-role (submitFeedback har
-- egen rate-limit; admin-fns er guardet med requireAdminRole) — derfor ingen
-- anon/authenticated-policies: RLS er på og stenger alt direkte.
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('ris', 'ros')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX feedback_created_at_idx ON public.feedback (created_at DESC);
