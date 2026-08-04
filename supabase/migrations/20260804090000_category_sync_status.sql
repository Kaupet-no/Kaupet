-- Staging -> produksjon-synk for kategori-data (kategorier, rekkefølge,
-- ikon, farge, søkeeksempler, filtre, flows, filter-synonymer). Staging er
-- den redigerbare kilden; produksjon får en "Synkroniser fra staging"-knapp
-- i admin-panelet som leser fra staging med service-role og erstatter
-- produksjonens data.
--
-- Denne migrasjonen legger til:
-- 1. updated_at-kolonne + BEFORE UPDATE-trigger på categories,
--    category_filters, category_flows og filter_synonyms, slik at
--    synk-statusen kan avgjøre om staging har endringer nyere enn siste
--    synk (categories har fra før kun created_at).
-- 2. Singleton-tabellen category_sync_status som holder styr på når
--    produksjon sist ble synkronisert (kun meningsfull i produksjons-
--    databasen, men opprettes likt begge steder via vanlig migrasjonsflyt).
-- 3. RPC-funksjonen sync_categories_from_payload som gjør full erstatning
--    av kategori-relatert data i én transaksjon, kalt fra produksjonens
--    service-role klient med et JSON-øyeblikksbilde hentet fra staging.

-- 1a. updated_at-kolonner
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.category_filters ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.category_flows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.filter_synonyms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 1b. triggere (gjenbruker public.set_updated_at() fra 20260604073224_...sql)
DROP TRIGGER IF EXISTS categories_set_updated_at ON public.categories;
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS category_filters_set_updated_at ON public.category_filters;
CREATE TRIGGER category_filters_set_updated_at BEFORE UPDATE ON public.category_filters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS category_flows_set_updated_at ON public.category_flows;
CREATE TRIGGER category_flows_set_updated_at BEFORE UPDATE ON public.category_flows FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS filter_synonyms_set_updated_at ON public.filter_synonyms;
CREATE TRIGGER filter_synonyms_set_updated_at BEFORE UPDATE ON public.filter_synonyms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. category_sync_status (singleton, mønster fra public.site_settings)
CREATE TABLE public.category_sync_status (
  id boolean PRIMARY KEY DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_synced_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT category_sync_status_singleton CHECK (id)
);
INSERT INTO public.category_sync_status (id) VALUES (true);

ALTER TABLE public.category_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view category sync status"
  ON public.category_sync_status FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.category_sync_status TO authenticated;
GRANT ALL ON public.category_sync_status TO service_role;
-- Ingen INSERT/UPDATE/DELETE-grant til authenticated: raden oppdateres kun
-- av syncCategoriesFromStaging via service-role (server-only).

-- 3. RPC: full erstatning av kategori-relatert data i produksjon, i én
-- transaksjon. SECURITY DEFINER slik at den kan kalles av service_role uten
-- å måtte omgå RLS tabell for tabell; kalleren (category-sync.server.ts) er
-- allerede admin-gatet før RPC-en kalles.
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
  -- Barn-tabeller først (FK mot categories/category_filters).
  DELETE FROM public.filter_synonyms;
  DELETE FROM public.category_flows;
  DELETE FROM public.category_filters;
  DELETE FROM public.categories;

  -- Kategorier settes inn uten parent_id først (selv-referanse), så
  -- parent_id oppdateres i et andre pass når alle id-er finnes.
  INSERT INTO public.categories (
    id, slug, name_nb, parent_id, sort_order, icon, color, heading_font,
    search_examples, is_hidden, created_at, updated_at
  )
  SELECT
    (r->>'id')::UUID,
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
  FROM jsonb_array_elements(p_categories) r;

  UPDATE public.categories c
  SET parent_id = (r->>'parent_id')::UUID
  FROM jsonb_array_elements(p_categories) r
  WHERE c.id = (r->>'id')::UUID AND r->>'parent_id' IS NOT NULL;

  INSERT INTO public.category_filters (
    id, category_id, key, label_nb, type, unit, options, sort_order,
    is_primary, depends_on_key, depends_on_value, created_at, updated_at
  )
  SELECT
    (r->>'id')::UUID,
    (r->>'category_id')::UUID,
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
  FROM jsonb_array_elements(p_category_filters) r;

  INSERT INTO public.category_flows (
    id, category_id, steps, modules, field_groups, sort_order, created_at, updated_at
  )
  SELECT
    (r->>'id')::UUID,
    (r->>'category_id')::UUID,
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'steps') x), '{}'),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'modules') x), '{}'),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'field_groups') x), '{}'),
    (r->>'sort_order')::INT,
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_category_flows) r;

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
