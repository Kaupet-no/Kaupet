-- Utstyrsliste for Bil og MC: seks avkrysningsgrupper (Teknisk,
-- Førerstøttesystemer, Dekk, Lys, Interiør, Annet) brukeren krysser av ved
-- utfylling av annonsen (se vehicle-equipment/index.tsx), som samtidig gjør
-- utstyr søkbart/filtrerbart for kjøpere (samme category_filters-mekanisme
-- som resten av kjøretøyspesifikasjonene). Hver gruppe er sin egen
-- `multiselect`-filter, med options alfabetisk sortert (brukerens opprinnelige
-- rekkefølge var ikke alfabetisk). To åpenbare skrivefeil i det oppgitte
-- utstyrsnavnet er rettet: "Avtagmart tak (automatisk)" -> "Avtagbart tak
-- (automatisk)" (for å matche "Avtagbart tak (manuelt)" rett under), og
-- "Automasik nedblending av fjernlys" -> "Automatisk nedblending av
-- fjernlys".
--
-- Lagt på toppkategorien "Bil og MC" (ikke en spesifikk leaf) slik at alle
-- underkategorier arver filtrene, samme mønster som andre kjøretøyfelt.
INSERT INTO public.category_filters
  (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, 'utstyr_teknisk', 'Teknisk', 'multiselect', NULL,
  '[
    {"value": "abs-bremser", "label_nb": "ABS-bremser"},
    {"value": "alarm", "label_nb": "Alarm"},
    {"value": "antispinn-system-tcs", "label_nb": "Antispinn-system (TCS)"},
    {"value": "automatisk-nedblending-av-fjernlys", "label_nb": "Automatisk nedblending av fjernlys"},
    {"value": "avtagbart-tak-automatisk", "label_nb": "Avtagbart tak (automatisk)"},
    {"value": "avtagbart-tak-manuelt", "label_nb": "Avtagbart tak (manuelt)"},
    {"value": "bakkestartassistent", "label_nb": "Bakkestartassistent"},
    {"value": "dekktrykksensor", "label_nb": "Dekktrykksensor"},
    {"value": "dynamic-chassis-control", "label_nb": "Dynamic chassis control"},
    {"value": "elektrisk-bakluke", "label_nb": "Elektrisk bakluke"},
    {"value": "luftfjaering", "label_nb": "Luftfjæring"},
    {"value": "nokkelfri-sentrallas", "label_nb": "Nøkkelfri sentrallås"},
    {"value": "panoramatak", "label_nb": "Panoramatak"},
    {"value": "regnsensor", "label_nb": "Regnsensor"},
    {"value": "sentrallas", "label_nb": "Sentrallås"},
    {"value": "servostyring", "label_nb": "Servostyring"},
    {"value": "soltak", "label_nb": "Soltak"},
    {"value": "stabilitetskontroll-esp", "label_nb": "Stabilitetskontroll (ESP)"},
    {"value": "start-stopp-system", "label_nb": "Start-stopp-system"},
    {"value": "varmetraader-i-frontrute", "label_nb": "Varmetråder i frontrute"}
  ]'::jsonb,
  900, false
FROM public.categories c
WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL;

INSERT INTO public.category_filters
  (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, 'utstyr_forerstotte', 'Førerstøttesystemer', 'multiselect', NULL,
  '[
    {"value": "adaptiv-cruisecontrol", "label_nb": "Adaptiv cruisecontrol"},
    {"value": "automatisk-identifisering-av-fartsgrense", "label_nb": "Automatisk identifisering av fartsgrense"},
    {"value": "automatisk-nodanrop-ecall", "label_nb": "Automatisk nødanrop/eCall"},
    {"value": "automatisk-nodbrems", "label_nb": "Automatisk nødbrems"},
    {"value": "blindsonevarsel", "label_nb": "Blindsonevarsel"},
    {"value": "cruisecontrol", "label_nb": "Cruisecontrol"},
    {"value": "filbytteassistent", "label_nb": "Filbytteassistent"},
    {"value": "kollisjonsvarsel", "label_nb": "Kollisjonsvarsel"},
    {"value": "night-vision", "label_nb": "Night vision"},
    {"value": "tretthetsvarsler", "label_nb": "Tretthetsvarsler"}
  ]'::jsonb,
  901, false
FROM public.categories c
WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL;

INSERT INTO public.category_filters
  (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, 'utstyr_dekk', 'Dekk', 'multiselect', NULL,
  '[
    {"value": "dekkreparasjonssett", "label_nb": "Dekkreparasjonssett"},
    {"value": "helaarsdekk", "label_nb": "Helårsdekk"},
    {"value": "reservedekk", "label_nb": "Reservedekk"},
    {"value": "sommerdekk", "label_nb": "Sommerdekk"},
    {"value": "vinterdekk", "label_nb": "Vinterdekk"}
  ]'::jsonb,
  902, false
FROM public.categories c
WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL;

INSERT INTO public.category_filters
  (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, 'utstyr_lys', 'Lys', 'multiselect', NULL,
  '[
    {"value": "adaptive-lykter", "label_nb": "Adaptive lykter"},
    {"value": "automatiske-hovedlys", "label_nb": "Automatiske hovedlys"},
    {"value": "fjernlys-med-autoblendesystem-matrix", "label_nb": "Fjernlys med autoblendesystem (Matrix)"},
    {"value": "hovedlys-med-halogen", "label_nb": "Hovedlys med Halogen"},
    {"value": "hovedlys-med-laser", "label_nb": "Hovedlys med Laser"},
    {"value": "hovedlys-med-led", "label_nb": "Hovedlys med LED"},
    {"value": "hovedlys-med-xenon", "label_nb": "Hovedlys med Xenon"},
    {"value": "lyktespylere", "label_nb": "Lyktespylere"},
    {"value": "taakelys", "label_nb": "Tåkelys"}
  ]'::jsonb,
  903, false
FROM public.categories c
WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL;

INSERT INTO public.category_filters
  (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, 'utstyr_interior', 'Interiør', 'multiselect', NULL,
  '[
    {"value": "android-auto", "label_nb": "Android Auto"},
    {"value": "apple-carplay", "label_nb": "Apple CarPlay"},
    {"value": "bluetooth", "label_nb": "Bluetooth"},
    {"value": "cd-spiller", "label_nb": "CD-spiller"},
    {"value": "dab-radio", "label_nb": "DAB-radio"},
    {"value": "digitale-sidespeil", "label_nb": "Digitale sidespeil"},
    {"value": "elektrisk-setejustering-av-baksete", "label_nb": "Elektrisk setejustering av baksete"},
    {"value": "elektrisk-setejustering-av-forsete", "label_nb": "Elektrisk setejustering av forsete"},
    {"value": "fjernstyrt-aktivering-av-varme-kjoling", "label_nb": "Fjernstyrt aktivering av varme/kjøling"},
    {"value": "head-up-display-hud", "label_nb": "Head-up display (HUD)"},
    {"value": "haandfri-telefoni", "label_nb": "Håndfri telefoni"},
    {"value": "integrert-musikkstreaming", "label_nb": "Integrert musikkstreaming"},
    {"value": "integrert-navigasjonssystem", "label_nb": "Integrert navigasjonssystem"},
    {"value": "integrert-skipose", "label_nb": "Integrert skipose"},
    {"value": "integrert-tv", "label_nb": "Integrert TV"},
    {"value": "integrert-wlan-wifi-hotspot", "label_nb": "Integrert WLAN/WiFi-hotspot"},
    {"value": "isofix", "label_nb": "ISOFIX"},
    {"value": "massasje-i-bakseter", "label_nb": "Massasje i bakseter"},
    {"value": "massasje-i-forseter", "label_nb": "Massasje i forseter"},
    {"value": "minnelagring-av-seteposisjon", "label_nb": "Minnelagring av seteposisjon"},
    {"value": "sportsseter", "label_nb": "Sportsseter"},
    {"value": "stemmestyring-av-kjoretoysfunksjoner", "label_nb": "Stemmestyring av kjøretøysfunksjoner"},
    {"value": "tradlos-lader-for-mobiltelefon", "label_nb": "Trådløs-lader for mobiltelefon"},
    {"value": "varme-i-bakseter", "label_nb": "Varme i bakseter"},
    {"value": "varme-i-forseter", "label_nb": "Varme i forseter"},
    {"value": "ventilasjon-i-bakseter", "label_nb": "Ventilasjon i bakseter"},
    {"value": "ventilasjon-i-forseter", "label_nb": "Ventilasjon i forseter"}
  ]'::jsonb,
  904, false
FROM public.categories c
WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL;

INSERT INTO public.category_filters
  (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, 'utstyr_annet', 'Annet', 'multiselect', NULL,
  '[
    {"value": "takstativ", "label_nb": "Takstativ"}
  ]'::jsonb,
  905, false
FROM public.categories c
WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL;

-- Legger "vehicle-equipment" (Utstyr-seksjonen) inn i flyten, rett etter
-- description-keywords — de to deler samme side (se ny-annonse.tsx' force-
-- break-sett), slik at Utstyr vises rett under Beskrivelse-feltet i stedet
-- for som et eget steg.
UPDATE public.category_flows
SET field_groups = '{vehicle-registration,category-attributes,title-photos,vehicle-facts,vehicle-condition,description-keywords,vehicle-equipment,delivery-location,review-publish}'
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL);
