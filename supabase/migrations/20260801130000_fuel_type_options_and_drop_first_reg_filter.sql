-- 1. Utvider Drivstoff-valgene (key = 'fuel_type', label 'Drivstoff' — ikke
--    'grill'-kategoriens 'Brenseltype', som har sitt eget sett) med Hydrogen,
--    Gass (CNG) og Etanol (E85), og deler "Hybrid" i to: bensin-hybrid og
--    diesel-hybrid, som er reelt forskjellige kjøretøy.
--
--    Eksisterende annonser med attributes.fuel_type = 'hybrid' matcher ikke
--    lenger noen av de nye valgene og vises som uspesifisert Drivstoff til
--    selger retter det opp — samme mønster som fargevalg-migrasjonen
--    (20260722100000_vehicle_color_select_options.sql), det finnes ingen
--    pålitelig måte å gjette bensin- eller dieselhybrid fra den gamle verdien.
UPDATE public.category_filters
SET options = '[
      {"value": "bensin", "label_nb": "Bensin"},
      {"value": "diesel", "label_nb": "Diesel"},
      {"value": "el", "label_nb": "El"},
      {"value": "hybrid_bensin", "label_nb": "Hybrid (bensin + el)"},
      {"value": "hybrid_diesel", "label_nb": "Hybrid (diesel + el)"},
      {"value": "hydrogen", "label_nb": "Hydrogen"},
      {"value": "gass_cng", "label_nb": "Gass (CNG)"},
      {"value": "etanol_e85", "label_nb": "Etanol (E85)"}
    ]'::jsonb
WHERE key = 'fuel_type' AND label_nb = 'Drivstoff';

-- 2. Fjerner Førstegangsregistrering fra filtervalgene — det er i praksis
--    samme tall som Årsmodell (year), og har ligget som et eget filter siden
--    20260729130000_first_registration_year_numeric.sql konverterte det til
--    et numerisk år. attributes.first_registration_date/_year på annonsene
--    beholdes uendret (brukes fortsatt på annonsesiden og til
--    omregistreringsavgift) — bare selve filter-raden fjernes.
--    filter_synonyms for dette filteret kaskaderer med (ON DELETE CASCADE).
DELETE FROM public.category_filters WHERE key = 'first_registration_year';
