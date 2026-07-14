-- Replaces the 4 "canonical step" ids with the finer-grained field-group
-- model (see src/features/listing-creation/field-groups/): an ordered,
-- reorderable, togglable list of field groups per category, resolved with
-- the same nearest-ancestor-wins inheritance as `modules`.
--
-- No data-dependent backfill is needed: the only row that has ever existed
-- (bil-og-mc, see 20260702130000_bil_og_mc_category_flow.sql) only ever set
-- `modules`, never `steps` — the new column's default already matches every
-- existing row's effective step content/order.
--
-- `steps` is kept for one release as a safe rollback window rather than
-- dropped in the same migration; a follow-up migration removes it once
-- field_groups is confirmed working in every environment.

ALTER TABLE public.category_flows
  ADD COLUMN field_groups TEXT[] NOT NULL DEFAULT
    '{title-photos,category-attributes,condition,price,description-keywords,delivery-location,review-publish}';
