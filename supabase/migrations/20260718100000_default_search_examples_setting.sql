-- Singleton settings row holding the default example search words shown in
-- the landing page's rotating search-field typewriter animation before any
-- category is selected (previously hardcoded in src/lib/search-suggestions.ts).
CREATE TABLE public.site_settings (
  id boolean PRIMARY KEY DEFAULT true,
  default_search_examples TEXT[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_singleton CHECK (id)
);

INSERT INTO public.site_settings (id, default_search_examples) VALUES (
  true,
  ARRAY[
    'sykkel', 'sofa', 'iPhone', 'kommode', 'vannski', 'barnevogn', 'stuebord',
    'kjøleskap', 'klokke', 'PlayStation', 'pulsklokke', 'bokhylle', 'TV',
    'kontorstol', 'hengekøye', 'fiskestang', 'sommerkjole'
  ]
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Site settings are viewable by everyone"
  ON public.site_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can update site settings"
  ON public.site_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT UPDATE ON public.site_settings TO authenticated;
