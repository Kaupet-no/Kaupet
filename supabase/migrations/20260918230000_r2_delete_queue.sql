-- Opprydning av R2-objekter når en annonse, samtale, organisasjon eller
-- konto slettes.
--
-- Postgres kan ikke selv nå R2, så kaskadene våre etterlater binærfilene selv
-- om metadataradene forsvinner (kjent gap i
-- docs/PERSONVERN-BEHANDLINGSPROTOKOLL.md, relevant for retten til sletting).
--
-- Valgt løsning: en slettekø som fylles av triggere og tømmes av en jobb.
-- Alternativene vi forkastet:
--   * Rydde i en serverfunksjon før sletting. Fanger ikke de viktigste
--     stiene: annonser slettes klientsidig rett mot tabellen
--     (mine-annonser.index.tsx), samtaler slettes bare via kaskade fra
--     listings, og kontosletting skjer helt inne i Postgres
--     (purge_expired_accounts).
--   * En jobb som lister R2 og sammenligner mot databasen. Dyr på en bucket
--     som vokser, og rydder først i etterkant. En trigger vet nøyaktig hva
--     som forsvant, i samme transaksjon som slettingen.
-- Køen gir dessuten et revisjonsspor på at slettingen faktisk ble utført,
-- som er nyttig nettopp for GDPR-dokumentasjonen.
--
-- Oppsett som må på plass før jobben virker (samme mønster som push):
--   * R2_CLEANUP_SECRET i secrets/cloudflare.env (miljøvariabel for appen)
--   * app_settings-radene 'r2_cleanup_secret' (samme verdi) og, utenfor prod,
--     'r2_cleanup_url' som peker på riktig miljø.
-- Uten hemmeligheten poster dispatch_r2_cleanup ikke i det hele tatt —
-- pg_net svelger et 401-svar uten header, så et postet kall ville forsvunnet
-- stille. I stedet gir funksjonen RAISE WARNING i Postgres-loggen, og
-- r2_delete_queue vokser synlig med attempts = 0.
--
-- Vi køer *prefikser*, ikke enkeltnøkler: alle nøkler er partisjonert på
-- eier-id (`{listingId}/…`, `{conversationId}/…`, `{userId}/…`), så én rad
-- dekker hele annonsen — inkludert thumbnails og 360-frames, som deler
-- prefiks med annonsebildene.

CREATE TABLE public.r2_delete_queue (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL CHECK (bucket IN ('BILDER', 'VEDLEGG')),
  prefix text NOT NULL CHECK (prefix <> ''),
  requested_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX r2_delete_queue_pending_idx ON public.r2_delete_queue (requested_at);

-- Ingen policyer: tabellen skal kun nås av service_role (opprydningsjobben)
-- og av SECURITY DEFINER-triggerne under.
ALTER TABLE public.r2_delete_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.r2_delete_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.r2_delete_queue TO service_role;

-- Bucketnavnet kommer fra triggerdefinisjonen, ikke fra data.
CREATE FUNCTION public.enqueue_r2_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.r2_delete_queue (bucket, prefix) VALUES (TG_ARGV[0], OLD.id || '/');
  RETURN OLD;
END;
$$;

-- Annonsebilder, thumbnails og 360-frames ligger alle under {listingId}/.
CREATE TRIGGER enqueue_r2_delete_after_listing_delete
  AFTER DELETE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_r2_delete('BILDER');

-- Meldingsvedlegg ligger under {conversationId}/ i den private bucketen.
-- Radtriggere fyrer også når raden forsvinner via kaskade fra listings, så
-- dette dekker både direkte sletting av en samtale og sletting av annonsen.
CREATE TRIGGER enqueue_r2_delete_after_conversation_delete
  AFTER DELETE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_r2_delete('VEDLEGG');

-- Organisasjonslogoer ligger under {organizationId}/logo-{uuid}.{ext} i
-- BILDER (uploadOrganizationLogo). purge_expired_accounts sletter
-- organisasjonsraden når brukeren som slettes er eneste superbruker, så
-- kontosletting kan foreldreløsgjøre en logo uten denne triggeren.
CREATE TRIGGER enqueue_r2_delete_after_organization_delete
  AFTER DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_r2_delete('BILDER');

-- Kontosletting: purge_expired_accounts sletter annonsene (triggeren over
-- fanger dem) men *anonymiserer* profilraden fremfor å slette den, så
-- avatarfilen må fanges på overgangen til deleted_at.
CREATE FUNCTION public.enqueue_r2_delete_for_purged_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    INSERT INTO public.r2_delete_queue (bucket, prefix) VALUES ('BILDER', NEW.id || '/');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_r2_delete_after_profile_purge
  AFTER UPDATE OF deleted_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_r2_delete_for_purged_profile();

-- Tømming: samme pg_net-mønster som dispatch_push_for_*, siden Postgres selv
-- ikke kan snakke S3. Endepunktet gjør selve slettingen mot R2 og fjerner
-- raden først når den lyktes, så et tapt kall bare utsetter opprydningen.
CREATE FUNCTION public.dispatch_r2_cleanup() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _url text := COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'r2_cleanup_url'),
    'https://kaupet.no/api/public/r2/cleanup'
  );
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'r2_cleanup_secret');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.r2_delete_queue) THEN
    RETURN;
  END IF;
  IF _secret IS NULL THEN
    -- Uten hemmeligheten ville kallet blitt avvist med 401, og pg_net
    -- svelger det svaret — køen ville vokst i det stille uten noe signal.
    -- Post ikke i det hele tatt, og varsle i loggen i stedet.
    RAISE WARNING 'r2-opprydning hoppet over: app_settings-raden "r2_cleanup_secret" er ikke satt';
    RETURN;
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

REVOKE ALL ON FUNCTION public.dispatch_r2_cleanup() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('r2-cleanup-hourly', '15 * * * *', 'SELECT public.dispatch_r2_cleanup();');
