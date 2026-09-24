-- Fase 4 (del 1) av Proff-integrasjonen: API-nøkler for organisasjoner, samt
-- rategrense-utvidelser (gjenværende/reset-tid) og et daglig utløpsvarsel.
-- Selve REST-endepunktene (fase 4, del 2) kommer i en senere migrasjon.
--
-- Nøkkelen selv (kpt_live_…) genereres og vises kun i klartekst av
-- src/lib/api-keys.server.ts på opprettelsestidspunktet — kun sha-256-hashen
-- lagres her, og kun service_role kan lese den (kolonne-grant under, samme
-- teknikk som listing_image_jobs/internal_error, se
-- 20260924130000_listing_image_jobs.sql).

-- 1) Tabellen -----------------------------------------------------------

CREATE TABLE public.organization_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Superbrukeren som trykket "Opprett nøkkel". Kan avvike fra
  -- acting_user_id ikke i dag (samme person), men kolonnene holdes separate
  -- siden "hvem opprettet" og "hvem synken utføres som" er ulike spørsmål.
  created_by uuid NOT NULL REFERENCES auth.users(id),
  -- Aktøren `resolve_organization_api_key` returnerer til API-et/MCP-en —
  -- samme `OrganizationActor.userId` som brukes i listing-sync.server.ts.
  acting_user_id uuid NOT NULL REFERENCES auth.users(id),
  default_location_id uuid NOT NULL,
  name text NOT NULL,
  -- Første ~12 tegn av klartekstnøkkelen ("kpt_live_ab12"), kun til visning
  -- i UI-en. Aldri nok til å gjette resten av nøkkelen.
  key_prefix text NOT NULL,
  -- sha-256 av hele klartekstnøkkelen, hex-kodet (64 tegn). Se
  -- api-keys.server.ts. Kolonnen skjules for authenticated under (GRANT).
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  -- Idempotens for det daglige utløpsvarselet (14/3 dager før expires_at),
  -- samme mønster som listings.draft_expiry_notified_at
  -- (20260829170000_privacy_minimization_and_retention.sql), bare to
  -- terskler i stedet for én.
  expiry_notified_14_at timestamptz,
  expiry_notified_3_at timestamptz,
  CONSTRAINT organization_api_keys_name_length CHECK (length(trim(name)) BETWEEN 1 AND 60),
  CONSTRAINT organization_api_keys_key_hash_format CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT organization_api_keys_scopes_subset
    CHECK (scopes <@ ARRAY['listings:read', 'listings:write']::text[]),
  CONSTRAINT organization_api_keys_scopes_not_empty CHECK (array_length(scopes, 1) > 0),
  -- Besluttet i planen (fase 4): maks 365 dagers varighet, håndhevet i både
  -- DB og RPC-en (defense in depth — RPC-en er eneste kodevei i praksis).
  CONSTRAINT organization_api_keys_lifetime_max
    CHECK (expires_at <= created_at + interval '365 days'),
  CONSTRAINT organization_api_keys_lifetime_positive CHECK (expires_at > created_at),
  CONSTRAINT organization_api_keys_default_location_fk
    FOREIGN KEY (default_location_id, organization_id)
    REFERENCES public.organization_locations (id, organization_id)
);

CREATE INDEX organization_api_keys_organization_idx
  ON public.organization_api_keys (organization_id);

-- Rask "hvor mange aktive nøkler har org X"-sjekk (partial index på ikke-
-- tilbakekalte nøkler, siden det er de create_organization_api_key teller).
CREATE INDEX organization_api_keys_active_idx
  ON public.organization_api_keys (organization_id, expires_at)
  WHERE revoked_at IS NULL;

-- Ingen updated_at-kolonne/trigger her: raden er i praksis append-/
-- tombstone-only (kun revoked_at/last_used_at/expiry_notified_*_at endres i
-- ettertid, alle satt eksplisitt av RPC-ene).

ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;

-- Kolonnevalg for RLS: authenticated får SELECT på alt UNNTATT key_hash,
-- håndhevet av Postgres' kolonnenivå-GRANT (en spørring som ber om key_hash
-- feiler med "permission denied for column", uavhengig av RLS-policyen under)
-- — samme mønster som listing_image_jobs.internal_error.
REVOKE ALL ON TABLE public.organization_api_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, organization_id, created_by, acting_user_id, default_location_id, name,
  key_prefix, scopes, created_at, expires_at, last_used_at, revoked_at, revoked_by,
  expiry_notified_14_at, expiry_notified_3_at
) ON TABLE public.organization_api_keys TO authenticated;
GRANT ALL ON TABLE public.organization_api_keys TO service_role;

-- Ingen klientskriving i det hele tatt: opprettelse/tilbakekalling går kun
-- via RPC-ene under (SECURITY DEFINER, service_role).
CREATE POLICY "Organization superusers can view their API keys"
  ON public.organization_api_keys FOR SELECT TO authenticated
  USING (public.is_organization_superuser(organization_id, auth.uid()));

-- 2) create_organization_api_key -----------------------------------------

CREATE FUNCTION public.create_organization_api_key(
  _organization_id uuid,
  _user_id uuid,
  _name text,
  _default_location_id uuid,
  _scopes text[],
  _lifetime_days integer,
  _key_prefix text,
  _key_hash text
)
RETURNS public.organization_api_keys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active_count integer;
  _row public.organization_api_keys;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;
  IF _lifetime_days NOT IN (30, 90, 180, 365) THEN
    RAISE EXCEPTION 'Ugyldig varighet.';
  END IF;
  IF NOT public.is_organization_superuser(_organization_id, _user_id) THEN
    RAISE EXCEPTION 'Du har ikke tilgang til å opprette API-nøkler.';
  END IF;
  IF NOT public.organization_has_proff_access(_organization_id) THEN
    RAISE EXCEPTION 'API-nøkler krever et aktivt Proff-abonnement.';
  END IF;

  -- Rekkefølgen betyr noe: lås org-raden FØR vi teller aktive nøkler, slik
  -- at to samtidige opprettelser for samme org serialiseres i stedet for at
  -- begge leser "1 aktiv nøkkel" og begge lykkes (se SQL-røyktesten).
  PERFORM 1 FROM public.organizations WHERE id = _organization_id FOR UPDATE;

  SELECT count(*) INTO _active_count
  FROM public.organization_api_keys
  WHERE organization_id = _organization_id
    AND revoked_at IS NULL
    AND expires_at > now();
  IF _active_count >= 2 THEN
    RAISE EXCEPTION 'Dere har allerede 2 aktive nøkler. Tilbakekall én før du oppretter en ny.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_locations
    WHERE id = _default_location_id AND organization_id = _organization_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Velg en aktiv lokasjon.';
  END IF;

  INSERT INTO public.organization_api_keys (
    organization_id, created_by, acting_user_id, default_location_id, name,
    key_prefix, key_hash, scopes, expires_at
  ) VALUES (
    _organization_id, _user_id, _user_id, _default_location_id, trim(_name),
    _key_prefix, _key_hash, _scopes, now() + make_interval(days => _lifetime_days)
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_api_key(
  uuid, uuid, text, uuid, text[], integer, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_api_key(
  uuid, uuid, text, uuid, text[], integer, text, text
) TO service_role;

-- 3) revoke_organization_api_key -------------------------------------------

CREATE FUNCTION public.revoke_organization_api_key(_key_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _organization_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;

  SELECT organization_id INTO _organization_id
  FROM public.organization_api_keys
  WHERE id = _key_id;
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'Fant ikke nøkkelen.';
  END IF;
  IF NOT public.is_organization_superuser(_organization_id, _user_id) THEN
    RAISE EXCEPTION 'Du har ikke tilgang til å tilbakekalle denne nøkkelen.';
  END IF;

  UPDATE public.organization_api_keys
  SET revoked_at = now(), revoked_by = _user_id
  WHERE id = _key_id AND revoked_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_organization_api_key(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_organization_api_key(uuid, uuid) TO service_role;

-- 4) resolve_organization_api_key ------------------------------------------
--
-- Slår opp en nøkkel fra hashen og validerer at den fortsatt kan brukes:
-- ikke tilbakekalt, ikke utløpt, den utøvende brukeren fortsatt aktivt
-- medlem, og organisasjonen har fortsatt Proff-tilgang. Returnerer alltid
-- nøyaktig én rad med en `reason`-kode API-et kan slå opp riktig HTTP-status
-- og norsk feiltekst fra (se api-keys.server.ts):
--   'ok'               – nøkkelen kan brukes, feltene under er fylt ut.
--   'unknown'          – ingen nøkkel har denne hashen.
--   'revoked'          – tilbakekalt.
--   'expired'          – expires_at passert.
--   'inactive_member'  – acting_user_id er ikke lenger et aktivt medlem.
--   'no_proff'         – organisasjonen har ikke lenger Proff-tilgang.
CREATE FUNCTION public.resolve_organization_api_key(_key_hash text)
RETURNS TABLE (
  reason text,
  key_id uuid,
  organization_id uuid,
  acting_user_id uuid,
  default_location_id uuid,
  scopes text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.organization_api_keys;
  _member_active boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;

  SELECT * INTO _row FROM public.organization_api_keys WHERE key_hash = _key_hash;
  IF _row.id IS NULL THEN
    RETURN QUERY SELECT 'unknown'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text[];
    RETURN;
  END IF;

  IF _row.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'revoked'::text, _row.id, _row.organization_id, NULL::uuid, NULL::uuid, NULL::text[];
    RETURN;
  END IF;
  IF _row.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, _row.id, _row.organization_id, NULL::uuid, NULL::uuid, NULL::text[];
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _row.organization_id
      AND m.user_id = _row.acting_user_id
      AND m.status = 'active'
  ) INTO _member_active;
  IF NOT _member_active THEN
    RETURN QUERY SELECT 'inactive_member'::text, _row.id, _row.organization_id, NULL::uuid, NULL::uuid, NULL::text[];
    RETURN;
  END IF;

  IF NOT public.organization_has_proff_access(_row.organization_id) THEN
    RETURN QUERY SELECT 'no_proff'::text, _row.id, _row.organization_id, NULL::uuid, NULL::uuid, NULL::text[];
    RETURN;
  END IF;

  -- Kast last_used_at maks én gang per minutt: en løpende integrasjon som
  -- kaller endepunktet flere ganger i sekundet skal ikke skrive til denne
  -- raden på hvert kall.
  UPDATE public.organization_api_keys
  SET last_used_at = now()
  WHERE id = _row.id
    AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute');

  RETURN QUERY SELECT
    'ok'::text, _row.id, _row.organization_id, _row.acting_user_id,
    _row.default_location_id, _row.scopes;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_organization_api_key(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_organization_api_key(text) TO service_role;

-- 5) Rategrenseforbruk: gjenværende/reset-tid oppå endpoint_rate_limits ----
--
-- check_endpoint_rate_limit (20260909120000_close_data_api_security_gaps.sql)
-- gir kun boolean — API-et trenger i tillegg gjenværende antall og
-- tilbakestillingstidspunkt til X-RateLimit-*/Retry-After-headerne (se
-- api-rate-limit.server.ts). Vi legger til to funksjoner på samme tabell i
-- stedet for å endre check_endpoint_rate_limit, slik at dagens brukere av
-- den (assertNotRateLimited/assertUserNotRateLimited i rate-limit.server.ts)
-- er upåvirket.
CREATE FUNCTION public.consume_rate_limit(
  _bucket text,
  _key_hash text,
  _limit integer,
  _window_seconds integer
)
RETURNS TABLE (allowed boolean, count integer, "limit" integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _attempts integer;
  _window_started_at timestamptz;
  _window_interval interval;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;
  IF length(_key_hash) <> 64 OR _limit <= 0 OR _window_seconds <= 0 THEN
    RAISE EXCEPTION 'Invalid rate-limit input';
  END IF;
  _window_interval := make_interval(secs => _window_seconds);

  INSERT INTO public.endpoint_rate_limits AS limits
    (bucket, key_hash, window_started_at, attempts)
  VALUES (_bucket, _key_hash, now(), 1)
  ON CONFLICT (bucket, key_hash) DO UPDATE SET
    attempts = CASE
      WHEN limits.window_started_at < now() - _window_interval THEN 1
      ELSE limits.attempts + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at < now() - _window_interval THEN now()
      ELSE limits.window_started_at
    END
  RETURNING attempts, limits.window_started_at INTO _attempts, _window_started_at;

  RETURN QUERY SELECT
    _attempts <= _limit, _attempts, _limit, _window_started_at + _window_interval;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer)
  TO service_role;

-- Samme beregning, uten å telle opp — brukes av «Grenser og forbruk»-UI-en
-- (getIntegrationUsage) slik at det å ÅPNE bedriftskonsollet aldri bruker av
-- kundens egen rategrense.
CREATE FUNCTION public.peek_rate_limit(
  _bucket text,
  _key_hash text,
  _limit integer,
  _window_seconds integer
)
RETURNS TABLE (count integer, "limit" integer, reset_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN l.window_started_at < now() - make_interval(secs => _window_seconds) THEN 0
         ELSE l.attempts END,
    _limit,
    CASE WHEN l.window_started_at < now() - make_interval(secs => _window_seconds) THEN now() + make_interval(secs => _window_seconds)
         ELSE l.window_started_at + make_interval(secs => _window_seconds) END
  FROM public.endpoint_rate_limits l
  WHERE l.bucket = _bucket AND l.key_hash = _key_hash
  UNION ALL
  SELECT 0, _limit, now() + make_interval(secs => _window_seconds)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.endpoint_rate_limits WHERE bucket = _bucket AND key_hash = _key_hash
  )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.peek_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peek_rate_limit(text, text, integer, integer)
  TO service_role;

-- 6) Daglig utløpsvarsel (14 og 3 dager før expires_at) --------------------
--
-- Samme sendings-mønster som push-varsler (dispatch_push_for_message,
-- baseline_squash.sql) og bildekøen (dispatch_listing_image_jobs,
-- 20260924130000_listing_image_jobs.sql): en secret-beskyttet endepunkt
-- kalt via pg_net, som selv slår opp e-postadresse(r) og sender med
-- sendNotificationEmail (src/lib/email.server.ts). Kun api_key_id og
-- threshold sendes i payloaden — resten re-utledes fra databasen i
-- endepunktet, slik at et lekket secret ikke kan brukes til å sende
-- vilkårlig innhold.
--
-- Oppsett som gjenstår før dette faktisk sender e-post (se rapporten):
--   * API_KEY_EXPIRY_SECRET som miljøvariabel på workeren (wrangler secret)
--     og i app_settings-raden 'api_key_expiry_secret'.
--   * Utenfor prod: app_settings-raden 'api_key_expiry_url'.
CREATE FUNCTION public.notify_expiring_organization_api_keys() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text := COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'api_key_expiry_url'),
    'https://kaupet.no/api/public/api-keys/expiry-notify'
  );
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'api_key_expiry_secret');
  _key RECORD;
BEGIN
  IF _secret IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.organization_api_keys
      WHERE revoked_at IS NULL AND expires_at > now()
        AND ((expiry_notified_14_at IS NULL AND expires_at <= now() + interval '14 days')
          OR (expiry_notified_3_at IS NULL AND expires_at <= now() + interval '3 days'))
    ) THEN
      RAISE WARNING 'API-nøkkel-utløpsvarsel hoppet over: app_settings-raden "api_key_expiry_secret" er ikke satt';
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
    IF _key.threshold = 14 THEN
      UPDATE public.organization_api_keys SET expiry_notified_14_at = now() WHERE id = _key.id;
    ELSE
      UPDATE public.organization_api_keys SET expiry_notified_3_at = now() WHERE id = _key.id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_expiring_organization_api_keys()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_expiring_organization_api_keys() TO service_role;

SELECT cron.schedule(
  'organization-api-key-expiry-notice-daily',
  '20 7 * * *',
  'SELECT public.notify_expiring_organization_api_keys();'
);
