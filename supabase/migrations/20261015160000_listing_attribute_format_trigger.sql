-- Håndhev tall- og datoformatet på annonseattributter i databasen.
-- Serverfunksjonene (createListing, republishListing, updateListingAttributes,
-- proff-importen) validerer allerede, men RLS lar eieren skrive
-- listings.attributes direkte via PostgREST. Samme regler som
-- findNonNumericAttribute / findInvalidDateAttribute i
-- src/lib/category-filters.ts:
--   * number/range: JSON-tall (null og manglende nøkkel er lov)
--   * date: ISO-streng yyyy-MM-dd (null, "" og manglende nøkkel er lov)
-- mot kategoriens effektive filtre (arv via parent_id, barnet vinner).
--
-- Utkast valideres ikke: autolagringen lagrer skjemaet slik det står. Når en
-- annonse opprettes eller går ut av utkast, sjekkes alle nøkler. Ellers sjekkes
-- bare nøkler der verdien eller formatet (filtertypen etter kategoribytte)
-- endres, så en eldre ugyldig verdi ikke sperrer redigering av andre felt.
--
-- Attributter uten filterrad som lagres som dato
-- (CategoryBehavior.extraDateAttributes) sendes inn som triggerargument
-- {"nøkkel": "etikett"}: funksjonen er vertikal-agnostisk, og
-- kjøretøynøkkelen står bare i triggerdefinisjonen. Den sjekkes i alle
-- kategorier; nøkkelen brukes bare av kjøretøy og er uansett en dato.

CREATE FUNCTION public.listing_attribute_format_rules(_category_id uuid, _extra_dates jsonb)
RETURNS TABLE(key text, type text, label_nb text)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT c.id, c.parent_id, 0 AS depth FROM categories c WHERE c.id = _category_id
    UNION ALL
    SELECT c.id, c.parent_id, chain.depth + 1
    FROM categories c JOIN chain ON c.id = chain.parent_id
    WHERE chain.depth < 20
  ),
  filters AS (
    SELECT DISTINCT ON (f.key) f.key, f.type, f.label_nb
    FROM category_filters f JOIN chain ON chain.id = f.category_id
    ORDER BY f.key, chain.depth
  )
  SELECT key, type, label_nb FROM filters
  UNION ALL
  SELECT e.key, 'date', e.value FROM jsonb_each_text(_extra_dates) e
  WHERE NOT EXISTS (SELECT 1 FROM filters WHERE filters.key = e.key)
$$;

CREATE FUNCTION public.validate_listing_attribute_formats()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _extra_dates jsonb := COALESCE(TG_ARGV[0], '{}')::jsonb;
  _fresh boolean := TG_OP = 'INSERT' OR OLD.status = 'draft';
  _rule record;
  _value jsonb;
BEGIN
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  FOR _rule IN
    SELECT n.key, n.type, n.label_nb
    FROM listing_attribute_format_rules(NEW.category_id, _extra_dates) n
    WHERE n.type IN ('number', 'range', 'date')
      AND (
        _fresh
        OR NEW.attributes -> n.key IS DISTINCT FROM OLD.attributes -> n.key
        OR (
          NEW.category_id IS DISTINCT FROM OLD.category_id
          AND n.type IS DISTINCT FROM (
            SELECT o.type FROM listing_attribute_format_rules(OLD.category_id, _extra_dates) o
            WHERE o.key = n.key
          )
        )
      )
    -- Samme rekkefølge som serveren: tallfeil meldes før datofeil.
    ORDER BY n.type = 'date', n.key
  LOOP
    _value := NEW.attributes -> _rule.key;
    CONTINUE WHEN _value IS NULL OR _value = 'null'::jsonb;
    IF _rule.type = 'date' THEN
      CONTINUE WHEN _value = '""'::jsonb;
      IF jsonb_typeof(_value) <> 'string'
        OR (_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$'
        OR NOT pg_input_is_valid(_value #>> '{}', 'date') THEN
        RAISE EXCEPTION '% må være en gyldig dato.', _rule.label_nb
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF jsonb_typeof(_value) <> 'number' THEN
      RAISE EXCEPTION '% må være et tall.', _rule.label_nb
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listings_validate_attribute_formats
  BEFORE INSERT OR UPDATE OF attributes, category_id, status ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_listing_attribute_formats(
    '{"first_registration_date": "Førstegangsregistrering"}'
  );

REVOKE ALL ON FUNCTION public.listing_attribute_format_rules(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_listing_attribute_formats()
  FROM PUBLIC, anon, authenticated, service_role;
