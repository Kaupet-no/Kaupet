-- "Utstyr til hest" hadde et generisk hovavtrykk-ikon (Footprints) — bytter
-- til et faktisk hesteikon (se src/lib/category-icons.ts).
update categories set icon = 'Horse' where slug = 'hest';
