-- Widen the field_groups constraint to accept the new atomic composer
-- groups (photos/title, delivery/location) alongside the legacy compound
-- ones. Stored rows are NOT rewritten here: application code still reads
-- both formats (normalizeFieldGroupKeys) and writes only the legacy format
-- (toStoredFieldGroupKeys) until every environment runs the app code that
-- understands the atomic keys. Converting stored data is a separate,
-- later migration — doing it here would risk already-deployed app
-- instances reading rows in a format they don't recognize yet.

ALTER TABLE public.category_flows
  DROP CONSTRAINT category_flows_field_groups_required;

ALTER TABLE public.category_flows
  ADD CONSTRAINT category_flows_field_groups_required CHECK (
    (
      field_groups @> ARRAY['category-attributes'::text, 'description-keywords'::text, 'review-publish'::text]
      AND field_groups @> ARRAY['title-photos'::text]
    )
    OR
    (
      field_groups @> ARRAY['category-attributes'::text, 'description-keywords'::text, 'review-publish'::text]
      AND field_groups @> ARRAY['photos'::text, 'title'::text]
    )
  );

COMMENT ON CONSTRAINT category_flows_field_groups_required ON public.category_flows IS
  'Transition constraint: accepts legacy title-photos or atomic photos/title until all environments and drafts are migrated.';
