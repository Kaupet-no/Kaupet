-- Expand legacy compound composer groups while keeping the transition
-- constraint compatible with older app versions and saved admin sessions.

ALTER TABLE public.category_flows
  DROP CONSTRAINT category_flows_field_groups_required;

UPDATE public.category_flows AS flow
SET field_groups = ARRAY(
  SELECT expanded.key
  FROM unnest(flow.field_groups) WITH ORDINALITY AS source(key, source_order)
  CROSS JOIN LATERAL unnest(
    CASE source.key
      WHEN 'title-photos' THEN ARRAY['photos', 'title']
      WHEN 'delivery-location' THEN ARRAY['delivery', 'location']
      ELSE ARRAY[source.key]
    END
  ) WITH ORDINALITY AS expanded(key, expanded_order)
  ORDER BY source.source_order, expanded.expanded_order
)
WHERE field_groups && ARRAY['title-photos', 'delivery-location'];

ALTER TABLE public.category_flows
  ALTER COLUMN field_groups SET DEFAULT
    '{photos,title,category-attributes,condition,price,description-keywords,delivery,location,review-publish}'::text[],
  ADD CONSTRAINT category_flows_field_groups_required CHECK (
    field_groups @> ARRAY[
      'category-attributes'::text,
      'description-keywords'::text,
      'review-publish'::text
    ]
    AND (
      field_groups @> ARRAY['title-photos'::text]
      OR field_groups @> ARRAY['photos'::text, 'title'::text]
    )
  );

COMMENT ON CONSTRAINT category_flows_field_groups_required ON public.category_flows IS
  'Transition constraint: accepts legacy title-photos or atomic photos/title until all environments and drafts are migrated.';
