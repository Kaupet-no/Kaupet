-- Makes listings.condition and listings.can_ship genuinely optional (not just
-- hidden behind a default value), so a category's flow can omit the
-- "condition" or "delivery-location" field groups entirely once admin
-- toggling exists (see category_flows.field_groups). No backfill needed —
-- every existing row already has a concrete value for both columns.
alter table public.listings alter column condition drop not null;
alter table public.listings alter column condition drop default;
alter table public.listings alter column can_ship drop not null;
alter table public.listings alter column can_ship drop default;
