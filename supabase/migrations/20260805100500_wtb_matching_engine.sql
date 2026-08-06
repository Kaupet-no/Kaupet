-- Fase 2 av ØK-matching: selve sammenligningsmotoren.
--
-- Bevisst en egen, ØK-spesifikk motor — IKKE delt med
-- match_listing_to_saved_searches (som ikke sammenligner attributter i det
-- hele tatt i dag, og som allerede kjører i produksjon; å endre den for å
-- dele logikk med ØK er en større, risikofylt omskriving av noe som
-- fungerer, og saved_searches.criteria har uansett ingen attributt-form å
-- dele med ØKs — se plan-diskusjonen).
--
-- compute_wtb_matches(...) er den rene sammenligningslogikken, uavhengig av
-- om annonsen faktisk finnes i databasen ennå — det gjør den gjenbrukbar
-- både for selve treff-og-varsle-flyten (match_listing_to_wtb_listings,
-- kalt fra en trigger på listings) og for et fremtidig "live antall treff"-
-- hint i opprettelsesflyten (Fase 4), uten duplisert SQL.
CREATE OR REPLACE FUNCTION public.compute_wtb_matches(
    _category_id uuid,
    _price_nok integer,
    _is_free boolean,
    _title text,
    _description text,
    _attributes jsonb
) RETURNS SETOF public.wtb_listings
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  w RECORD;
  attr_key text;
  attr_val jsonb;
  listing_text_val text;
  listing_jsonb_val jsonb;
  freetext text;
  ok boolean;
  listing_attrs jsonb := COALESCE(_attributes, '{}'::jsonb);
BEGIN
  FOR w IN
    SELECT * FROM public.wtb_listings
    WHERE status = 'active'
      AND (category_id IS NULL OR category_id = _category_id)
  LOOP
    ok := true;

    -- Pris: kjøperens tak må dekke selgerens pris. Gis bort-annonser
    -- tilfredsstiller alltid; en ukjent pris ("pris ved henvendelse") mot et
    -- satt tak regnes IKKE som match (samme forsiktige presedens som
    -- match_listing_to_saved_searches sin min/max-prissjekk).
    IF NOT _is_free AND w.max_price_nok IS NOT NULL THEN
      IF _price_nok IS NULL OR _price_nok > w.max_price_nok THEN
        ok := false;
      END IF;
    END IF;

    -- Attributt-kriterier: hver nøkkel i ØK-annonsens attributes er ett
    -- kriterium brukeren har krysset av/fylt ut (se
    -- src/features/wtb/wtb-criteria-fields.tsx for formene på klientsiden).
    IF ok THEN
      FOR attr_key, attr_val IN SELECT key, value FROM jsonb_each(w.attributes)
      LOOP
        IF attr_val IS NULL OR jsonb_typeof(attr_val) = 'null' THEN
          CONTINUE;
        END IF;

        -- Reservert nøkkel for fritekstsøk (ikke et category_filters-felt):
        -- treff krever at teksten finnes i tittel eller beskrivelse.
        IF attr_key = '__freetext' THEN
          freetext := trim(attr_val #>> '{}');
          IF freetext = '' THEN CONTINUE; END IF;
          IF NOT (
            COALESCE(_title, '') ILIKE '%' || freetext || '%'
            OR COALESCE(_description, '') ILIKE '%' || freetext || '%'
          ) THEN
            ok := false; EXIT;
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
              ok := false; EXIT;
            END IF;
          ELSE
            -- {min,max} — tallområde. Ubundet side = ingen grense den veien.
            IF listing_text_val IS NULL OR listing_text_val !~ '^-?\d+(\.\d+)?$' THEN
              ok := false; EXIT;
            END IF;
            IF attr_val ? 'min' AND (attr_val->>'min') IS NOT NULL
               AND listing_text_val::numeric < (attr_val->>'min')::numeric
            THEN
              ok := false; EXIT;
            END IF;
            IF attr_val ? 'max' AND (attr_val->>'max') IS NOT NULL
               AND listing_text_val::numeric > (attr_val->>'max')::numeric
            THEN
              ok := false; EXIT;
            END IF;
          END IF;

        ELSIF jsonb_typeof(attr_val) = 'array' THEN
          IF jsonb_typeof(listing_jsonb_val) = 'array' THEN
            -- Begge sider er array (utstyrsgrupper e.l.): krev overlapp.
            -- Eksplisitt kolonnealias (AS wv(v)) er nødvendig — uten det
            -- heter settfunksjonens enkeltkolonne det samme som funksjonen,
            -- ikke aliaset.
            IF NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(attr_val) AS wv(v)
              JOIN jsonb_array_elements_text(listing_jsonb_val) AS lv(v) ON lv.v = wv.v
            ) THEN
              ok := false; EXIT;
            END IF;
          ELSE
            -- Annonsen har (høyst) én verdi for nøkkelen — den må være
            -- blant kjøperens aksepterte verdier (multiselect-kriterium).
            IF listing_text_val IS NULL OR NOT (attr_val ? listing_text_val) THEN
              ok := false; EXIT;
            END IF;
          END IF;

        ELSIF jsonb_typeof(attr_val) = 'boolean' THEN
          IF listing_text_val IS DISTINCT FROM 'true' THEN
            ok := false; EXIT;
          END IF;

        ELSE
          -- Ren streng/tall (merke, modell, fritekstfelt, eller en eldre
          -- enkeltverdi lagret før multiselect-omleggingen): case-
          -- insensitiv likhet.
          IF listing_text_val IS NULL
             OR lower(listing_text_val) <> lower(attr_val #>> '{}')
          THEN
            ok := false; EXIT;
          END IF;
        END IF;
      END LOOP;
    END IF;

    IF ok THEN
      RETURN NEXT w;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

-- Tynn wrapper: henter den faktiske (allerede lagrede) annonsen og skriver
-- ett varsel per nytt treff. SECURITY DEFINER siden wtb_match_notifications
-- ikke har noen INSERT-policy — kun denne funksjonen kan skrive dit.
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
      l.category_id, l.price_nok, l.is_free, l.title, l.description, l.attributes
    )
  LOOP
    IF m.user_id <> l.seller_id THEN
      INSERT INTO public.wtb_match_notifications (wtb_listing_id, user_id, listing_id)
      VALUES (m.id, m.user_id, l.id)
      ON CONFLICT (wtb_listing_id, listing_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.listings_match_wtb_listings_trigger() RETURNS trigger
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
  ) THEN
    PERFORM public.match_listing_to_wtb_listings(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listings_match_wtb_listings
    AFTER INSERT OR UPDATE OF status, price_nok, is_free, category_id, attributes
    ON public.listings
    FOR EACH ROW EXECUTE FUNCTION public.listings_match_wtb_listings_trigger();
