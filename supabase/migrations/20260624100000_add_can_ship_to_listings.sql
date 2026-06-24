alter table listings
  add column if not exists can_ship boolean not null default false;
