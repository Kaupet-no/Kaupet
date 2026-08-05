-- Per-category example text for the listing-title input ("F.eks. …"), so a
-- user selling trousers sees a trousers example instead of the one hardcoded
-- bike title. Resolved up the category tree client-side: nearest ancestor
-- with a value wins; null falls back to the generic example.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS title_example text;

UPDATE public.categories SET title_example = v.example
FROM (VALUES
  ('Elektronikk', 'iPhone 14 Pro 128 GB — god stand'),
  ('Interiør', 'IKEA Stockholm sofa 3-seter — mørkegrønn'),
  ('Hus og hage', 'Stihl motorsag MS 180 — lite brukt'),
  ('Klær og mote', 'Levis Ribcage Straight Blå Jeans'),
  ('Sport og friluft', 'Trek Marlin 5 sykkel 2022 — sort, lite brukt'),
  ('Dyreutstyr', 'Hundebur str. L — sammenleggbart'),
  ('Kunst', 'Litografi av Kaare Espolin Johnson — innrammet'),
  ('Barn og baby', 'Stokke Tripp Trapp barnestol — naturfarget'),
  ('Hobby og fritid', 'LEGO Technic 42115 Lamborghini — komplett')
) AS v(name_nb, example)
WHERE public.categories.name_nb = v.name_nb
  AND public.categories.parent_id IS NULL;

-- Keep staging→prod category sync in step with the new column (full function
-- body from the baseline, with title_example added to the upsert).
CREATE OR REPLACE FUNCTION public.sync_categories_from_payload(p_categories jsonb, p_category_filters jsonb, p_category_flows jsonb, p_filter_synonyms jsonb, p_default_search_examples text[], p_synced_by uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- 1. Kategori-id-kart: staging sin id -> endelig id i produksjon (behold
  -- produksjonens eksisterende id ved slug-treff, ellers staging sin id).
  CREATE TEMP TABLE _category_id_map (staging_id UUID PRIMARY KEY, final_id UUID NOT NULL) ON COMMIT DROP;
  INSERT INTO _category_id_map (staging_id, final_id)
  SELECT
    (r->>'id')::UUID,
    COALESCE(existing.id, (r->>'id')::UUID)
  FROM jsonb_array_elements(p_categories) r
  LEFT JOIN public.categories existing ON existing.slug = r->>'slug';

  -- 2. Upsert kategorier (parent_id håndteres i egne pass under, siden
  -- foreldre kan refereres før de er satt inn).
  INSERT INTO public.categories (
    id, slug, name_nb, parent_id, sort_order, icon, color, heading_font,
    search_examples, title_example, is_hidden, created_at, updated_at
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
    r->>'title_example',
    COALESCE((r->>'is_hidden')::BOOLEAN, false),
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_categories) r
  JOIN _category_id_map m ON m.staging_id = (r->>'id')::UUID
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name_nb = EXCLUDED.name_nb,
    sort_order = EXCLUDED.sort_order,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    heading_font = EXCLUDED.heading_font,
    search_examples = EXCLUDED.search_examples,
    title_example = EXCLUDED.title_example,
    is_hidden = EXCLUDED.is_hidden;

  -- Sett parent_id for kategorier som ifølge staging har en forelder.
  UPDATE public.categories c
  SET parent_id = pm.final_id
  FROM jsonb_array_elements(p_categories) r
  JOIN _category_id_map m ON m.staging_id = (r->>'id')::UUID
  JOIN _category_id_map pm ON pm.staging_id = (r->>'parent_id')::UUID
  WHERE c.id = m.final_id AND r->>'parent_id' IS NOT NULL;

  -- Nullstill parent_id for kategorier som ifølge staging IKKE lenger har
  -- en forelder (ellers henger en gammel produksjons-parent_id igjen, siden
  -- vi ikke lenger sletter og setter inn alle rader på nytt hver gang).
  UPDATE public.categories c
  SET parent_id = NULL
  WHERE c.parent_id IS NOT NULL
    AND c.id IN (SELECT final_id FROM _category_id_map)
    AND c.id NOT IN (
      SELECT m.final_id
      FROM jsonb_array_elements(p_categories) r
      JOIN _category_id_map m ON m.staging_id = (r->>'id')::UUID
      WHERE r->>'parent_id' IS NOT NULL
    );

  -- 3. Slett kategorier som ikke lenger finnes i staging (matchet på slug).
  -- Cascader kun for DISSE kategoriene til filtre/flows/synonymer/
  -- word-stats, og nullstiller listings.category_id kun for annonser i
  -- disse — ikke for uendrede kategorier.
  DELETE FROM public.categories
  WHERE slug NOT IN (SELECT r->>'slug' FROM jsonb_array_elements(p_categories) r);

  -- 4. Filter-id-kart: staging sin id -> endelig id (behold produksjonens
  -- eksisterende id ved kategori+key-treff, siden category_filters har
  -- UNIQUE(category_id, key)).
  CREATE TEMP TABLE _filter_id_map (
    staging_id UUID PRIMARY KEY, final_id UUID NOT NULL, final_category_id UUID NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _filter_id_map (staging_id, final_id, final_category_id)
  SELECT
    (r->>'id')::UUID,
    COALESCE(existing.id, (r->>'id')::UUID),
    m.final_id
  FROM jsonb_array_elements(p_category_filters) r
  JOIN _category_id_map m ON m.staging_id = (r->>'category_id')::UUID
  LEFT JOIN public.category_filters existing
    ON existing.category_id = m.final_id AND existing.key = r->>'key';

  INSERT INTO public.category_filters (
    id, category_id, key, label_nb, type, unit, options, sort_order,
    is_primary, depends_on_key, depends_on_value, created_at, updated_at
  )
  SELECT
    fm.final_id,
    fm.final_category_id,
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
  JOIN _filter_id_map fm ON fm.staging_id = (r->>'id')::UUID
  ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    key = EXCLUDED.key,
    label_nb = EXCLUDED.label_nb,
    type = EXCLUDED.type,
    unit = EXCLUDED.unit,
    options = EXCLUDED.options,
    sort_order = EXCLUDED.sort_order,
    is_primary = EXCLUDED.is_primary,
    depends_on_key = EXCLUDED.depends_on_key,
    depends_on_value = EXCLUDED.depends_on_value;

  DELETE FROM public.category_filters
  WHERE id NOT IN (SELECT final_id FROM _filter_id_map);

  -- 5. Flow-id-kart: staging sin id -> endelig id (behold produksjonens
  -- eksisterende id ved kategori-treff, siden category_flows har
  -- UNIQUE(category_id)).
  CREATE TEMP TABLE _flow_id_map (
    staging_id UUID PRIMARY KEY, final_id UUID NOT NULL, final_category_id UUID NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _flow_id_map (staging_id, final_id, final_category_id)
  SELECT
    (r->>'id')::UUID,
    COALESCE(existing.id, (r->>'id')::UUID),
    m.final_id
  FROM jsonb_array_elements(p_category_flows) r
  JOIN _category_id_map m ON m.staging_id = (r->>'category_id')::UUID
  LEFT JOIN public.category_flows existing ON existing.category_id = m.final_id;

  INSERT INTO public.category_flows (
    id, category_id, steps, modules, field_groups, sort_order, created_at, updated_at
  )
  SELECT
    fm.final_id,
    fm.final_category_id,
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'steps') x), '{}'),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'modules') x), '{}'),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'field_groups') x), '{}'),
    (r->>'sort_order')::INT,
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_category_flows) r
  JOIN _flow_id_map fm ON fm.staging_id = (r->>'id')::UUID
  ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    steps = EXCLUDED.steps,
    modules = EXCLUDED.modules,
    field_groups = EXCLUDED.field_groups,
    sort_order = EXCLUDED.sort_order;

  DELETE FROM public.category_flows
  WHERE id NOT IN (SELECT final_id FROM _flow_id_map);

  -- 6. Synonym-id-kart: staging sin id -> endelig id (behold produksjonens
  -- eksisterende id ved filter+option+phrase-treff, siden filter_synonyms
  -- har UNIQUE(category_filter_id, option_value, phrase)).
  CREATE TEMP TABLE _synonym_id_map (
    staging_id UUID PRIMARY KEY, final_id UUID NOT NULL, final_filter_id UUID NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _synonym_id_map (staging_id, final_id, final_filter_id)
  SELECT
    (r->>'id')::UUID,
    COALESCE(existing.id, (r->>'id')::UUID),
    fm.final_id
  FROM jsonb_array_elements(p_filter_synonyms) r
  JOIN _filter_id_map fm ON fm.staging_id = (r->>'category_filter_id')::UUID
  LEFT JOIN public.filter_synonyms existing
    ON existing.category_filter_id = fm.final_id
    AND existing.option_value IS NOT DISTINCT FROM (r->>'option_value')
    AND existing.phrase = r->>'phrase';

  INSERT INTO public.filter_synonyms (
    id, category_filter_id, option_value, phrase, is_generated, created_at, updated_at
  )
  SELECT
    sm.final_id,
    sm.final_filter_id,
    r->>'option_value',
    r->>'phrase',
    COALESCE((r->>'is_generated')::BOOLEAN, true),
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_filter_synonyms) r
  JOIN _synonym_id_map sm ON sm.staging_id = (r->>'id')::UUID
  ON CONFLICT (id) DO UPDATE SET
    category_filter_id = EXCLUDED.category_filter_id,
    option_value = EXCLUDED.option_value,
    phrase = EXCLUDED.phrase,
    is_generated = EXCLUDED.is_generated;

  DELETE FROM public.filter_synonyms
  WHERE id NOT IN (SELECT final_id FROM _synonym_id_map);

  UPDATE public.site_settings
  SET default_search_examples = p_default_search_examples
  WHERE id = true;

  UPDATE public.category_sync_status
  SET last_synced_at = now(), last_synced_by = p_synced_by
  WHERE id = true;
END;
$$;
