-- KG-15-F01 / KG-10-F01 (B5): bildejobber med tidsavgrenset claim og atomisk,
-- idempotent fullføring.
--
-- 1) En worker som dør etter claim etterlot jobben som `processing` for alltid,
--    siden claim og dispatch bare så på `pending`. Nå er claimet et lån:
--    `processing` eldre enn 10 minutter (målt på updated_at, som claimet
--    setter via set_updated_at-triggeren) kan claimes på nytt.
-- 2) Bilderaden og `done` ble skrevet i to separate kall, så en feil mellom
--    dem ga en ny bilderad ved retry, og en worker kunne legge tilbake bilder
--    fra en jobb som en ny synk hadde erstattet. complete_listing_image_job
--    gjør begge under lås, og bare for gjeldende claim.
--
-- Claim-tokenet er `attempts`: hvert claim øker det, så en worker med et
-- utløpt lån ser at jobben er tatt over (eller slettet av enqueue) og skriver
-- ingenting. Ubrukte R2-objekter ryddes av den eksisterende registry-jobben.

-- 1) Claim: ventende jobber og utløpte lån ---------------------------------

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

  -- Et lån som går ut skyldes en worker som døde uten å nå catch-grenen
  -- (f.eks. minne- eller tidsgrense), så workerens 24-timersgrense slår
  -- aldri inn. Samme grense håndheves her, ellers ville en jobb som alltid
  -- dreper workeren bli claimet hvert tiende minutt for alltid.
  UPDATE public.listing_image_jobs
  SET status = 'failed',
      customer_error = 'Bildet kunne ikke behandles på grunn av en feil hos Kaupet. Vi følger opp.',
      internal_error = 'lease_expired_after_24h'
  WHERE status = 'processing'
    AND updated_at < now() - interval '10 minutes'
    AND created_at < now() - interval '24 hours';

  RETURN QUERY
  UPDATE public.listing_image_jobs
  SET status = 'processing', attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM public.listing_image_jobs
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'processing' AND updated_at < now() - interval '10 minutes')
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

CREATE INDEX listing_image_jobs_processing_idx
  ON public.listing_image_jobs (updated_at)
  WHERE status = 'processing';

-- 2) Fullføring: bilderad + done i én transaksjon --------------------------

CREATE FUNCTION public.complete_listing_image_job(
  _job_id uuid,
  _attempt integer,
  _storage_path text,
  _content_hash text,
  _transformations integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job public.listing_image_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;

  -- Annonsen låses først med FOR NO KEY UPDATE, som venter på (og
  -- blokkerer) FOR SHARE-låsen enqueue_listing_image_jobs tar på annonsen.
  -- Ellers kunne en erstattende synk slette bilderadene før denne bilderaden
  -- var synlig, og så slette jobben etter at den var lagret.
  PERFORM 1 FROM public.listings l
  JOIN public.listing_image_jobs j ON j.listing_id = l.id
  WHERE j.id = _job_id
  FOR NO KEY UPDATE OF l;

  SELECT * INTO _job FROM public.listing_image_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR _job.status <> 'processing' OR _job.attempts <> _attempt THEN
    -- Jobben er erstattet, slettet eller tatt over av et nyere claim.
    RETURN 'stale';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.listing_images
    WHERE listing_id = _job.listing_id AND source_url = _job.source_url
  ) THEN
    INSERT INTO public.listing_images (listing_id, storage_path, sort_order, source_url)
    VALUES (_job.listing_id, _storage_path, _job.sort_order, _job.source_url);
  END IF;

  UPDATE public.listing_image_jobs
  SET status = 'done',
      storage_path = _storage_path,
      content_hash = _content_hash,
      transformations = _transformations,
      customer_error = NULL,
      internal_error = NULL
  WHERE id = _job_id;

  RETURN 'done';
END;
$$;

REVOKE ALL ON FUNCTION public.complete_listing_image_job(uuid, integer, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_listing_image_job(uuid, integer, text, text, integer)
  TO service_role;

-- 3) Dispatch vekker også prosesseringen for utløpte lån -------------------
--
-- Kropp kopiert fra 20260928130000_app_settings_url_uten_fallback.sql; eneste
-- endring er EXISTS-betingelsen.
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
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'processing' AND updated_at < now() - interval '10 minutes')
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

REVOKE ALL ON FUNCTION public.dispatch_listing_image_jobs() FROM PUBLIC, anon, authenticated;
