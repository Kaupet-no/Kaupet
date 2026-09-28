-- Fjerner den hardkodede produksjons-URL-en som alle pg_net-utsendelser falt
-- tilbake til når app_settings-raden manglet.
--
-- Fallbacken gjorde at en database uten radene kalte produksjonens Worker i
-- det stille: lokale stacker og CI-stacker (bun run test:rls / test:e2e)
-- postet push-kall til https://kaupet.no ved hver nye samtale/melding (alle
-- avvist med 401), og staging kunne ikke skilles fra produksjonen uten å se i
-- tabellen. Se docs/INFRASTRUKTUR.md § 5.
--
-- Nå må hvert miljø ha URL-radene satt eksplisitt, også produksjonen:
--   push_dispatch_url, r2_cleanup_url, image_jobs_url, api_key_expiry_url.
-- Mangler URL eller hemmelighet, postes det ikke:
--   * push-triggerne skriver en rad til push_dispatch_failures (synlig, 30
--     dagers retensjon), og insert-en som utløste triggeren går som før.
--   * cron-funksjonene gir RAISE WARNING og returnerer, samme mønster som de
--     allerede hadde for manglende hemmelighet.
--
-- De seks push-triggerne var kopier av samme kropp; de går nå gjennom
-- dispatch_push(). Herdingen er bevart: SECURITY DEFINER, search_path =
-- public, EXCEPTION → push_dispatch_failures, og REVOKE på hjelperen.
-- Grants på eksisterende funksjoner beholdes av CREATE OR REPLACE.

-- 1) Push -------------------------------------------------------------------

CREATE FUNCTION public.dispatch_push(_kind text, _payload jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _url text := (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_url');
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_secret');
BEGIN
  IF _url IS NULL OR _secret IS NULL THEN
    -- Uten URL ville vi ikke visst hvor vi skulle poste; uten hemmelighet
    -- svarer endepunktet 401, som pg_net svelger. Begge deler skal synes.
    INSERT INTO public.push_dispatch_failures (kind, payload, error)
    VALUES (_kind, _payload, 'ikke sendt: app_settings-raden "push_dispatch_url" eller "push_dispatch_secret" er ikke satt');
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Push-Dispatch-Secret', _secret
    ),
    body := jsonb_build_object('type', _kind) || _payload
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES (_kind, _payload, SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_push(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_push_for_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.dispatch_push('message', jsonb_build_object('message_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_push_for_price_drop() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.dispatch_push('price_drop', jsonb_build_object('price_drop_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_push_for_saved_search() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.dispatch_push('saved_search', jsonb_build_object('notification_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_push_for_sold() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.dispatch_push('sold', jsonb_build_object('sold_notification_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_push_for_wtb_match() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.dispatch_push('wtb_match', jsonb_build_object('notification_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_push_for_conversation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.dispatch_push('conversation_created', jsonb_build_object('conversation_id', NEW.id));
  RETURN NEW;
END;
$$;

-- 2) R2-opprydning (uendret bortsett fra URL-sjekken) -----------------------

CREATE OR REPLACE FUNCTION public.dispatch_r2_cleanup() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _url text := (SELECT value FROM public.app_settings WHERE key = 'r2_cleanup_url');
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'r2_cleanup_secret');
  _stale_count integer;
  _oldest timestamptz;
  _exhausted_count integer;
  _exhausted_oldest timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.r2_delete_queue) THEN
    RETURN;
  END IF;
  IF _url IS NULL THEN
    RAISE WARNING 'r2-opprydning hoppet over: app_settings-raden "r2_cleanup_url" er ikke satt';
    RETURN;
  END IF;
  IF _secret IS NULL THEN
    -- Uten hemmeligheten ville kallet blitt avvist med 401, og pg_net
    -- svelger det svaret — køen ville vokst i det stille uten noe signal.
    -- Post ikke i det hele tatt, og varsle i loggen i stedet.
    RAISE WARNING 'r2-opprydning hoppet over: app_settings-raden "r2_cleanup_secret" er ikke satt';
    RETURN;
  END IF;
  -- Rader med attempts = 0 er aldri forsøkt. Da har endepunktet ikke svart
  -- 200 i det hele tatt — manglende worker-secret gir 401, Cloudflare Access
  -- gir en innloggingsside (pg_net følger 302 og lagrer den som 200), feil
  -- r2_cleanup_url gir 404 — og pg_net svelger alle uten spor. Jobben går
  -- hver time, så en urørt rad eldre enn seks timer betyr at kallet ikke
  -- kommer fram, ikke at én rad er vanskelig. Rader som HAR vært forsøkt har
  -- attempts > 0 og last_error, og er synlige i tabellen uten dette varselet.
  SELECT count(*), min(requested_at) INTO _stale_count, _oldest
  FROM public.r2_delete_queue
  WHERE attempts = 0 AND requested_at < now() - interval '6 hours';
  IF _stale_count > 0 THEN
    RAISE WARNING 'r2-opprydning: % rad(er) i r2_delete_queue er aldri forsøkt, eldste fra %. Endepunktet svarer sannsynligvis ikke 200 — sjekk worker-secreten R2_CLEANUP_SECRET, app_settings-raden r2_cleanup_url, og om miljøet ligger bak en Cloudflare Access-policy på /api/public/*.', _stale_count, _oldest;
  END IF;
  -- Rader med attempts >= 10 er derimot faktisk forsøkt og feiler
  -- permanent. De faller ut av spørringen i /api/public/r2/cleanup.ts
  -- (attempts < MAX_ATTEMPTS) og slettes bevisst ikke — se kommentaren der.
  -- Terskelen 10 er duplisert i MAX_ATTEMPTS i
  -- src/routes/api/public/r2/cleanup.ts; oppdater begge steder samtidig.
  SELECT count(*), min(requested_at) INTO _exhausted_count, _exhausted_oldest
  FROM public.r2_delete_queue
  WHERE attempts >= 10;
  IF _exhausted_count > 0 THEN
    RAISE WARNING 'r2-opprydning: % rad(er) i r2_delete_queue har brukt opp alle forsøkene, eldste fra %. Slettingen feiler permanent — se last_error i public.r2_delete_queue for manuell oppfølging.', _exhausted_count, _exhausted_oldest;
  END IF;
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-R2-Cleanup-Secret', _secret
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- 3) Bildejobber -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dispatch_listing_image_jobs() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _url text := (SELECT value FROM public.app_settings WHERE key = 'image_jobs_url');
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'image_jobs_secret');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.listing_image_jobs
    WHERE status = 'pending' AND next_attempt_at <= now()
  ) THEN
    RETURN;
  END IF;
  IF _url IS NULL THEN
    RAISE WARNING 'bildejobb-prosessering hoppet over: app_settings-raden "image_jobs_url" er ikke satt';
    RETURN;
  END IF;
  IF _secret IS NULL THEN
    RAISE WARNING 'bildejobb-prosessering hoppet over: app_settings-raden "image_jobs_secret" er ikke satt';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Image-Jobs-Secret', _secret
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- 4) Utløpsvarsel for API-nøkler ---------------------------------------------
--
-- Viktig her: løkken markerer nøkkelen som varslet etter posten, så et kall
-- til feil miljø ville brent varselet for godt. Derfor sjekkes URL-en før
-- løkken, sammen med hemmeligheten.

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
    IF _key.threshold = 14 THEN
      UPDATE public.organization_api_keys SET expiry_notified_14_at = now() WHERE id = _key.id;
    ELSE
      UPDATE public.organization_api_keys SET expiry_notified_3_at = now() WHERE id = _key.id;
    END IF;
  END LOOP;
END;
$$;
