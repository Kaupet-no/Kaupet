-- Båt-vertikalen: Båter (Båt > Båter) får en Bil-lignende annonseflyt drevet
-- av category_filters/category_flows-data pluss den nye boat-facts
-- field-groupen (merke/modell-fritekst med forslag fra eksisterende annonser).
--
-- To generelle utvidelser av category_filters som Båter trenger:
--   depends_on_not_value — vis feltet kun når avhengigheten IKKE har verdien
--     (Drivstoff/Hestekrefter/Maksfart skjules når Motortype = "Uten motor").
--   is_optional — feltet vises i opprettelsesflyten men er ikke påkrevd
--     (Driftstimer, Motorfabrikant, Bredde, Dybde, Vekt).
ALTER TABLE public.category_filters
  ADD COLUMN IF NOT EXISTS depends_on_not_value text,
  ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;

-- Autocomplete-forslag for fritekstattributter (Merke/Modell for båt): de
-- distinkte verdiene som finnes på aktive annonser i kategori-subtreet.
CREATE OR REPLACE FUNCTION public.attribute_value_suggestions(cat_id uuid, attr_key text, q text)
RETURNS TABLE(value text, cnt bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE subtree AS (
    SELECT id FROM public.categories WHERE id = cat_id
    UNION ALL
    SELECT c.id FROM public.categories c JOIN subtree s ON c.parent_id = s.id
  )
  SELECT l.attributes->>attr_key AS value, count(*) AS cnt
  FROM public.listings l
  WHERE l.category_id IN (SELECT id FROM subtree)
    AND l.status = 'active'
    AND COALESCE(l.attributes->>attr_key, '') <> ''
    AND (q IS NULL OR q = '' OR l.attributes->>attr_key ILIKE q || '%')
  GROUP BY 1
  ORDER BY cnt DESC, value
  LIMIT 10;
$$;

-- Filtre og flow for Båter (matcher Bil-mønsteret; slug-oppslag så
-- migrasjonen virker på tvers av miljøer).
DO $$
DECLARE
  bater_id uuid;
BEGIN
  SELECT c.id INTO bater_id
  FROM public.categories c
  JOIN public.categories p ON p.id = c.parent_id
  WHERE c.slug = 'bater' AND p.slug = 'bat';
  IF bater_id IS NULL THEN
    RAISE NOTICE 'Kategorien Båt > Båter finnes ikke — hopper over båtfiltre';
    RETURN;
  END IF;

  INSERT INTO public.category_filters
    (category_id, key, label_nb, type, unit, options, sort_order, is_primary, depends_on_key, depends_on_value, depends_on_not_value, is_optional)
  VALUES
    (bater_id, 'brand', 'Merke', 'text', NULL, NULL, 10, true, NULL, NULL, NULL, false),
    (bater_id, 'model', 'Modell', 'text', NULL, NULL, 20, true, NULL, NULL, NULL, false),
    (bater_id, 'boat_type', 'Båttype', 'select', NULL, '[
      {"value":"bowrider","label_nb":"Bowrider"},
      {"value":"cabincruiser","label_nb":"Cabincruiser"},
      {"value":"daycruiser","label_nb":"Daycruiser"},
      {"value":"flybridge","label_nb":"Flybridge"},
      {"value":"jolle","label_nb":"Jolle"},
      {"value":"pilothouse","label_nb":"Pilothouse"},
      {"value":"rib","label_nb":"RIB"},
      {"value":"seilbat","label_nb":"Seilbåt"},
      {"value":"skjaergardsjeep","label_nb":"Skjærgårdsjeep"},
      {"value":"speedbat","label_nb":"Speedbåt"},
      {"value":"snekke","label_nb":"Snekke"},
      {"value":"vannscooter","label_nb":"Vannscooter"},
      {"value":"yacht","label_nb":"Yacht"},
      {"value":"sjark_yrkesbat","label_nb":"Sjark/Yrkesbåt"},
      {"value":"andre","label_nb":"Andre"}
    ]'::jsonb, 30, true, NULL, NULL, NULL, false),
    (bater_id, 'length_ft', 'Størrelse', 'number', 'fot', NULL, 40, true, NULL, NULL, NULL, false),
    (bater_id, 'engine_hours', 'Driftstimer', 'number', 'timer', NULL, 50, true, NULL, NULL, NULL, true),
    (bater_id, 'motor_type', 'Motortype', 'select', NULL, '[
      {"value":"innenbords","label_nb":"Innenbords"},
      {"value":"utenbords","label_nb":"Utenbords"},
      {"value":"uten_motor","label_nb":"Uten motor"}
    ]'::jsonb, 60, true, NULL, NULL, NULL, false),
    (bater_id, 'year', 'Årsmodell', 'number', NULL, NULL, 70, true, NULL, NULL, NULL, false),
    (bater_id, 'power_hk', 'Hestekrefter', 'number', 'hk', NULL, 80, false, 'motor_type', NULL, 'uten_motor', false),
    (bater_id, 'fuel_type', 'Drivstoff', 'select', NULL, '[
      {"value":"bensin","label_nb":"Bensin"},
      {"value":"diesel","label_nb":"Diesel"},
      {"value":"el","label_nb":"El"},
      {"value":"gass","label_nb":"Gass"},
      {"value":"gass_bensin","label_nb":"Gass+Bensin"}
    ]'::jsonb, 90, false, 'motor_type', NULL, 'uten_motor', false),
    (bater_id, 'max_speed_knots', 'Maksfart', 'number', 'knop', NULL, 100, false, 'motor_type', NULL, 'uten_motor', false),
    (bater_id, 'sleeping_places', 'Sengeplasser', 'number', NULL, NULL, 110, false, NULL, NULL, NULL, false),
    (bater_id, 'seats', 'Sitteplasser', 'number', NULL, NULL, 120, false, NULL, NULL, NULL, false),
    (bater_id, 'construction', 'Konstruksjon', 'select', NULL, '[
      {"value":"aluminium","label_nb":"Aluminium"},
      {"value":"glassfiber","label_nb":"Glassfiber"},
      {"value":"plast","label_nb":"Plast"},
      {"value":"tre","label_nb":"Tre"},
      {"value":"annet","label_nb":"Annet"}
    ]'::jsonb, 130, false, NULL, NULL, NULL, false),
    (bater_id, 'color', 'Farge', 'text', NULL, NULL, 140, false, NULL, NULL, NULL, false),
    (bater_id, 'motor_brand', 'Motorfabrikant', 'text', NULL, NULL, 150, false, NULL, NULL, NULL, true),
    (bater_id, 'width_cm', 'Bredde', 'number', 'cm', NULL, 160, false, NULL, NULL, NULL, true),
    (bater_id, 'depth_cm', 'Dybde', 'number', 'cm', NULL, 170, false, NULL, NULL, NULL, true),
    (bater_id, 'weight_kg', 'Vekt', 'number', 'kg', NULL, 180, false, NULL, NULL, NULL, true),
    (bater_id, 'registration_number', 'Registreringsnummer', 'text', NULL, NULL, 190, false, NULL, NULL, NULL, true)
  ON CONFLICT (category_id, key) DO NOTHING;

  INSERT INTO public.category_flows (category_id, steps, modules, field_groups, sort_order)
  VALUES (
    bater_id,
    ARRAY['title-photos','category-details','price-location','review-publish'],
    ARRAY['generic-attributes'],
    ARRAY['boat-facts','category-attributes','title-photos','description-keywords','delivery-location','review-publish'],
    0
  )
  ON CONFLICT (category_id) DO NOTHING;

  UPDATE public.categories SET title_example = 'Askeladden 605 Bowrider 2018 — Yamaha 115 hk'
  WHERE id = bater_id AND title_example IS NULL;
END;
$$;

-- Hold staging→prod-syncen i takt med de nye filter-kolonnene (full
-- funksjonskropp fra baseline + title_example + depends_on_not_value/is_optional).
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
    is_primary, depends_on_key, depends_on_value, depends_on_not_value, is_optional, created_at, updated_at
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
    r->>'depends_on_not_value',
    COALESCE((r->>'is_optional')::BOOLEAN, false),
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
    depends_on_value = EXCLUDED.depends_on_value,
    depends_on_not_value = EXCLUDED.depends_on_not_value,
    is_optional = EXCLUDED.is_optional;

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
