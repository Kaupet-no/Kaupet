-- Reserve standard authenticated R2 uploads atomically across Worker isolates.
CREATE TABLE public.standard_upload_quotas (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  object_count integer NOT NULL DEFAULT 0 CHECK (object_count >= 0),
  total_bytes bigint NOT NULL DEFAULT 0 CHECK (total_bytes >= 0)
);

ALTER TABLE public.standard_upload_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.standard_upload_quotas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.standard_upload_quotas TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_standard_upload_quota(
  _user_id uuid,
  _bytes bigint
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved boolean;
BEGIN
  IF _user_id IS NULL OR _bytes IS NULL OR _bytes < 1 OR _bytes > 5242880 THEN
    RETURN false;
  END IF;

  INSERT INTO public.standard_upload_quotas AS quota
    (user_id, window_started_at, object_count, total_bytes)
  VALUES (_user_id, now(), 1, _bytes)
  ON CONFLICT (user_id) DO UPDATE SET
    window_started_at = CASE
      WHEN quota.window_started_at <= now() - interval '24 hours' THEN now()
      ELSE quota.window_started_at
    END,
    object_count = CASE
      WHEN quota.window_started_at <= now() - interval '24 hours' THEN 1
      ELSE quota.object_count + 1
    END,
    total_bytes = CASE
      WHEN quota.window_started_at <= now() - interval '24 hours' THEN _bytes
      ELSE quota.total_bytes + _bytes
    END
  WHERE quota.window_started_at <= now() - interval '24 hours'
     OR (quota.object_count < 500 AND quota.total_bytes + _bytes <= 536870912)
  RETURNING true INTO reserved;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_standard_upload_quota(uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_standard_upload_quota(uuid, bigint)
  TO service_role;
