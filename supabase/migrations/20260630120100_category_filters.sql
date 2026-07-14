-- Per-category configurable filters (attributes). A filter belongs to a category
-- (usually a subcategory, e.g. "TV og lyd") and describes a property buyers/sellers
-- care about for that kind of item (e.g. screen size in inches, screen technology).
-- The effective filters for a listing = filters on its category + filters inherited
-- from its parent category.

CREATE TABLE public.category_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  key TEXT NOT NULL,              -- machine name, used as a key in listings.attributes (e.g. "tv_size_inch")
  label_nb TEXT NOT NULL,         -- display label (e.g. "Skjermstørrelse")
  type TEXT NOT NULL CHECK (type IN ('select', 'multiselect', 'number', 'range', 'boolean', 'text')),
  unit TEXT,                      -- optional unit suffix (e.g. "tommer", "km")
  options JSONB,                  -- for select/multiselect: [{ "value": "oled", "label_nb": "OLED" }]
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, key)
);
CREATE INDEX category_filters_category_idx ON public.category_filters(category_id, sort_order);

GRANT SELECT ON public.category_filters TO anon, authenticated;
GRANT ALL ON public.category_filters TO service_role;
ALTER TABLE public.category_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Category filters are viewable by everyone"
  ON public.category_filters FOR SELECT USING (true);

-- Admin CRUD policies (mirrors public.categories), so the admin UI can manage
-- filters client-side with the user-scoped Supabase client.
CREATE POLICY "Admins can insert category filters"
  ON public.category_filters FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update category filters"
  ON public.category_filters FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete category filters"
  ON public.category_filters FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT INSERT, UPDATE, DELETE ON public.category_filters TO authenticated;
