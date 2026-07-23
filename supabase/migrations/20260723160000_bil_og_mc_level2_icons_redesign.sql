-- Redesigner ikonene under "Bil og MC" (nivå 2) slik at hver kategori har et
-- gjenkjennelig kjøretøyikon i stedet for de generiske plassholderne satt i
-- 20260723100000_category_level2_icons.sql:
--   - Bil får samme ikon som hovedkategorien "Bil og MC" (Car).
--   - Det gamle Caravan-ikonet (som ser ut som en campingvogn) flyttes fra
--     Bobil til Campingvogn, der det faktisk hører hjemme.
--   - Bobil, MC og moped, ATV, Snøscooter og Anleggsmaskiner bruker Lucides
--     egne Van/Motorbike/Mountain/MountainSnow/Forklift-ikoner.
--   - Tilhenger bruker et håndbygd ikon (UtilityTrailer, se
--     src/lib/category-icons.ts) siden Lucide ikke har noe ikon for en liten,
--     personbil-trukket tilhenger.
update categories set icon = case slug
  when 'bil' then 'Car'
  when 'bobil' then 'Van'
  when 'campingvogn' then 'Caravan'
  when 'mc-og-moped' then 'Motorbike'
  when 'atv' then 'Mountain'
  when 'snoscooter' then 'MountainSnow'
  when 'tilhenger' then 'UtilityTrailer'
  when 'anleggsmaskiner' then 'Forklift'
  else icon
end
where parent_id is not null
  and slug in (
    'bil', 'bobil', 'campingvogn', 'mc-og-moped', 'atv', 'snoscooter', 'tilhenger', 'anleggsmaskiner'
  );
