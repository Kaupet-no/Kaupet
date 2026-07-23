-- Hesteansikt-ikonet viste seg vanskelig å gjøre gjenkjennelig i 24x24 —
-- bytter til en salsilhuett (se src/lib/category-icons.ts) som er et mer
-- entydig symbol for hesteutstyr.
update categories set icon = 'Saddle' where slug = 'hest';
