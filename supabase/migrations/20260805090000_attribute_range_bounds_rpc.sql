-- Min/max per numeric attribute key across active listings in a category
-- subtree. Feeds the dynamic slider bounds in the Ønskes kjøpt criteria UI:
-- the slider's scale should reflect what actually exists on Kaupet (e.g. no
-- listings with more than 10 seats => the seats slider tops out at "10+").
-- Only keys whose value is a plain number are considered; date-ish and text
-- attributes are skipped by the numeric regex guard.
CREATE OR REPLACE FUNCTION public.attribute_range_bounds(cat_id uuid)
RETURNS TABLE(key text, min_val numeric, max_val numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE subtree AS (
    SELECT id FROM public.categories WHERE id = cat_id
    UNION ALL
    SELECT c.id FROM public.categories c JOIN subtree s ON c.parent_id = s.id
  )
  SELECT e.key, min((e.value)::numeric), max((e.value)::numeric)
  FROM public.listings l
  CROSS JOIN LATERAL jsonb_each_text(l.attributes) AS e(key, value)
  WHERE l.category_id IN (SELECT id FROM subtree)
    AND l.status = 'active'
    AND e.value ~ '^-?\d+(\.\d+)?$'
  GROUP BY e.key;
$$;
