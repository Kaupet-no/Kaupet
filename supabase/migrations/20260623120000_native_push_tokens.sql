-- Allow push_subscriptions to also hold native FCM tokens (Android app),
-- alongside the existing Web Push subscriptions (endpoint/p256dh/auth).

ALTER TABLE public.push_subscriptions
  ALTER COLUMN endpoint DROP NOT NULL,
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

ALTER TABLE public.push_subscriptions
  ADD COLUMN platform text NOT NULL DEFAULT 'web',
  ADD COLUMN fcm_token text;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_platform_check
    CHECK (platform IN ('web', 'android'));

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_platform_fields_check
    CHECK (
      (platform = 'web' AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL)
      OR
      (platform = 'android' AND fcm_token IS NOT NULL)
    );

CREATE UNIQUE INDEX push_subscriptions_fcm_token_key
  ON public.push_subscriptions(fcm_token)
  WHERE fcm_token IS NOT NULL;
