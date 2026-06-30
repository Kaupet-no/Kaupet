-- Admin-configurable heading font for main categories, used on the landing
-- page's category heading. Stores a fixed token (see CATEGORY_HEADING_FONTS
-- in src/lib/category-fonts.ts), not free CSS, so it always resolves to a
-- font already loaded by the app.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS heading_font TEXT;
