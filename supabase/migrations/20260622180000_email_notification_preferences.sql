-- Email notification preferences, mirroring the web_push_* columns. The
-- dispatch.ts route (already invoked for every push event) now also sends
-- email when these are enabled, so no new triggers are needed.

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_messages boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_saved_searches boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_price_drops boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sold boolean NOT NULL DEFAULT false;
