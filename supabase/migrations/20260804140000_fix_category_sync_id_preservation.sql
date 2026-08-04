-- Fix for sync_categories_from_payload (20260804090000): staging og
-- produksjon er to uavhengige Supabase-prosjekter, så samme kategori har
-- ulik UUID i hvert miljø. Den opprinnelige versjonen satte inn staging
-- sine rå UUID-er i produksjon, noe som ville nullstilt category_id på
-- ALLE annonser i produksjon (listings.category_id har ON DELETE SET NULL
-- mot categories, og hele categories-tabellen slettes/gjenopprettes ved
-- synk).
--
-- Fiksen: match kategorier på slug (stabil på tvers av miljøer) og behold
-- produksjonens eksisterende id for kategorier som finnes i begge miljøer.
-- Kun kategorier som er helt nye i staging (ingen slug-match i produksjon)
-- får en ny id (staging sin id, siden den uansett ikke kolliderer med noe
-- i produksjon etter at tabellen er tømt).
CREATE OR REPLACE FUNCTION public.sync_categories_from_payload(
  p_categories JSONB,
  p_category_filters JSONB,
  p_category_flows JSONB,
  p_filter_synonyms JSONB,
  p_default_search_examples TEXT[],
  p_synced_by UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Kartlegg staging sin kategori-id -> endelig id i produksjon: bruk
  -- produksjonens eksisterende id ved slug-treff, ellers staging sin id.
  CREATE TEMP TABLE _category_id_map (staging_id UUID PRIMARY KEY, final_id UUID NOT NULL) ON COMMIT DROP;
  INSERT INTO _category_id_map (staging_id, final_id)
  SELECT
    (r->>'id')::UUID,
    COALESCE(existing.id, (r->>'id')::UUID)
  FROM jsonb_array_elements(p_categories) r
  LEFT JOIN public.categories existing ON existing.slug = r->>'slug';

  -- Barn-tabeller først (FK mot categories/category_filters).
  DELETE FROM public.filter_synonyms;
  DELETE FROM public.category_flows;
  DELETE FROM public.category_filters;
  DELETE FROM public.categories;

  -- Kategorier settes inn med kartlagt id og uten parent_id først (selv-
  -- referanse), så parent_id oppdateres i et andre pass når alle id-er finnes.
  INSERT INTO public.categories (
    id, slug, name_nb, parent_id, sort_order, icon, color, heading_font,
    search_examples, is_hidden, created_at, updated_at
  )
  SELECT
    m.final_id,
    r->>'slug',
    r->>'name_nb',
    NULL,
    (r->>'sort_order')::INT,
    r->>'icon',
    r->>'color',
    r->>'heading_font',
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'search_examples') x), '{}'),
    COALESCE((r->>'is_hidden')::BOOLEAN, false),
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_categories) r
  JOIN _category_id_map m ON m.staging_id = (r->>'id')::UUID;

  UPDATE public.categories c
  SET parent_id = pm.final_id
  FROM jsonb_array_elements(p_categories) r
  JOIN _category_id_map m ON m.staging_id = (r->>'id')::UUID
  JOIN _category_id_map pm ON pm.staging_id = (r->>'parent_id')::UUID
  WHERE c.id = m.final_id AND r->>'parent_id' IS NOT NULL;

  -- category_filters/category_flows/filter_synonyms har ingen eksterne
  -- referanser inn (kun fra hverandre, som synkes sammen hver gang), så de
  -- kan bruke staging sine egne id-er direkte — men category_id må pekes om
  -- til den kartlagte produksjons-id-en.
  INSERT INTO public.category_filters (
    id, category_id, key, label_nb, type, unit, options, sort_order,
    is_primary, depends_on_key, depends_on_value, created_at, updated_at
  )
  SELECT
    (r->>'id')::UUID,
    m.final_id,
    r->>'key',
    r->>'label_nb',
    r->>'type',
    r->>'unit',
    r->'options',
    (r->>'sort_order')::INT,
    COALESCE((r->>'is_primary')::BOOLEAN, false),
    r->>'depends_on_key',
    r->>'depends_on_value',
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_category_filters) r
  JOIN _category_id_map m ON m.staging_id = (r->>'category_id')::UUID;

  INSERT INTO public.category_flows (
    id, category_id, steps, modules, field_groups, sort_order, created_at, updated_at
  )
  SELECT
    (r->>'id')::UUID,
    m.final_id,
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'steps') x), '{}'),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'modules') x), '{}'),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'field_groups') x), '{}'),
    (r->>'sort_order')::INT,
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_category_flows) r
  JOIN _category_id_map m ON m.staging_id = (r->>'category_id')::UUID;

  INSERT INTO public.filter_synonyms (
    id, category_filter_id, option_value, phrase, is_generated, created_at, updated_at
  )
  SELECT
    (r->>'id')::UUID,
    (r->>'category_filter_id')::UUID,
    r->>'option_value',
    r->>'phrase',
    COALESCE((r->>'is_generated')::BOOLEAN, true),
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_filter_synonyms) r;

  UPDATE public.site_settings
  SET default_search_examples = p_default_search_examples
  WHERE id = true;

  UPDATE public.category_sync_status
  SET last_synced_at = now(), last_synced_by = p_synced_by
  WHERE id = true;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_categories_from_payload FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_categories_from_payload TO service_role;
