-- "Registreringsnummer" ble tidligere lagt til som en generisk, filtrerbar
-- category_filters-rad på 'bil-og-mc' og 'tilhenger' (se
-- 20260702000000_vehicle_brands_models.sql). Dette gjorde regnr søkbart og
-- redigerbart som et vanlig fritekstfelt — både som søkefilter på
-- landingssiden/kategorisiden (CategoryFilterFields → attributt-filtrering)
-- og som et duplikat fritekstfelt i annonse-veiviseren, ved siden av det
-- dedikerte oppslagsfeltet i VehicleLookupPanel.
--
-- Registreringsnummer skal kun brukes til å hente opplysninger fra Statens
-- vegvesen ved opprettelse av kjøretøy-annonser, aldri som et generisk
-- søke- eller redigeringsfelt. Fjern filteret; VehicleLookupPanel skriver
-- fortsatt attributes.registration_number direkte, uten å gå via
-- category_filters.
DELETE FROM public.category_filters
WHERE key = 'registration_number';
