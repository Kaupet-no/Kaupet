-- Enforces at the database level that a category_flows row always includes
-- the field groups the admin UI treats as non-removable (title-photos,
-- category-attributes, description-keywords, review-publish), since an
-- admin could in principle write to this table directly (RLS allows
-- admin INSERT/UPDATE) and bypass the UI's disabled checkboxes.
alter table public.category_flows
  add constraint category_flows_field_groups_required
  check (field_groups @> array['title-photos','category-attributes','description-keywords','review-publish']::text[]);
