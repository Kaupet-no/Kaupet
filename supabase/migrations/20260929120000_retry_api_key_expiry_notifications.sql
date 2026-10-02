-- La endepunktet markere varslet først etter vellykket e-postsending.
-- pg_net er asynkront: net.http_post bekrefter bare kølegging, ikke levering.
CREATE OR REPLACE FUNCTION public.notify_expiring_organization_api_keys() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text := (SELECT value FROM public.app_settings WHERE key = 'api_key_expiry_url');
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'api_key_expiry_secret');
  _key RECORD;
BEGIN
  IF _url IS NULL OR _secret IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.organization_api_keys
      WHERE revoked_at IS NULL AND expires_at > now()
        AND ((expiry_notified_14_at IS NULL AND expires_at <= now() + interval '14 days')
          OR (expiry_notified_3_at IS NULL AND expires_at <= now() + interval '3 days'))
    ) THEN
      RAISE WARNING 'API-nøkkel-utløpsvarsel hoppet over: app_settings-raden "api_key_expiry_url" eller "api_key_expiry_secret" er ikke satt';
    END IF;
    RETURN;
  END IF;

  FOR _key IN
    SELECT id, 14 AS threshold FROM public.organization_api_keys
    WHERE revoked_at IS NULL AND expires_at > now()
      AND expiry_notified_14_at IS NULL AND expires_at <= now() + interval '14 days'
    UNION ALL
    SELECT id, 3 AS threshold FROM public.organization_api_keys
    WHERE revoked_at IS NULL AND expires_at > now()
      AND expiry_notified_3_at IS NULL AND expires_at <= now() + interval '3 days'
  LOOP
    PERFORM net.http_post(
      url := _url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Api-Key-Expiry-Secret', _secret
      ),
      body := jsonb_build_object('api_key_id', _key.id, 'threshold_days', _key.threshold)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_expiring_organization_api_keys()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_expiring_organization_api_keys() TO service_role;
