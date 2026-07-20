-- Adds "kjente feil og mangler" / "vedlikeholdshistorikk" fields to listings,
-- used by the Bil og MC description step (description-keywords field group).
alter table public.listings
  add column if not exists known_issues text,
  add column if not exists no_known_issues boolean not null default false,
  add column if not exists maintenance_history text;
