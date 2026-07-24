-- Generic conditional-visibility support for category_filters: a filter can
-- declare it should only be shown (and only required) when another filter on
-- the same category already has a given value. First use case: Bilsport's
-- "Gren"/"Klasse" fields should only appear once "Er bilen lisensiert?" is
-- answered "ja" (see AttributeFields / getMissingRequiredFilters).
ALTER TABLE public.category_filters
  ADD COLUMN depends_on_key text,
  ADD COLUMN depends_on_value text;
