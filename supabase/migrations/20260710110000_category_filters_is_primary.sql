-- Lar admin velge hvilke per-kategori-filtre som vises direkte i
-- filter-panelet vs. bak "Se flere valg". Default true bevarer dagens
-- oppførsel (alle filtre synlige) for eksisterende rader.
alter table public.category_filters
  add column is_primary boolean not null default true;
