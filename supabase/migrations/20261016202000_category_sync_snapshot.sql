-- KG-06-F02 (rest): kategorisynken leser hele kildegrunnlaget fra ett
-- konsistent snapshot.
--
-- Synken hentet fire tabeller med hver sine sidevise spørringer og
-- sammenlignet bare radantall før og etter. En endring under hentingen kunne
-- da gi et blandet grunnlag med samme antall, og sync_categories_from_payload
-- sletter produksjonsrader som mangler i grunnlaget. Én SQL-setning ser ett
-- snapshot, og svaret er én verdi, så PostgRESTs radgrense gjelder ikke.

CREATE FUNCTION public.category_sync_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'categories',
      COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.categories r), '[]'::jsonb),
    'category_filters',
      COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.category_filters r), '[]'::jsonb),
    'category_flows',
      COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.category_flows r), '[]'::jsonb),
    'filter_synonyms',
      COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.filter_synonyms r), '[]'::jsonb),
    'default_search_examples',
      (SELECT s.default_search_examples FROM public.site_settings s WHERE s.id)
  );
$$;

REVOKE ALL ON FUNCTION public.category_sync_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.category_sync_snapshot() TO service_role;
