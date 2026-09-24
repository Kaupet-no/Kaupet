-- Fase 3 av Proff-integrasjonen: bilder serverside for Excel-/API-/MCP-synk.
--
-- Excel-raden kan nå inneholde `images` (bilde-URL-er, se import-schema.ts).
-- Serveren kan ikke hente og komprimere bilder inline i selve synk-kallet
-- (ekstern nettverksinnhenting + Cloudflare Images-transformasjon er for
-- treigt/upålitelig til å holde et batch-kall på 25-500 rader responsivt),
-- så bilder legges i en kø og prosesseres asynkront av et secret-beskyttet
-- endepunkt kalt av pg_cron/pg_net — samme mønster som r2_delete_queue
-- (20260918230000_r2_delete_queue.sql) og push-dispatch.
--
-- Kjernekravet fra bruker: feil VI eier (Cloudflare Images nede, tom kvote,
-- R2-feil, DB-feil, midlertidig nettverksfeil hos kilden) skal ALDRI vises
-- som en kundefeil — jobben blir stående som "Behandles" og prøves på nytt
-- med eksponentiell backoff. Kun feil kunden faktisk kan rette (URL svarer
-- 404, adressen er ikke et bilde, bildet er for stort, filen er skadet)
-- vises som "Feilet" med en konkret norsk tekst. Se
-- src/lib/listing-image-jobs.server.ts for klassifiseringen.
--
-- Oppsett som må på plass før jobben virker (samme mønster som r2-opprydning):
--   * IMAGE_JOBS_SECRET i secrets/cloudflare.env (miljøvariabel for appen) og
--     på Cloudflare-workeren (satt av deploy-jobben fra GitHub Environment-
--     secreten, se .github/workflows/ci.yml for R2_CLEANUP_SECRET-mønsteret).
--   * app_settings-radene 'image_jobs_secret' (samme verdi) og, utenfor prod,
--     'image_jobs_url' som peker på riktig miljø.
--   * Cloudflare Images-bindingen `IMAGES` i wrangler.jsonc (se kommentaren
--     der) — uten den blir jobber stående som "Behandles" for alltid (intern
--     feil, ikke kundefeil), se image-compression.server.ts.

-- 1) Jobbtabellen -----------------------------------------------------------

CREATE TABLE public.listing_image_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  -- Norsk, kundevendt feiltekst. NULL mens jobben venter/behandles, og NULL
  -- for jobber som til slutt lykkes. Satt kun for feil kunden kan rette (se
  -- listing-image-jobs.server.ts).
  customer_error text,
  -- Driftsdiagnostikk (HTTP-status, unntaksmelding o.l.) for feil vi eier.
  -- Vises ALDRI til kunden — se kolonne-grant-kommentaren under.
  internal_error text,
  storage_path text,
  content_hash text,
  transformations integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_image_jobs_source_url_length CHECK (length(source_url) BETWEEN 1 AND 2048)
);

-- Idempotens: samme (annonse, kilde-URL) skal aldri gi to jobber. En ny synk
-- som sender samme URL-liste igjen skal ikke starte en ny transformasjon for
-- en URL som allerede er ferdig behandlet (se enqueue_listing_image_jobs).
CREATE UNIQUE INDEX listing_image_jobs_listing_source_key
  ON public.listing_image_jobs (listing_id, source_url);

-- Køplukking: claim_listing_image_jobs henter eldste ventende jobber som er
-- klare (next_attempt_at <= now()), i status-rekkefølge.
CREATE INDEX listing_image_jobs_pending_idx
  ON public.listing_image_jobs (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX listing_image_jobs_organization_created_idx
  ON public.listing_image_jobs (organization_id, created_at);

CREATE TRIGGER listing_image_jobs_set_updated_at
  BEFORE UPDATE ON public.listing_image_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.listing_image_jobs ENABLE ROW LEVEL SECURITY;

-- Kolonnevalg for RLS: i stedet for en egen view (som ville krevd en egen
-- RLS-flate å holde i sync med tabellens), bruker vi Postgres' kolonnenivå-
-- GRANT: `authenticated` får SELECT kun på kolonnene uten `internal_error`,
-- håndhevet av databasen selv (en spørring som ber om internal_error feiler
-- med "permission denied for column", uavhengig av RLS-policyen). Dette er
-- samme mønster repoet allerede bruker for skrivebeskyttelse
-- (GRANT UPDATE (kolonner) i 20260909180000_complete_data_api_cutover.sql),
-- bare på SELECT i stedet for UPDATE.
REVOKE ALL ON TABLE public.listing_image_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, organization_id, listing_id, source_url, sort_order, status, attempts,
  next_attempt_at, customer_error, storage_path, content_hash, transformations,
  created_at, updated_at
) ON TABLE public.listing_image_jobs TO authenticated;
GRANT ALL ON TABLE public.listing_image_jobs TO service_role;

-- Ingen klientskriving i det hele tatt: alle skriv skjer via
-- enqueue_listing_image_jobs / claim_listing_image_jobs / prosesseringsjobben
-- (service_role), som RLS-policyen under ikke gir tilgang til.
CREATE POLICY "Organization members can view their listing image jobs"
  ON public.listing_image_jobs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = listing_image_jobs.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- 2) listing_images: kobling til kilde-URL for idempotens/"erstatt settet" --

ALTER TABLE public.listing_images ADD COLUMN source_url text;

-- Klienter kan sette `caption`/`sort_order` via "Owners can manage listing
-- images" (organization_locations_and_billing.sql), men denne policyen er
-- USING/WITH CHECK uten kolonnebegrensning fra RLS alene — kolonnegrensen må
-- håndheves med GRANT, akkurat som over. `source_url` skal kun settes av
-- prosesseringsjobben (service_role); en klient som satte den selv kunne
-- late som et bilde kom fra en integrasjonskilde den ikke kontrollerer, noe
-- ingen kodevei stoler på i dag, men vi lukker gapet likevel.
REVOKE UPDATE, INSERT ON TABLE public.listing_images FROM anon, authenticated;
GRANT INSERT (listing_id, storage_path, sort_order, caption) ON TABLE public.listing_images TO authenticated;
GRANT UPDATE (caption, sort_order) ON TABLE public.listing_images TO authenticated;

-- 2b) validate_listing_image_reference: tillat service_role-innsetting -----
--
-- Prosesseringsjobben (listing-image-jobs.server.ts) setter inn
-- `listing_images`-rader via `supabaseAdmin` (service_role), som ikke har
-- noen `auth.uid()` (ingen bruker-JWT). Den opprinnelige funksjonen
-- (20260918220000_r2_storage_objects_validation_fixes.sql) krever at
-- `auth.uid()` matcher annonsens eier/organisasjon, noe som alltid var sant
-- for de eksisterende innsettingsstedene (klienten, med brukerens egen
-- sesjon) men aldri kan være sant for service_role. Vi erstatter funksjonen
-- (siste CREATE OR REPLACE vinner, jf. AGENTS.md) med en variant som hopper
-- over eierskapssjekken for service_role — autorisasjonen er da allerede
-- gjort av `enqueue_listing_image_jobs` (som krever at annonsen tilhører
-- `_organization_id`) og selve synk-aktør-sjekken i listing-sync.server.ts.
-- Stiformat- og 20-bilders-grensen håndheves fortsatt for service_role.
CREATE OR REPLACE FUNCTION public.validate_listing_image_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  image_count integer;
BEGIN
  IF NEW.storage_path !~* (
       '^' || NEW.listing_id::text ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl)$'
     )
  THEN
    RAISE EXCEPTION 'invalid_listing_image';
  END IF;

  IF auth.role() <> 'service_role' AND NOT EXISTS (
       SELECT 1
       FROM public.listings l
       WHERE l.id = NEW.listing_id
         AND (
           (l.organization_id IS NULL AND l.seller_id = auth.uid())
           OR (
             l.organization_id IS NOT NULL
             AND public.can_update_organization_listing(
               l.organization_id,
               l.organization_location_id,
               l.seller_id,
               l.status,
               l.category_id,
               auth.uid()
             )
           )
         )
     )
  THEN
    RAISE EXCEPTION 'invalid_listing_image';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.listing_id::text, 1));
    SELECT count(*) INTO image_count
    FROM public.listing_images
    WHERE listing_id = NEW.listing_id;
    IF image_count >= 20 THEN
      RAISE EXCEPTION 'listing_image_limit';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_listing_image_reference()
  FROM PUBLIC, anon, authenticated, service_role;

-- 3) enqueue_listing_image_jobs: upsert jobber for en annonses bilde-URL-er -
--
-- _replace = true (brukes av synk-tjenesten etter created/updated/unchanged/
-- duplicate): URL-er som ikke lenger er i `_urls` fjernes — både ventende
-- jobber og allerede lagrede listing_images-rader for dem — og R2-stiene
-- deres legges i r2_delete_queue for faktisk opprydning (se
-- 20260918230000_r2_delete_queue.sql; vi kan ikke slette fra R2 i Postgres).
-- Nye URL-er får en ny 'pending'-jobb i riktig sort_order. En URL som
-- allerede har en 'done'-jobb røres ikke — ingen ny transformasjon, ingen ny
-- kostnad (se plandokumentets kostnadsbudsjett for Cloudflare Images).
-- Returnerer antall NYE jobber (til bruk i döygngrensen for nye bilder).
CREATE OR REPLACE FUNCTION public.enqueue_listing_image_jobs(
  _organization_id uuid,
  _listing_id uuid,
  _urls text[],
  _replace boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_jobs integer := 0;
  _url text;
  _idx integer := 0;
  _was_insert boolean;
  _removed_image RECORD;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.listings
    WHERE id = _listing_id AND organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'Listing not found for organization';
  END IF;

  IF _replace THEN
    -- Bilder som ikke lenger er i URL-listen: slett raden og kø R2-opprydning
    -- av den lagrede filen (og dens thumbnail, som deler prefiks/stinavn —
    -- se enqueue_r2_delete-mønsteret, men her per fil siden thumbPathFor
    -- bare endrer filnavnet, ikke mappen).
    FOR _removed_image IN
      SELECT storage_path FROM public.listing_images
      WHERE listing_id = _listing_id
        AND source_url IS NOT NULL
        AND NOT (source_url = ANY(_urls))
    LOOP
      -- r2_delete_queue.prefix er dokumentert som "alt under et prefiks";
      -- her bruker vi den fulle filstien (uten skråstrek) som en presis
      -- "prefiks"-verdi siden R2 sin list-type=2-prefiksmatch også fanger
      -- eksakte nøkler og alt som starter med dem (thumbnail-varianten
      -- `<sti uten ext>-thumb.<ext>` matcher IKKE `<sti>` som prefiks, så vi
      -- legger inn begge stiene eksplisitt).
      INSERT INTO public.r2_delete_queue (bucket, prefix) VALUES ('BILDER', _removed_image.storage_path);
      INSERT INTO public.r2_delete_queue (bucket, prefix)
        VALUES ('BILDER', regexp_replace(_removed_image.storage_path, '(\.[^.\/]+)$', '-thumb\1'));
    END LOOP;

    DELETE FROM public.listing_images
    WHERE listing_id = _listing_id
      AND source_url IS NOT NULL
      AND NOT (source_url = ANY(_urls));

    DELETE FROM public.listing_image_jobs
    WHERE listing_id = _listing_id
      AND NOT (source_url = ANY(_urls));
  END IF;

  IF _urls IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH _url IN ARRAY _urls LOOP
    INSERT INTO public.listing_image_jobs (
      organization_id, listing_id, source_url, sort_order, status, next_attempt_at
    ) VALUES (
      _organization_id, _listing_id, _url, _idx, 'pending', now()
    )
    ON CONFLICT (listing_id, source_url) DO UPDATE
      -- Rør aldri status/attempts/feiltilstand for en jobb som allerede
      -- finnes (pending/processing/done/failed) — kun rekkefølgen kan endre
      -- seg mellom to synker av samme bildesett. Denne no-op-oppdateringen
      -- (sette samme sort_order) kreves kun for at `RETURNING (xmax = 0)`
      -- skal fungere som "ble denne raden satt inn nå" på begge grener.
      SET sort_order = EXCLUDED.sort_order
    RETURNING (xmax = 0) INTO _was_insert;

    IF _was_insert THEN
      _new_jobs := _new_jobs + 1;
    END IF;
    _idx := _idx + 1;
  END LOOP;

  RETURN _new_jobs;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_listing_image_jobs(uuid, uuid, text[], boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_listing_image_jobs(uuid, uuid, text[], boolean)
  TO service_role;

-- 4) claim_listing_image_jobs: hent N ventende jobber for prosessering ------

CREATE OR REPLACE FUNCTION public.claim_listing_image_jobs(_limit integer DEFAULT 5)
RETURNS SETOF public.listing_image_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;

  RETURN QUERY
  UPDATE public.listing_image_jobs
  SET status = 'processing', attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM public.listing_image_jobs
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_listing_image_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_listing_image_jobs(integer)
  TO service_role;

-- 5) Dispatch + cron ---------------------------------------------------------
--
-- Samme mønster som dispatch_r2_cleanup: post til prosesseringsendepunktet
-- kun når det finnes ventende jobber og hemmeligheten er satt, ellers RAISE
-- WARNING slik at et manglende oppsett er synlig i Postgres-loggen i stedet
-- for å forsvinne stille (pg_net svelger 401/302/404-svar).
CREATE OR REPLACE FUNCTION public.dispatch_listing_image_jobs() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _url text := COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'image_jobs_url'),
    'https://kaupet.no/api/public/images/process'
  );
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'image_jobs_secret');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.listing_image_jobs
    WHERE status = 'pending' AND next_attempt_at <= now()
  ) THEN
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

REVOKE ALL ON FUNCTION public.dispatch_listing_image_jobs() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('listing-image-jobs-every-minute', '* * * * *', 'SELECT public.dispatch_listing_image_jobs();');
