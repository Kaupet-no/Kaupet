-- Kaupet.no formidler ikke salg av levende dyr (se oppdaterte brukervilkår).
-- Kategorien og underkategoriene her har derfor het som om det handlet om
-- dyrene selv ("Hund", "Katt", …) — de gis navn som gjør det tydelig at det
-- kun er utstyr til kjæledyr som omsettes. Slugs beholdes uendret så
-- eksisterende lenker fortsatt fungerer.
update categories set name_nb = 'Dyreutstyr' where slug = 'dyr-og-utstyr';
update categories set name_nb = 'Utstyr til hund' where slug = 'hund';
update categories set name_nb = 'Utstyr til katt' where slug = 'katt';
update categories set name_nb = 'Utstyr til smådyr' where slug = 'smadyr';
update categories set name_nb = 'Utstyr til fugl og akvarium' where slug = 'fugl-og-akvarium';
update categories set name_nb = 'Utstyr til hest' where slug = 'hest';
