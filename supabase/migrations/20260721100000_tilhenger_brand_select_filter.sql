-- Tilhenger (tilhenger-leaf) never got a `brand` category_filters row seeded
-- (see 20260701100000_full_category_taxonomy.sql — it only got max_load_kg),
-- so the later UPDATE in 20260702000000_vehicle_brands_models.sql that
-- converts brand -> brand_select for vehicle leaves matched zero rows for
-- it. Without a brand_select filter, vehicleCategoryGroupFor() returns null
-- for Tilhenger, so isVehicle is false and all the Bil og MC wizard
-- treatment (locked category/title, vehicle Tilstand options, no "gis bort
-- gratis", feil/mangler + vedlikeholdshistorikk on beskrivelse) silently
-- didn't apply to trailer listings.
insert into public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
select c.id, 'brand', 'Merke', 'brand_select', 'henger', null, 1
from public.categories c
where c.slug = 'tilhenger-leaf'
  and not exists (
    select 1 from public.category_filters cf where cf.category_id = c.id and cf.key = 'brand'
  );

-- Keep max_load_kg after brand/model in display order.
update public.category_filters cf
set sort_order = 3
from public.categories c
where cf.category_id = c.id and c.slug = 'tilhenger-leaf' and cf.key = 'max_load_kg';
