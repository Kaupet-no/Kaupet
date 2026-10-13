-- KG-26-F01: ett ugyldig lagret søk eller kjøpsønske kunne kaste i matcheren
-- som listing-triggerne kaller synkront, og dermed rulle tilbake en annen
-- selgers publisering. Feil isoleres nå per søk/kjøpsønske.
--
-- Kropper kopiert fra 20260928120000 (wtb_criteria_match_listing) og
-- 20261002120000 (match_listing_to_saved_searches); eneste endring er
-- feilisoleringen. I match_listing_to_saved_searches omslutter unntaksblokken
-- bare lesende evaluering per søk. wtb_criteria_match_listing kalles per rad i
-- søk og matching, så der vaktes hver cast eksplisitt i stedet for en
-- unntaksblokk (som ville gitt én deltransaksjon per kall).

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
        -- Hver cast vaktes i egen IF: OR kortslutter ikke garantert i SQL.
        -- Et ugyldig kriterium gir «ikke treff» for dette kjøpsønsket og en
        -- advarsel i loggen, ikke en feil som ruller tilbake publiseringen.
        IF NOT pg_input_is_valid(attr_val->>'minDate', 'date') THEN
          RAISE WARNING 'wtb_criteria_match_listing: ugyldig minDate % for %',
            attr_val->>'minDate', attr_key;
          RETURN false;
        END IF;
        IF listing_text_val IS NULL OR listing_text_val !~ '^\d{4}-\d{2}-\d{2}$' THEN
          RETURN false;
        END IF;
        -- Formatet slipper gjennom 2026-99-99 også på annonsesiden.
        IF NOT pg_input_is_valid(listing_text_val, 'date') THEN
          RETURN false;
        END IF;
        IF listing_text_val::date < (attr_val->>'minDate')::date THEN
          RETURN false;
        END IF;
      ELSE
        -- {min,max} — tallområde. Ubundet side = ingen grense den veien.
        IF NOT COALESCE(pg_input_is_valid(attr_val->>'min', 'numeric'), true)
           OR NOT COALESCE(pg_input_is_valid(attr_val->>'max', 'numeric'), true)
        THEN
          RAISE WARNING 'wtb_criteria_match_listing: ugyldig min/max % for %', attr_val, attr_key;
          RETURN false;
        END IF;
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


CREATE OR REPLACE FUNCTION public.match_listing_to_saved_searches(
  _listing_id uuid, _previous jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.listings;
  previous_listing public.listings;
  cat_slug text;
  previous_cat_slug text;
  s record;
  is_match boolean;
BEGIN
  SELECT * INTO l FROM public.listings WHERE id = _listing_id AND status = 'active';
  IF NOT FOUND THEN RETURN; END IF;
  SELECT slug INTO cat_slug FROM public.categories WHERE id = l.category_id;

  IF _previous IS NOT NULL THEN
    previous_listing := jsonb_populate_record(NULL::public.listings, _previous);
    SELECT slug INTO previous_cat_slug FROM public.categories WHERE id = previous_listing.category_id;
  END IF;

  FOR s IN SELECT * FROM public.saved_searches WHERE notify = true AND user_id <> l.seller_id LOOP
    BEGIN
      is_match := public.saved_search_matches_listing(s.criteria, l, cat_slug)
        AND (_previous IS NULL OR NOT public.saved_search_matches_listing(s.criteria, previous_listing, previous_cat_slug));
    EXCEPTION WHEN OTHERS THEN
      is_match := false;
      INSERT INTO public.push_dispatch_failures (kind, payload, error)
      VALUES (
        'saved_search_match',
        jsonb_build_object('saved_search_id', s.id, 'listing_id', l.id),
        SQLERRM
      );
    END;
    IF is_match THEN
      INSERT INTO public.saved_search_notifications (saved_search_id, user_id, listing_id)
      VALUES (s.id, s.user_id, l.id)
      ON CONFLICT (saved_search_id, listing_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.match_listing_to_saved_searches(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_listing_to_saved_searches(uuid, jsonb) TO service_role;

-- Klienten skriver saved_searches direkte, så databasen er den autoritative
-- write-grensen. Validatoren utfører nøyaktig de typekonverteringene matcheren
-- gjør (saved_search_basic_match / saved_search_matches_listing) og avviser
-- kriterier som ville kastet der. Oppdateres sammen med matcheren.
CREATE FUNCTION public.saved_search_criteria_is_valid(c jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  attr_value jsonb;
BEGIN
  PERFORM jsonb_array_length(COALESCE(c->'categories', '[]'::jsonb)),
          jsonb_array_length(COALESCE(c->'conditions', '[]'::jsonb)),
          jsonb_array_length(COALESCE(c->'terms', '[]'::jsonb)),
          NULLIF(c->>'min', '')::int,
          NULLIF(c->>'max', '')::int,
          (c->>'includeFree')::boolean,
          NULLIF(c->>'lat', '')::double precision,
          NULLIF(c->>'lng', '')::double precision,
          NULLIF(c->>'radius', '')::double precision;
  FOR attr_value IN SELECT value FROM jsonb_each(COALESCE(c->'attributes', '{}'::jsonb)) LOOP
    IF attr_value->>'kind' IN ('multiselect', 'exclude') THEN
      PERFORM jsonb_array_length(COALESCE(attr_value->'values', '[]'::jsonb));
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- CHECK-uttrykk kjøres med skriverens rettigheter.
REVOKE ALL ON FUNCTION public.saved_search_criteria_is_valid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saved_search_criteria_is_valid(jsonb) TO authenticated, service_role;

-- Eksisterende ugyldige søk kan aldri gi treff: slå av varsling i stedet for
-- å slette brukerens rad. NOT VALID fordi disse radene fortsatt finnes; nye
-- og endrede rader kontrolleres.
UPDATE public.saved_searches
SET notify = false
WHERE notify AND NOT public.saved_search_criteria_is_valid(criteria);

ALTER TABLE public.saved_searches
  ADD CONSTRAINT saved_searches_criteria_valid
  CHECK (public.saved_search_criteria_is_valid(criteria)) NOT VALID;

-- Kjøpsønsker skrives bare via serverfunksjonen (som nå validerer datoen).
-- Eksisterende rader med ugyldig minDate mister bare det kriteriet.
UPDATE public.wtb_listings w
SET attributes = w.attributes - bad.keys
FROM (
  SELECT w2.id, array_agg(a.key) AS keys
  FROM public.wtb_listings w2
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(w2.attributes) = 'object' THEN w2.attributes ELSE '{}'::jsonb END
  ) a
  WHERE jsonb_typeof(a.value) = 'object'
    AND a.value ? 'minDate'
    AND NOT pg_input_is_valid(a.value->>'minDate', 'date')
  GROUP BY w2.id
) bad
WHERE w.id = bad.id;
