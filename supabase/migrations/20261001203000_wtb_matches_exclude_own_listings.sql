-- «N annonser matcher allerede» på ønskes kjøpt viste brukerens egne
-- salgsannonser. Serverfunksjonen sender nå innlogget bruker som
-- _exclude_seller_id (null for gjester).
DROP FUNCTION public.listings_matching_wtb(
  uuid, integer, jsonb, double precision, double precision, integer, integer
);

-- ponytail: plpgsql-predikat per annonse i kategorien; flytt attributtsjekkene
-- inn i indekserbar SQL hvis store kategorier blir trege.
CREATE FUNCTION public.listings_matching_wtb(
    _category_id uuid,
    _max_price_nok integer,
    _attributes jsonb,
    _lat double precision,
    _lng double precision,
    _radius_km integer,
    _limit integer DEFAULT 5,
    _exclude_seller_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid, total_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH matched AS (
    SELECT l.id, l.published_at, l.created_at
    FROM public.listings l
    WHERE l.status = 'active'
      AND l.category_id = _category_id
      AND (_exclude_seller_id IS NULL OR l.seller_id <> _exclude_seller_id)
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

REVOKE ALL ON FUNCTION public.listings_matching_wtb(
  uuid, integer, jsonb, double precision, double precision, integer, integer, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listings_matching_wtb(
  uuid, integer, jsonb, double precision, double precision, integer, integer, uuid
) TO service_role;
