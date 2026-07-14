-- Per-category listing-creation flow configuration. A row declares the ordered
-- steps and the category-detail modules (see src/features/listing-creation/)
-- used when creating a listing in that category. Inherited from the parent
-- category the same way category_filters is (a child row overrides its
-- parent's steps/modules wholesale). Categories with no row (and no ancestor
-- with a row) fall back to the default flow in code.

CREATE TABLE public.category_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  steps TEXT[] NOT NULL DEFAULT '{title-photos,category-details,price-location,review-publish}',
  modules TEXT[] NOT NULL DEFAULT '{generic-attributes}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id)
);
CREATE INDEX category_flows_category_idx ON public.category_flows(category_id);

GRANT SELECT ON public.category_flows TO anon, authenticated;
GRANT ALL ON public.category_flows TO service_role;
ALTER TABLE public.category_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Category flows are viewable by everyone"
  ON public.category_flows FOR SELECT USING (true);

-- Admin CRUD policies (mirrors public.category_filters).
CREATE POLICY "Admins can insert category flows"
  ON public.category_flows FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update category flows"
  ON public.category_flows FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete category flows"
  ON public.category_flows FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT INSERT, UPDATE, DELETE ON public.category_flows TO authenticated;
