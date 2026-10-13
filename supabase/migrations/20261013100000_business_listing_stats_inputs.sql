-- getBusinessListingStats hentet annonser, statushistorikk, salg og
-- visningshendelser som rå, upaginerte PostgREST-spørringer, og sendte alle
-- annonse-ID-ene i .in(...)-lister. max_rows (1000) avkortet svaret stille –
-- visningshendelser er én rad per visning, så det skjedde allerede for små
-- organisasjoner – og ID-listene sprengte URL-grensen ved noen hundre annonser.
--
-- Funksjonen returnerer ett jsonb-objekt (ikke underlagt max_rows), filtrerer
-- med samme regel som RLS (can_view_organization_listing) og aggregerer
-- visninger per annonse og UTC-dag i databasen. Dagsløkken blir i appkoden.

CREATE FUNCTION public.business_listing_stats_inputs(
  _organization_id uuid,
  _user_id uuid,
  _location_id uuid,
  _views_since timestamptz,
  _sales_since timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server access required';
  END IF;

  RETURN (
    WITH visible AS MATERIALIZED (
      SELECT l.id, l.status, l.created_at, COALESCE(t.total_views, 0) AS total_views
      FROM public.listings l
      LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
      WHERE l.organization_id = _organization_id
        AND (_location_id IS NULL OR l.organization_location_id = _location_id)
        AND public.can_view_organization_listing(
          l.organization_id, l.organization_location_id, l.seller_id, _user_id
        )
    )
    SELECT jsonb_build_object(
      'listings', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', v.id, 'status', v.status, 'created_at', v.created_at,
          'total_views', v.total_views
        ) ORDER BY v.created_at, v.id)
        FROM visible v
      ), '[]'::jsonb),
      'status_history', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'listing_id', h.listing_id, 'status', h.status, 'changed_at', h.changed_at
        ) ORDER BY h.changed_at, h.id)
        FROM public.listing_status_history h
        JOIN visible v ON v.id = h.listing_id
      ), '[]'::jsonb),
      'sales', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'listing_id', s.listing_id, 'confirmed_at', s.confirmed_at
        ) ORDER BY s.confirmed_at)
        FROM public.listing_sales s
        JOIN visible v ON v.id = s.listing_id
        WHERE s.confirmed_at >= _sales_since
      ), '[]'::jsonb),
      -- Dag som UTC-dato, samme nøkkel som dayKey() i appkoden.
      'view_days', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'listing_id', d.listing_id, 'day', d.day, 'views', d.views
        ) ORDER BY d.listing_id, d.day)
        FROM (
          SELECT e.listing_id,
            to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            count(*) AS views
          FROM public.listing_view_events e
          JOIN visible v ON v.id = e.listing_id
          WHERE e.created_at >= _views_since
          GROUP BY 1, 2
        ) d
      ), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_listing_stats_inputs(uuid, uuid, uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_listing_stats_inputs(uuid, uuid, uuid, timestamptz, timestamptz)
  TO service_role;
