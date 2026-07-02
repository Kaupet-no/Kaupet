-- Per-category example search words shown in the landing page's rotating
-- search-field typewriter animation when that category is selected, in
-- place of the raw subcategory names. Applies at any depth, since the user
-- can drill into any level.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS search_examples TEXT[] NOT NULL DEFAULT '{}';
