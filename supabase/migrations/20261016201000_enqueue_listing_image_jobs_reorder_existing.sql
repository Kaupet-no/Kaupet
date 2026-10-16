-- RV-20261016-03: ny rekkefølge i en import gjelder også bilder som
-- allerede er ferdig behandlet.
--
-- enqueue_listing_image_jobs oppdaterte bare listing_image_jobs.sort_order
-- for kjente URL-er. Ferdige jobber har allerede skrevet listing_images, så
-- visningsrekkefølgen ble stående. Nå flyttes eksisterende bilder i samme
-- transaksjon. Kropp kopiert fra 20261012103000; eneste endring er
-- UPDATE-en i løkken. Signaturen er uendret.

CREATE OR REPLACE FUNCTION public.enqueue_listing_image_jobs(
  _organization_id uuid,
  _listing_id uuid,
  _urls text[],
  _replace boolean DEFAULT true,
  _user_id uuid DEFAULT NULL
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
  _listing RECORD;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;
  -- FOR SHARE holder status/lokasjon/selger fast til køen er skrevet, så
  -- tilgangssjekken under og bildeendringen skjer på samme tilstand.
  SELECT organization_location_id, seller_id, status, category_id INTO _listing
  FROM public.listings
  WHERE id = _listing_id AND organization_id = _organization_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found for organization';
  END IF;
  -- KG-08-F03: når kalleren oppgir aktøren, må aktøren ha endringsrett til
  -- akkurat denne annonsen, og deaktiverte annonser kan ikke endres.
  IF _user_id IS NOT NULL THEN
    IF _listing.status = 'disabled' THEN
      RAISE EXCEPTION 'listing_disabled' USING ERRCODE = '42501';
    END IF;
    IF NOT public.can_update_organization_listing(
      _organization_id, _listing.organization_location_id, _listing.seller_id,
      _listing.status, _listing.category_id, _user_id
    ) THEN
      RAISE EXCEPTION 'listing_update_forbidden' USING ERRCODE = '42501';
    END IF;
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
    -- RV-20261016-03: et bilde som allerede er ferdig behandlet får ny
    -- plass her; ellers endres bare jobbens rekkefølge, ikke visningen.
    UPDATE public.listing_images
    SET sort_order = _idx
    WHERE listing_id = _listing_id
      AND source_url = _url
      AND sort_order IS DISTINCT FROM _idx;
    _idx := _idx + 1;
  END LOOP;

  RETURN _new_jobs;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_listing_image_jobs(uuid, uuid, text[], boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_listing_image_jobs(uuid, uuid, text[], boolean, uuid)
  TO service_role;
