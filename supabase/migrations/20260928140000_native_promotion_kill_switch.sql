-- Server-side kill switch for listing promotion purchase (Vipps) inside the
-- native apps, so it can be hidden without shipping a new app build (App
-- Store guideline 3.1.1 risk). Web is unaffected — the app code only checks
-- this switch when isNative() is true.
--
-- Existing RLS on site_settings (see baseline_squash: "Site settings are
-- viewable by everyone" for SELECT, "Admins can update site settings" for
-- UPDATE) already covers this column — readable by anyone, writable only by
-- admins — same as category_suggestion_ai_enabled added in
-- 20260902190000_endpoint_rate_limits.sql.
ALTER TABLE public.site_settings
  ADD COLUMN native_promotion_enabled boolean NOT NULL DEFAULT true;
