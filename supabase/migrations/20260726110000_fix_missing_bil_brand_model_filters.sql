-- Produksjon manglet 'brand'/'model'-filtrene (brand_select/model_select) for
-- Bil-kategorien (Bil og MC > Bil) — de ble på et tidspunkt satt opp via
-- admin-kategoripanelet (som skriver direkte mot databasen, ikke via
-- migrasjoner) og ble derfor aldri replikert fra staging til produksjon.
-- Uten disse evaluerer isVehicleCategory() til false for Bil, og hele
-- kjøretøy-annonseflyten (vehicle-registration/vehicle-confirm/
-- vehicle-facts/vehicle-condition/vehicle-equipment) faller tilbake til det
-- gamle, flate "Egenskaper"-steget som viser alle category_filters
-- (avgiftskode + alle utstyrsgruppene) samlet i én uoversiktlig liste.
--
-- Idempotent (WHERE NOT EXISTS) slik at den er trygg å kjøre mot staging
-- også, der radene allerede finnes.

INSERT INTO public.category_filters
  (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, 'brand', 'Merke', 'brand_select', 'bil', NULL, 10, true
FROM public.categories c
WHERE c.slug = 'bil'
  AND c.parent_id IN (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.category_filters cf WHERE cf.category_id = c.id AND cf.key = 'brand'
  );

INSERT INTO public.category_filters
  (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, 'model', 'Modell', 'model_select', NULL, NULL, 20, true
FROM public.categories c
WHERE c.slug = 'bil'
  AND c.parent_id IN (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.category_filters cf WHERE cf.category_id = c.id AND cf.key = 'model'
  );
