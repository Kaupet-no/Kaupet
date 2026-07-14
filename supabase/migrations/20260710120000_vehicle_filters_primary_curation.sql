-- Kurerer hvilke kjøretøy-filtre som vises direkte i filter-panelet (Mobile.
-- de-mønster: merke, modell, årsmodell, kilometerstand foran) vs. bak "Se
-- flere valg" (drivstoff, girkasse, registrering, effekt osv.). Kolonnen
-- is_primary ble lagt til med default true for alle rader (se
-- 20260710110000_category_filters_is_primary.sql), så uten dette kuraterte
-- oppsettet vises alle kjøretøy-felt om hverandre i panelet.

UPDATE public.category_filters cf
SET is_primary = false
FROM public.categories c
WHERE cf.category_id = c.id
  AND c.slug IN (
    'bil-og-mc',
    'personbil',
    'varebil',
    'bobil-og-campingvogn',
    'motorsykkel',
    'moped-og-scooter',
    'atv-og-snoscooter',
    'tilhenger',
    'tilhenger-leaf'
  )
  AND cf.key NOT IN ('brand', 'model', 'year', 'mileage_km');

UPDATE public.category_filters cf
SET is_primary = true
FROM public.categories c
WHERE cf.category_id = c.id
  AND c.slug IN (
    'personbil',
    'varebil',
    'bobil-og-campingvogn',
    'motorsykkel',
    'moped-og-scooter',
    'atv-og-snoscooter',
    'tilhenger-leaf'
  )
  AND cf.key IN ('brand', 'model', 'year', 'mileage_km');
