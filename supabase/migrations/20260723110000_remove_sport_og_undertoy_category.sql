-- Fjerner "Sport og undertøy" (under Klær og mote) og begge underkategoriene
-- ("Undertøy og badetøy", "Treningsklær") — ingen annonser er knyttet til
-- noen av dem, så dette er en ren opprydding, ikke en migrering av data.
delete from category_filters
where category_id in (
  select id from categories
  where slug in ('sport-og-undertoy', 'undertoy-og-badetoy', 'treningsklaer')
);

delete from categories
where slug in ('undertoy-og-badetoy', 'treningsklaer');

delete from categories
where slug = 'sport-og-undertoy';
