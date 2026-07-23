-- 20260722120000_bil_og_mc_category_restructure.sql split "Deler og tilbehør"
-- out of the "Bil og MC" tree into its own root category "Bildeler og
-- tilbehør", copying color from the old row. But that old row was a level-2
-- child, which never had a color (only root categories carry one) — so the
-- new root landed with color = NULL. The landing page only shows root
-- categories that have a color set (src/routes/index.tsx), so "Bildeler og
-- tilbehør" silently disappeared from the front page category overview.
UPDATE public.categories
SET color = 'oklch(0.55 0.06 260)', icon = COALESCE(icon, 'Car')
WHERE slug = 'bildeler-og-tilbehor' AND parent_id IS NULL;
