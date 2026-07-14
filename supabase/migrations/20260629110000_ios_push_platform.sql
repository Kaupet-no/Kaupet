-- Allow iOS as a valid platform for native push subscriptions.
-- iOS uses FCM (which routes to APNs), so it shares the fcm_token column.

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT push_subscriptions_platform_check;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT push_subscriptions_platform_fields_check;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_platform_check
    CHECK (platform IN ('web', 'android', 'ios'));

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_platform_fields_check
    CHECK (
      (platform = 'web' AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL)
      OR
      (platform IN ('android', 'ios') AND fcm_token IS NOT NULL)
    );
