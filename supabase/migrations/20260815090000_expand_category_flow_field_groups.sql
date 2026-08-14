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

-- Vehicle cards have an intentional semantic order independent of the
-- historic admin order: facts, free-text description, structured condition,
-- then optional equipment.
WITH vehicle_flows AS (
  SELECT
    id,
    field_groups,
    array_remove(
      array_remove(
        array_remove(field_groups, 'description-keywords'),
        'vehicle-condition'
      ),
      'vehicle-equipment'
    ) AS base_groups
  FROM public.category_flows
  WHERE field_groups @> ARRAY['vehicle-registration', 'vehicle-facts']::text[]
), reordered AS (
  SELECT
    id,
    COALESCE(
      base_groups[1:array_position(base_groups, 'vehicle-facts')],
      ARRAY[]::text[]
    )
      || CASE WHEN 'description-keywords' = ANY(field_groups)
        THEN ARRAY['description-keywords']::text[] ELSE ARRAY[]::text[] END
      || CASE WHEN 'vehicle-condition' = ANY(field_groups)
        THEN ARRAY['vehicle-condition']::text[] ELSE ARRAY[]::text[] END
      || CASE WHEN 'vehicle-equipment' = ANY(field_groups)
        THEN ARRAY['vehicle-equipment']::text[] ELSE ARRAY[]::text[] END
      || COALESCE(
        base_groups[
          array_position(base_groups, 'vehicle-facts') + 1:cardinality(base_groups)
        ],
        ARRAY[]::text[]
      )
      AS field_groups
  FROM vehicle_flows
)
UPDATE public.category_flows AS flow
SET field_groups = reordered.field_groups
FROM reordered
WHERE flow.id = reordered.id;

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
