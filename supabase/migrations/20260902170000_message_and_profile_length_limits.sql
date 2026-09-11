-- messages.body and profiles.display_name are written directly by the
-- client via supabase-js (PostgREST), not through a server function, so
-- src/start.ts's request-size middleware and the server-side zod schemas
-- never see these inserts/updates. The only length limits were client-side
-- (a <textarea maxLength> and a zod schema in profile-section.tsx), which is
-- not enforcement — a direct API call can send an arbitrarily large value.
-- See docs/SIKKERHETSVURDERING.md M-7.
--
-- 4000 matches the messages textarea limit (meldinger.$id.tsx). 80 matches
-- the profile-edit form's zod schema (profile-section.tsx) — the higher of
-- the two client-side limits in this codebase (signup's displayName field
-- caps at 50, but the profile-edit flow that actually persists this column
-- allows up to 80).

UPDATE public.messages SET body = left(body, 4000) WHERE length(body) > 4000;
UPDATE public.profiles SET display_name = left(display_name, 80) WHERE length(display_name) > 80;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_length CHECK (length(body) <= 4000);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_length CHECK (length(display_name) <= 80);
