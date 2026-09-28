-- Ønskes kjøpt: valgfritt område + omvendt matching.
--
-- 1. wtb_listings får et valgfritt område (postnummer/sted, postnummerets
--    sentrumspunkt og en radius). Koordinatene er postnummerets sentrum, ikke
--    en GPS-posisjon — samme presisjonsnivå som postnummeret som allerede er
--    offentlig på salgsannonser.
-- 2. Sammenligningen av ett kjøpsønske mot én annonse flyttes ut av
--    compute_wtb_matches til wtb_criteria_match_listing, slik at begge
--    retninger (ny annonse → kjøpsønsker, og kjøpsønske under utfylling →
--    eksisterende annonser) bruker nøyaktig samme regler.
-- 3. Stedskriteriet: et kjøpsønske med område matcher en annonse som kan
--    sendes, eller som ligger innenfor radiusen. Ukjent annonseposisjon
--    (ingen koordinater, ikke oppgitt frakt) utelukker ikke — da vet vi for
--    lite til å si nei, og selgerbanneret (wtb_match_count) kalles med
--    hypotetiske annonser uten sted.

ALTER TABLE public.wtb_listings
  ADD COLUMN postal_code text,
  ADD COLUMN city text,
  ADD COLUMN lat double precision,
  ADD COLUMN lng double precision,
  ADD COLUMN radius_km integer,
  ADD CONSTRAINT wtb_listings_postal_code_check
    CHECK (postal_code IS NULL OR postal_code ~ '^\d{4}$'),
  ADD CONSTRAINT wtb_listings_city_check
    CHECK (city IS NULL OR char_length(city) <= 100),
  ADD CONSTRAINT wtb_listings_coords_check
    CHECK (
      (lat IS NULL AND lng IS NULL)
      OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
    ),
  ADD CONSTRAINT wtb_listings_radius_km_check
    CHECK (radius_km IS NULL OR (radius_km BETWEEN 1 AND 2000));

CREATE OR REPLACE FUNCTION public.wtb_criteria_match_listing(
    _w_max_price_nok integer,
    _w_attributes jsonb,
    _w_lat double precision,
    _w_lng double precision,
    _w_radius_km integer,
    _price_nok integer,
    _is_free boolean,
    _title text,
    _description text,
    _attributes jsonb,
    _lat double precision,
    _lng double precision,
    _can_ship boolean
) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  attr_key text;
  attr_val jsonb;
  listing_text_val text;
  listing_jsonb_val jsonb;
  freetext text;
  listing_attrs jsonb := COALESCE(_attributes, '{}'::jsonb);
BEGIN
  -- Pris: kjøperens tak må dekke selgerens pris. Gis bort-annonser
  -- tilfredsstiller alltid; en ukjent pris ("pris ved henvendelse") mot et
  -- satt tak regnes IKKE som match (samme forsiktige presedens som
  -- match_listing_to_saved_searches sin min/max-prissjekk).
  IF NOT COALESCE(_is_free, false) AND _w_max_price_nok IS NOT NULL THEN
    IF _price_nok IS NULL OR _price_nok > _w_max_price_nok THEN
      RETURN false;
    END IF;
  END IF;

  -- Område: se toppkommentaren for hvorfor ukjent annonseposisjon slipper gjennom.
  IF _w_lat IS NOT NULL AND _w_lng IS NOT NULL AND _w_radius_km IS NOT NULL
     AND NOT COALESCE(_can_ship, false)
     AND _lat IS NOT NULL AND _lng IS NOT NULL
  THEN
    IF 6371 * acos(LEAST(1.0, GREATEST(-1.0,
         cos(radians(_w_lat)) * cos(radians(_lat)) * cos(radians(_lng) - radians(_w_lng))
         + sin(radians(_w_lat)) * sin(radians(_lat))
       ))) > _w_radius_km
    THEN
      RETURN false;
    END IF;
  END IF;

  -- Attributt-kriterier: hver nøkkel i ØK-annonsens attributes er ett
  -- kriterium brukeren har krysset av/fylt ut (se
  -- src/features/wtb/wtb-criteria-fields.tsx for formene på klientsiden).
  FOR attr_key, attr_val IN SELECT key, value FROM jsonb_each(COALESCE(_w_attributes, '{}'::jsonb))
  LOOP
    IF attr_val IS NULL OR jsonb_typeof(attr_val) = 'null' THEN
      CONTINUE;
    END IF;

    -- Reservert nøkkel for nøkkelord (ikke et category_filters-felt):
    -- treff krever at teksten finnes i tittel eller beskrivelse.
    IF attr_key = '__freetext' THEN
      freetext := trim(attr_val #>> '{}');
      IF freetext = '' THEN CONTINUE; END IF;
      IF NOT (
        COALESCE(_title, '') ILIKE '%' || freetext || '%'
        OR COALESCE(_description, '') ILIKE '%' || freetext || '%'
      ) THEN
        RETURN false;
      END IF;
      CONTINUE;
    END IF;

    listing_text_val := listing_attrs ->> attr_key;
    listing_jsonb_val := listing_attrs -> attr_key;

    IF jsonb_typeof(attr_val) = 'object' THEN
      IF attr_val ? 'minDate' THEN
        -- {minDate} — kun next_eu_control: annonsens dato må være på
        -- eller etter kjøperens tidligste akseptable dato.
        IF listing_text_val IS NULL
           OR listing_text_val !~ '^\d{4}-\d{2}-\d{2}$'
           OR listing_text_val::date < (attr_val->>'minDate')::date
        THEN
          RETURN false;
        END IF;
      ELSE
        -- {min,max} — tallområde. Ubundet side = ingen grense den veien.
        IF listing_text_val IS NULL OR listing_text_val !~ '^-?\d+(\.\d+)?$' THEN
          RETURN false;
        END IF;
        IF attr_val ? 'min' AND (attr_val->>'min') IS NOT NULL
           AND listing_text_val::numeric < (attr_val->>'min')::numeric
        THEN
          RETURN false;
        END IF;
        IF attr_val ? 'max' AND (attr_val->>'max') IS NOT NULL
           AND listing_text_val::numeric > (attr_val->>'max')::numeric
        THEN
          RETURN false;
        END IF;
      END IF;

    ELSIF jsonb_typeof(attr_val) = 'array' THEN
      IF jsonb_typeof(listing_jsonb_val) = 'array' THEN
        -- Begge sider er array (utstyrsgrupper e.l.): krev overlapp.
        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(attr_val) AS wv(v)
          JOIN jsonb_array_elements_text(listing_jsonb_val) AS lv(v) ON lv.v = wv.v
        ) THEN
          RETURN false;
        END IF;
      ELSE
        -- Annonsen har (høyst) én verdi for nøkkelen — den må være
        -- blant kjøperens aksepterte verdier (multiselect-kriterium).
        IF listing_text_val IS NULL OR NOT (attr_val ? listing_text_val) THEN
          RETURN false;
        END IF;
      END IF;

    ELSIF jsonb_typeof(attr_val) = 'boolean' THEN
      IF listing_text_val IS DISTINCT FROM 'true' THEN
        RETURN false;
      END IF;

    ELSE
      -- Ren streng/tall (merke, modell, fritekstfelt, eller en eldre
      -- enkeltverdi lagret før multiselect-omleggingen): case-insensitiv likhet.
      IF listing_text_val IS NULL
         OR lower(listing_text_val) <> lower(attr_val #>> '{}')
      THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- Ny signatur (sted og frakt), så den gamle må fjernes — ellers blir kall med
-- seks argumenter tvetydige mot standardverdiene under.
DROP FUNCTION public.compute_wtb_matches(uuid, integer, boolean, text, text, jsonb);

CREATE FUNCTION public.compute_wtb_matches(
    _category_id uuid,
    _price_nok integer,
    _is_free boolean,
    _title text,
    _description text,
    _attributes jsonb,
    _lat double precision DEFAULT NULL,
    _lng double precision DEFAULT NULL,
    _can_ship boolean DEFAULT NULL
) RETURNS SETOF public.wtb_listings
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT w.*
  FROM public.wtb_listings w
  WHERE w.status = 'active'
    AND (w.category_id IS NULL OR w.category_id = _category_id)
    AND public.wtb_criteria_match_listing(
      w.max_price_nok, w.attributes, w.lat, w.lng, w.radius_km,
      _price_nok, _is_free, _title, _description, _attributes, _lat, _lng, _can_ship
    );
$$;

-- Uendret signatur og oppførsel (selgerbanneret har ingen posisjon); gjenskapt
-- fordi SQL-kroppen peker på compute_wtb_matches, som ble fjernet over.
CREATE OR REPLACE FUNCTION public.wtb_match_count(
    _category_id uuid,
    _price_nok integer,
    _is_free boolean,
    _title text,
    _description text,
    _attributes jsonb
) RETURNS TABLE(match_count integer, max_price integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT count(*)::integer AS match_count, max(max_price_nok)::integer AS max_price
  FROM public.compute_wtb_matches(_category_id, _price_nok, _is_free, _title, _description, _attributes);
$$;

-- Som 20260813233000_restore_wtb_match_notification_hardening, men sender med
-- annonsens posisjon og frakt.
CREATE OR REPLACE FUNCTION public.match_listing_to_wtb_listings(_listing_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  l RECORD;
  m RECORD;
BEGIN
  SELECT * INTO l FROM public.listings WHERE id = _listing_id AND status = 'active';
  IF NOT FOUND THEN RETURN; END IF;

  FOR m IN
    SELECT * FROM public.compute_wtb_matches(
      l.category_id, l.price_nok, l.is_free, l.title, l.description, l.attributes,
      l.lat, l.lng, l.can_ship
    )
  LOOP
    IF m.notify_matches AND m.user_id <> l.seller_id THEN
      BEGIN
        INSERT INTO public.wtb_match_notifications (wtb_listing_id, user_id, listing_id)
        VALUES (m.id, m.user_id, l.id)
        ON CONFLICT (wtb_listing_id, listing_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.push_dispatch_failures (kind, payload, error)
        VALUES (
          'wtb_match_notification',
          jsonb_build_object('wtb_listing_id', m.id, 'user_id', m.user_id, 'listing_id', l.id),
          SQLERRM
        );
      END;
    END IF;
  END LOOP;
END;
$$;

-- Flytting og endret frakt kan gjøre en annonse til et nytt treff.
CREATE OR REPLACE FUNCTION public.listings_match_wtb_listings_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'active' AND (
    TG_OP = 'INSERT'
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.price_nok IS DISTINCT FROM NEW.price_nok
    OR OLD.is_free IS DISTINCT FROM NEW.is_free
    OR OLD.category_id IS DISTINCT FROM NEW.category_id
    OR OLD.attributes IS DISTINCT FROM NEW.attributes
    OR OLD.lat IS DISTINCT FROM NEW.lat
    OR OLD.lng IS DISTINCT FROM NEW.lng
    OR OLD.can_ship IS DISTINCT FROM NEW.can_ship
  ) THEN
    PERFORM public.match_listing_to_wtb_listings(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER listings_match_wtb_listings ON public.listings;
CREATE TRIGGER listings_match_wtb_listings
    AFTER INSERT OR UPDATE OF status, price_nok, is_free, category_id, attributes, lat, lng, can_ship
    ON public.listings
    FOR EACH ROW EXECUTE FUNCTION public.listings_match_wtb_listings_trigger();

-- Omvendt retning: aktive annonser som allerede oppfyller et kjøpsønske som
-- fortsatt fylles ut. Krever kategori (samme likhetsregel som
-- compute_wtb_matches); uten kategori ville alle annonser på Kaupet matchet.
-- Prisfilteret i WHERE er bare en billig forhåndssiling av det predikatet
-- uansett sjekker.
-- ponytail: plpgsql-predikat per annonse i kategorien; flytt attributtsjekkene
-- inn i indekserbar SQL hvis store kategorier blir trege.
CREATE OR REPLACE FUNCTION public.listings_matching_wtb(
    _category_id uuid,
    _max_price_nok integer,
    _attributes jsonb,
    _lat double precision,
    _lng double precision,
    _radius_km integer,
    _limit integer DEFAULT 5
) RETURNS TABLE(id uuid, total_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH matched AS (
    SELECT l.id, l.published_at, l.created_at
    FROM public.listings l
    WHERE l.status = 'active'
      AND l.category_id = _category_id
      AND (_max_price_nok IS NULL OR l.is_free OR l.price_nok <= _max_price_nok)
      AND public.wtb_criteria_match_listing(
        _max_price_nok, _attributes, _lat, _lng, _radius_km,
        l.price_nok, l.is_free, l.title, l.description, l.attributes, l.lat, l.lng, l.can_ship
      )
  )
  SELECT m.id, count(*) OVER () AS total_count
  FROM matched m
  ORDER BY COALESCE(m.published_at, m.created_at) DESC
  LIMIT LEAST(GREATEST(_limit, 0), 20);
$$;

-- Samme privilegiemodell som 20260909180000_complete_data_api_cutover: kun
-- serverfunksjoner (service_role) kaller disse.
REVOKE ALL ON FUNCTION public.wtb_criteria_match_listing(
  integer, jsonb, double precision, double precision, integer,
  integer, boolean, text, text, jsonb, double precision, double precision, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_wtb_matches(
  uuid, integer, boolean, text, text, jsonb, double precision, double precision, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wtb_match_count(uuid, integer, boolean, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listings_matching_wtb(
  uuid, integer, jsonb, double precision, double precision, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.wtb_criteria_match_listing(
  integer, jsonb, double precision, double precision, integer,
  integer, boolean, text, text, jsonb, double precision, double precision, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_wtb_matches(
  uuid, integer, boolean, text, text, jsonb, double precision, double precision, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.wtb_match_count(uuid, integer, boolean, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.listings_matching_wtb(
  uuid, integer, jsonb, double precision, double precision, integer, integer
) TO service_role;
