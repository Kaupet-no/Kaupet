-- Web Push rows may target only browser push services supported by Kaupet.
-- NOT VALID leaves historical rows intact while checking every new or changed row.
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_web_provider_check CHECK (
    platform <> 'web' OR (
      endpoint IS NOT NULL AND
      endpoint ~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.push\.apple\.com|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.notify\.windows\.com)(:443)?/[^#]*$'
    )
  ) NOT VALID;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_web_keys_check CHECK (
    platform <> 'web' OR (
      p256dh IS NOT NULL AND p256dh ~ '^B[A-P][A-Za-z0-9_-]{84}[AEIMQUYcgkosw048]$' AND
      auth IS NOT NULL AND auth ~ '^[A-Za-z0-9_-]{21}[AQgw]$'
    )
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.enforce_push_subscription_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
  IF (
    SELECT count(*)
    FROM public.push_subscriptions
    WHERE user_id = NEW.user_id
  ) > 20 THEN
    RAISE EXCEPTION 'A user may have at most 20 push subscriptions'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_push_subscription_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER push_subscriptions_user_limit
  AFTER INSERT OR UPDATE OF user_id ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_push_subscription_limit();
