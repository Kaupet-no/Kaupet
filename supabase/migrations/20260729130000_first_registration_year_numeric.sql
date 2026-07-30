-- Gjør Førstegangsregistrering søkbar som tall.
--
-- Feltet var et 'text'-filter med hele ISO-datoen fra Statens vegvesen
-- ("2018-05-14") som verdi, så søk på det kunne bare gjøres som
-- delstreng-treff (ilike) — ikke fra–til. Her konverteres selve *filteret* til
-- et numerisk år ('first_registration_year', type 'range'), som er det
-- søkebehovet faktisk er: "registrert mellom 2015 og 2020".
--
-- Den eksakte datoen beholdes i attributes.first_registration_date. Den vises
-- på annonsesiden (1. gang registrert) og brukes til å beregne
-- omregistreringsavgift, og for et manuelt registrert kjøretøy finnes den
-- ingen andre steder — å kaste den for å spare en nøkkel ville vært et tap.
-- Året skrives ved siden av, avledet fra datoen (se confirmVehicleData).

-- 1. Etterfyll året fra datoen som allerede ligger i attributes.
--    substring(... from '\d{4}') plukker årstallet uansett om datoen er
--    lagret som "2018-05-14" eller "14.05.2018".
UPDATE public.listings
SET attributes = attributes || jsonb_build_object(
      'first_registration_year',
      to_jsonb((substring(attributes->>'first_registration_date' from '\d{4}'))::int)
    )
WHERE attributes->>'first_registration_date' ~ '\d{4}'
  AND NOT attributes ? 'first_registration_year';

UPDATE public.wtb_listings
SET attributes = attributes || jsonb_build_object(
      'first_registration_year',
      to_jsonb((substring(attributes->>'first_registration_date' from '\d{4}'))::int)
    )
WHERE attributes->>'first_registration_date' ~ '\d{4}'
  AND NOT attributes ? 'first_registration_year';

-- 2. Etterfyll fra det lagrede Vegvesen-oppslaget for annonser som har
--    oppslaget, men ikke rakk å få datoen kopiert ut i attributes.
--    attributes.vehicle_lookup er en JSON-streng (JSON.stringify(lookup)).
UPDATE public.listings
SET attributes = attributes || jsonb_build_object(
      'first_registration_year',
      to_jsonb(
        (substring(
          (attributes->>'vehicle_lookup')::jsonb->>'first_registration_date' from '\d{4}'
        ))::int
      )
    )
WHERE NOT attributes ? 'first_registration_year'
  AND attributes ? 'vehicle_lookup'
  AND jsonb_typeof(attributes->'vehicle_lookup') = 'string'
  AND (attributes->>'vehicle_lookup') ~ '^\s*[{[]'
  AND (attributes->>'vehicle_lookup')::jsonb->>'first_registration_date' ~ '\d{4}';

-- 3. Konverter filter-radene. Beholder category_id og sort_order, så feltet
--    ligger på samme plass i rekkefølgen som før — nå som fra–til-slider.
--    is_primary settes slik at det blir liggende i den alltid synlige
--    filter-raden på søkeresultatsiden sammen med Merke/Modell/Drivstoff.
UPDATE public.category_filters
SET key = 'first_registration_year',
    label_nb = 'Førstegangsregistrering',
    type = 'range',
    unit = NULL,
    is_primary = true
WHERE key = 'first_registration_date';
