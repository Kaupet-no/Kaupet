-- Solgte annonser forblir synlige en stund etter salget:
--   * 30 dager: åpen for alle via direkte lenke (også favoritter, varsler og
--     bilder). Før var en solgt annonse bare synlig for selger, kjøper og
--     admin, så «favoritt solgt»-varselet og /favoritter kunne ikke vise
--     hvilken annonse det gjaldt.
--   * 2 dager: også i søkeresultatene, der appen viser Solgt-merke og
--     «SOLGT» som pris. Krever `_include_recently_sold => true`, så eldre
--     klienter (uten merket) får samme resultater som før.

ALTER TABLE public.listings ADD COLUMN sold_at timestamptz;

-- Settes bare av databasen: en selger skal ikke kunne holde en solgt annonse
-- synlig (eller øverst i søket) ved å skrive en fremtidig dato. Service-rollen
-- (auth.uid() IS NULL) kan sette verdien eksplisitt, f.eks. i tester.
CREATE FUNCTION public.listings_set_sold_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'sold' THEN
    NEW.sold_at := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sold' THEN
    NEW.sold_at := CASE WHEN auth.uid() IS NULL THEN COALESCE(NEW.sold_at, now()) ELSE now() END;
  ELSIF auth.uid() IS NOT NULL THEN
    NEW.sold_at := OLD.sold_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.listings_set_sold_at() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER listings_set_sold_at_trg
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.listings_set_sold_at();

-- Eksisterende solgte: salgstidspunktet når kjøper er bekreftet, ellers sist
-- endret (nærmeste vi har). Uten å endre tidsstempelet brukerne ser.
ALTER TABLE public.listings DISABLE TRIGGER listings_set_updated_at;
UPDATE public.listings l
SET sold_at = COALESCE(
  (SELECT s.confirmed_at FROM public.listing_sales s WHERE s.listing_id = l.id),
  l.updated_at
)
WHERE l.status = 'sold';
ALTER TABLE public.listings ENABLE TRIGGER listings_set_updated_at;

-- Én definisjon av «offentlig synlig» for annonsen og radene som henger på
-- den (bilder, 360-bilder). SQL-funksjon, så den inlines i policyene — det
-- krever at den IKKE har `SET search_path` (et SET-ledd stopper inlining, og
-- funksjonen ville blitt kalt per rad). Alt i kroppen er skjemakvalifisert
-- eller fra pg_catalog, og funksjonen er ikke SECURITY DEFINER.
CREATE FUNCTION public.listing_is_public(_status public.listing_status, _sold_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT _status = 'active'::public.listing_status
    OR (_status = 'sold'::public.listing_status AND _sold_at > now() - interval '30 days');
$$;
REVOKE ALL ON FUNCTION public.listing_is_public(public.listing_status, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_is_public(public.listing_status, timestamptz)
  TO anon, authenticated, service_role;

ALTER POLICY "Active listings are viewable by everyone" ON public.listings
  USING (
    public.listing_is_public(status, sold_at)
    OR (organization_id IS NULL AND auth.uid() = seller_id)
    OR (organization_id IS NOT NULL AND public.can_view_organization_listing(organization_id, organization_location_id, seller_id, auth.uid()))
  );
ALTER POLICY "Listing images viewable for active or owner" ON public.listing_images
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_images.listing_id AND (public.listing_is_public(l.status, l.sold_at) OR (l.organization_id IS NULL AND l.seller_id = auth.uid()) OR (l.organization_id IS NOT NULL AND public.can_view_organization_listing(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())))));
ALTER POLICY "Listing 360 frames viewable for active or owner" ON public.listing_360_frames
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_360_frames.listing_id AND (public.listing_is_public(l.status, l.sold_at) OR (l.organization_id IS NULL AND l.seller_id = auth.uid()) OR (l.organization_id IS NOT NULL AND public.can_view_organization_listing(l.organization_id, l.organization_location_id, l.seller_id, auth.uid())))));

-- Ny parameter og returkolonne: signaturen endres, så den gamle droppes
-- (ellers to overloads som PostgREST ikke kan velge mellom).
-- ponytail: OR-en på status gjør at listings_active_lat_idx ikke brukes når
-- _include_recently_sold er sann og søket har posisjon; legg til en partiell
-- indeks på solgte (lat) om geosøk blir tregt.
DROP FUNCTION public.search_listings_page(
  jsonb, text[], jsonb, uuid[], public.listing_condition[], boolean,
  integer, integer, jsonb, double precision, double precision,
  double precision, text, integer, integer
);

CREATE FUNCTION public.search_listings_page(_include_groups jsonb DEFAULT '[]'::jsonb, _exclude_any_terms text[] DEFAULT NULL::text[], _exclude_all_groups jsonb DEFAULT '[]'::jsonb, _category_ids uuid[] DEFAULT NULL::uuid[], _conditions listing_condition[] DEFAULT NULL::listing_condition[], _include_free boolean DEFAULT true, _min_price integer DEFAULT NULL::integer, _max_price integer DEFAULT NULL::integer, _attribute_filters jsonb DEFAULT '{}'::jsonb, _center_lat double precision DEFAULT NULL::double precision, _center_lng double precision DEFAULT NULL::double precision, _radius_km double precision DEFAULT 10, _sort text DEFAULT 'new'::text, _limit integer DEFAULT 20, _offset integer DEFAULT 0, _include_recently_sold boolean DEFAULT false) RETURNS TABLE(id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, display_lat double precision, display_lng double precision, created_at timestamp with time zone, attributes jsonb, category_slug text, cover_path text, relevance real, total_count bigint, sold_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    SET pg_trgm.similarity_threshold TO '0.25'
    SET pg_trgm.word_similarity_threshold TO '0.6'
    SET plan_cache_mode TO 'force_custom_plan'
    AS $function$
DECLARE
  _prefilter_terms text[];
  _prefilter_query tsquery;
BEGIN
  -- Unionen av alle inkluderingstermer, uten NULL-er (se hodekommentaren).
  SELECT array_agg(DISTINCT term) INTO _prefilter_terms
  FROM jsonb_array_elements(COALESCE(_include_groups, '[]'::jsonb)) AS groups(group_value)
  CROSS JOIN LATERAL jsonb_array_elements_text(group_value->'terms') AS terms(term)
  WHERE term IS NOT NULL;

  IF _prefilter_terms IS NOT NULL THEN
    -- OR-et tsquery over termene. Termer som ikke gir noe leksem (stoppord,
    -- ren tegnsetting) utelates: de kan uansett aldri treffe via @@, og en
    -- tom tsquery i OR-kjeden ville bare gitt støy. `::text = ''` brukes
    -- framfor `= ''::tsquery` for å unngå en NOTICE per kall.
    SELECT string_agg('(' || parsed.query::text || ')', ' | ')::tsquery
      INTO _prefilter_query
    FROM (
      SELECT websearch_to_tsquery('norwegian', term) AS query
      FROM unnest(_prefilter_terms) AS term
    ) AS parsed
    WHERE parsed.query::text <> '';
  END IF;

  RETURN QUERY
  WITH matching AS (
    SELECT
      -- Kun kolonnene som faktisk brukes nedenfor. Før sto det `l.*`, som
      -- materialiserte alle ~36 kolonnene av HELE treffmengden før LIMIT.
      l.id,
      l.kaupet_code,
      l.title,
      l.subtitle,
      l.price_nok,
      l.is_free,
      l.city,
      l.display_lat,
      l.display_lng,
      l.created_at,
      l.attributes,
      l.sold_at,
      c.slug AS category_slug,
      CASE
        WHEN jsonb_array_length(COALESCE(_include_groups, '[]'::jsonb)) = 0 THEN 0::real
        ELSE ts_rank(
          l.search_vector,
          websearch_to_tsquery(
            'norwegian',
            COALESCE(
              (
                SELECT string_agg(DISTINCT term, ' ')
                FROM jsonb_array_elements(COALESCE(_include_groups, '[]'::jsonb)) AS groups(group_value)
                CROSS JOIN LATERAL jsonb_array_elements_text(group_value->'terms') AS terms(term)
              ),
              ''
            )
          )
        )
      END AS relevance
    FROM public.listings l
    LEFT JOIN public.categories c ON c.id = l.category_id
    -- Nylig solgte vises i resultatlisten med Solgt-merke (se hodekommentaren).
    WHERE (
      l.status = 'active'
      OR (
        _include_recently_sold
        AND l.status = 'sold'
        AND l.sold_at > now() - interval '2 days'
      )
    )
      -- INDEKSERBART FORHÅNDSFILTER. Supersett av den eksakte logikken under;
      -- se hodekommentaren. Når søket ikke har termer er _prefilter_terms
      -- NULL, og hele leddet foldes bort av custom-planen.
      AND (
        _prefilter_terms IS NULL
        OR l.search_vector @@ _prefilter_query
        OR l.title %  ANY(_prefilter_terms)
        OR l.title %> ANY(_prefilter_terms)
      )
      AND (
        COALESCE(_include_groups, '[]'::jsonb) = '[]'::jsonb
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(_include_groups) AS groups(group_value)
          WHERE NOT CASE WHEN group_value->>'mode' = 'all' THEN
            NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(group_value->'terms') AS terms(term)
              WHERE NOT public.listings_search_term_match(l.search_vector, l.title, term)
            )
          ELSE
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(group_value->'terms') AS terms(term)
              WHERE public.listings_search_term_match(l.search_vector, l.title, term)
            )
          END
        )
      )
      AND (
        _exclude_any_terms IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(_exclude_any_terms) AS terms(term)
          WHERE public.listings_search_term_excludes(l.search_vector, l.title, term)
        )
      )
      AND (
        COALESCE(_exclude_all_groups, '[]'::jsonb) = '[]'::jsonb
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(_exclude_all_groups) AS groups(group_value)
          WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(group_value) AS terms(term)
            WHERE NOT public.listings_search_term_excludes(l.search_vector, l.title, term)
          )
        )
      )
      AND (_category_ids IS NULL OR l.category_id = ANY(_category_ids))
      AND (_conditions IS NULL OR l.condition = ANY(_conditions))
      AND (_include_free OR NOT l.is_free)
      AND (
        _min_price IS NULL
        OR (_include_free AND l.is_free)
        OR l.price_nok >= _min_price
      )
      AND (
        _max_price IS NULL
        OR (_include_free AND l.is_free)
        OR l.price_nok <= _max_price
      )
      AND public.listing_matches_attribute_filters(l.attributes, _attribute_filters)
      AND (
        _center_lat IS NULL
        OR _center_lng IS NULL
        OR (
          l.lat IS NOT NULL
          AND l.lng IS NOT NULL
          -- Bounding box-forfilter på breddegrad, brukt av planleggeren via
          -- listings_active_lat_idx. En breddegrad er minst 110.574 km
          -- overalt på jorden; vi deler på 110.5 (litt mindre enn det reelle
          -- minimumet), så boksen blir garantert litt for STOR, aldri for
          -- liten. Boksen er dermed et bevislig supersett av sirkelen, og
          -- AND-et med det eksakte haversine-uttrykket under gir nøyaktig
          -- samme resultatsett som før — bare med et smalt range-scan i
          -- stedet for full scan. Radius-klampingen må være identisk med
          -- den i haversine-uttrykket, ellers kunne boksen kuttet vekk treff
          -- sirkelen fortsatt skulle inkludert.
          AND l.lat BETWEEN
                _center_lat - (LEAST(GREATEST(COALESCE(_radius_km, 10), 1), 100) / 110.5)
            AND _center_lat + (LEAST(GREATEST(COALESCE(_radius_km, 10), 1), 100) / 110.5)
          AND 6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(_center_lat)) * cos(radians(l.lat)) *
              cos(radians(l.lng) - radians(_center_lng)) +
              sin(radians(_center_lat)) * sin(radians(l.lat))
            ))
          ) <= LEAST(GREATEST(COALESCE(_radius_km, 10), 1), 100)
        )
      )
  ), counted AS (
    SELECT matching.*, count(*) OVER () AS total_count
    FROM matching
  )
  SELECT
    counted.id,
    counted.kaupet_code,
    counted.title,
    counted.subtitle,
    counted.price_nok,
    counted.is_free,
    counted.city,
    counted.display_lat,
    counted.display_lng,
    counted.created_at,
    counted.attributes,
    counted.category_slug,
    (
      SELECT image.storage_path
      FROM public.listing_images image
      WHERE image.listing_id = counted.id
      ORDER BY image.sort_order
      LIMIT 1
    ) AS cover_path,
    counted.relevance,
    counted.total_count,
    counted.sold_at
  FROM counted
  ORDER BY
    CASE WHEN _sort = 'relevance' THEN counted.relevance END DESC NULLS LAST,
    CASE WHEN _sort = 'price_asc' THEN counted.price_nok END ASC NULLS LAST,
    CASE WHEN _sort = 'price_desc' THEN counted.price_nok END DESC NULLS LAST,
    CASE WHEN _sort NOT IN ('relevance', 'price_asc', 'price_desc') THEN counted.created_at END DESC,
    counted.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END
$function$
;
REVOKE ALL ON FUNCTION public.search_listings_page(
  jsonb, text[], jsonb, uuid[], public.listing_condition[], boolean,
  integer, integer, jsonb, double precision, double precision,
  double precision, text, integer, integer, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_listings_page(
  jsonb, text[], jsonb, uuid[], public.listing_condition[], boolean,
  integer, integer, jsonb, double precision, double precision,
  double precision, text, integer, integer, boolean
) TO anon, authenticated, service_role;
