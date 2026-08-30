-- Kvalitetsport for forside-feeden ("Populært nå" / "Nye annonser"):
--
-- 1. popular_listings_last_week/popular_listings_by_category krevde ikke
--    reelt bilde og hadde ingen manuell utelatelsesmekanisme — en annonse
--    med skjermbilde av en SMS-verifikasjonskode kunne dermed vises på
--    forsiden på lik linje med en ekte annonse så lenge status = 'active'.
-- 2. Admin trenger en lett, reversibel måte å utelate en spesifikk annonse
--    fra forsiden uten å deaktivere hele annonsen (selgeren beholder den
--    fullt synlig i søk/kategorisider — kun forsideeksponeringen fjernes).
--
-- Dette bygger videre på den eksisterende moderasjonsmekanismen
-- (admin_moderation_log, samme autorisasjonsmønster som
-- admin_disable_listing) i stedet for en parallell mekanisme.

ALTER TABLE public.listings
  ADD COLUMN hidden_from_home boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.admin_set_listing_home_visibility(_id uuid, _hidden boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.listings SET hidden_from_home = _hidden WHERE id = _id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (
    auth.uid(),
    CASE WHEN _hidden THEN 'hide_listing_from_home' ELSE 'show_listing_on_home' END,
    'listing',
    _id::text
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_set_listing_home_visibility(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_listing_home_visibility(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_search_listings(_query text DEFAULT ''::text, _status text DEFAULT NULL::text, _limit integer DEFAULT 50)
RETURNS TABLE(id uuid, kaupet_code character, title text, status public.listing_status, seller_id uuid, seller_name text, created_at timestamp with time zone, hidden_from_home boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT l.id, l.kaupet_code, l.title, l.status, l.seller_id, p.display_name, l.created_at, l.hidden_from_home
  FROM public.listings l
  LEFT JOIN public.profiles p ON p.id = l.seller_id
  WHERE (_query = '' OR l.title ILIKE '%' || _query || '%' OR l.kaupet_code = _query)
    AND (_status IS NULL OR l.status::text = _status)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;

-- Kvalifiser forside-kandidater: reelt hovedbilde og ikke admin-utelatt.
-- views_last_week DESC NULLS LAST, created_at DESC faller allerede naturlig
-- tilbake til nyeste-først når ingen annonser har reelle visninger ennå —
-- frontend bruker dette til å bytte overskrift mellom "Populært nå" og
-- "Nye annonser" (se usePopularListings).
CREATE OR REPLACE FUNCTION public.popular_listings_last_week(_limit integer DEFAULT 8)
RETURNS TABLE(listing_id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, created_at timestamptz, cover_path text, total_views bigint, views_last_week bigint, mileage_km numeric, category_slug text, attributes jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.kaupet_code, l.title, l.subtitle, l.price_nok, l.is_free, l.city, l.created_at,
    (SELECT i.storage_path FROM public.listing_images i WHERE i.listing_id = l.id ORDER BY i.sort_order LIMIT 1) AS cover_path,
    COALESCE(t.total_views, 0) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id AND e.created_at > now() - interval '7 days') AS views_last_week,
    (l.attributes->>'mileage_km')::numeric AS mileage_km,
    c.slug AS category_slug,
    l.attributes AS attributes
  FROM public.listings l
  LEFT JOIN public.categories c ON c.id = l.category_id
  LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
  WHERE l.status = 'active'
    AND l.hidden_from_home = false
    AND EXISTS (SELECT 1 FROM public.listing_images i WHERE i.listing_id = l.id)
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 50));
$$;

CREATE OR REPLACE FUNCTION public.popular_listings_by_category(_category_ids uuid[], _limit integer DEFAULT 12, _offset integer DEFAULT 0)
RETURNS TABLE(listing_id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, created_at timestamptz, cover_path text, total_views bigint, views_last_week bigint, mileage_km numeric, category_slug text, attributes jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.kaupet_code, l.title, l.subtitle, l.price_nok, l.is_free, l.city, l.created_at,
    (SELECT i.storage_path FROM public.listing_images i WHERE i.listing_id = l.id ORDER BY i.sort_order LIMIT 1) AS cover_path,
    COALESCE(t.total_views, 0) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id AND e.created_at > now() - interval '7 days') AS views_last_week,
    (l.attributes->>'mileage_km')::numeric AS mileage_km,
    c.slug AS category_slug,
    l.attributes AS attributes
  FROM public.listings l
  LEFT JOIN public.categories c ON c.id = l.category_id
  LEFT JOIN public.listing_view_totals t ON t.listing_id = l.id
  WHERE l.status = 'active' AND l.category_id = ANY(_category_ids)
    AND l.hidden_from_home = false
    AND EXISTS (SELECT 1 FROM public.listing_images i WHERE i.listing_id = l.id)
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 12), 60))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;
