-- Fase 2.2A ("søk forstår utstyr/attributter i fritekst"): en fraseordbok
-- som knytter naturlig norsk tekst (f.eks. "ryggekamera") til en konkret
-- category_filters-verdi (f.eks. utstyr_forerstotte -> "ryggekamera"), slik
-- at et fritekstsøk kan tolkes som et strukturert attributtfilter i stedet
-- for å bare lete i listings.search_vector (tittel/beskrivelse), der utstyr
-- sjelden står nevnt ordrett.
--
-- Seedes generert (is_generated = true) fra hver select/multiselect-filters
-- options.label_nb, som allerede er den naturlige norske frasen for verdien
-- (case-insensitive match via lower()). Boolean-filtre seedes fra
-- filterets eget label_nb (verdien er implisitt "true" -- option_value NULL
-- er sentinel for "denne booleanen selv", ikke en options-verdi).
-- Manuelt lagte synonymer (is_generated = false) legges til separat via
-- admin-UI etter hvert som search_query_stats viser hvilke fraser folk
-- faktisk skriver (se 20260731130000_search_query_stats.sql).
CREATE TABLE public.filter_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_filter_id UUID NOT NULL REFERENCES public.category_filters(id) ON DELETE CASCADE,
  -- NULL means "the boolean filter itself" (type = 'boolean'); otherwise
  -- matches one of category_filters.options[].value for select/multiselect.
  option_value TEXT,
  phrase TEXT NOT NULL,
  is_generated BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_filter_id, option_value, phrase)
);
CREATE INDEX filter_synonyms_phrase_idx ON public.filter_synonyms(phrase);
CREATE INDEX filter_synonyms_filter_idx ON public.filter_synonyms(category_filter_id);

GRANT SELECT ON public.filter_synonyms TO anon, authenticated;
GRANT ALL ON public.filter_synonyms TO service_role;
ALTER TABLE public.filter_synonyms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Filter synonyms are viewable by everyone"
  ON public.filter_synonyms FOR SELECT USING (true);

-- Admin CRUD, mirrors category_filters' own policies so the admin UI can
-- manage synonyms client-side with the user-scoped Supabase client.
CREATE POLICY "Admins can insert filter synonyms"
  ON public.filter_synonyms FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update filter synonyms"
  ON public.filter_synonyms FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete filter synonyms"
  ON public.filter_synonyms FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT INSERT, UPDATE, DELETE ON public.filter_synonyms TO authenticated;

-- Seed: one row per existing select/multiselect option, keyed by its own
-- label_nb (lowercased) as the baseline phrase.
INSERT INTO public.filter_synonyms (category_filter_id, option_value, phrase, is_generated)
SELECT cf.id, opt->>'value', lower(opt->>'label_nb'), true
FROM public.category_filters cf
CROSS JOIN LATERAL jsonb_array_elements(cf.options) opt
WHERE cf.type IN ('select', 'multiselect')
  AND cf.options IS NOT NULL
ON CONFLICT (category_filter_id, option_value, phrase) DO NOTHING;

-- Seed: one row per boolean filter, keyed by its own label_nb.
INSERT INTO public.filter_synonyms (category_filter_id, option_value, phrase, is_generated)
SELECT cf.id, NULL, lower(cf.label_nb), true
FROM public.category_filters cf
WHERE cf.type = 'boolean'
ON CONFLICT (category_filter_id, option_value, phrase) DO NOTHING;
