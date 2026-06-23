-- The partial unique index from the previous migration doesn't match the
-- ON CONFLICT (fcm_token) clause PostgREST generates for
-- .upsert(..., { onConflict: "fcm_token" }) — Postgres requires the ON
-- CONFLICT target to match a unique index/constraint exactly, including its
-- WHERE predicate. A plain UNIQUE constraint works here without a WHERE
-- clause since Postgres never considers NULLs equal, so the many
-- platform='web' rows with fcm_token IS NULL don't conflict with each other.

DROP INDEX IF EXISTS public.push_subscriptions_fcm_token_key;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_fcm_token_key UNIQUE (fcm_token);
