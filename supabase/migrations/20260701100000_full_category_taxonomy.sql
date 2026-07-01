-- Replace all existing subcategories (level 2 and level 3) under every one of
-- the 10 main categories with a full, curated taxonomy plus per-leaf filters,
-- inspired by established retailers/marketplaces (Elkjøp/Komplett, Zalando,
-- IKEA, Biltema/Jula, XXL, Zooplus, Finn.no, Babyshop). This supersedes the
-- partial demo added in 20260701090000_category_level3_and_filters.sql, which
-- only covered "Klær og mote" and "Elektronikk".
--
-- Listings pointing at a category being removed here are first reassigned to
-- the relevant main category (so they are not silently orphaned by the
-- listings.category_id ON DELETE SET NULL behavior), then the old category
-- rows (and their cascaded category_filters) are deleted, then the new tree
-- is inserted.

-- 1. Reassign listings from any non-main category to their main category
--    before we delete the old subtree.
UPDATE public.listings l
SET category_id = m.id
FROM public.categories c
JOIN public.categories m ON m.slug IN (
  'elektronikk', 'interior', 'hus-og-hage', 'klar-og-mote', 'sport',
  'dyr-og-utstyr', 'bil-og-mc', 'kunst', 'barn-og-baby', 'bat'
) AND m.parent_id IS NULL
WHERE l.category_id = c.id
  AND c.parent_id IS NOT NULL
  AND (
    c.parent_id = m.id
    OR c.parent_id IN (SELECT id FROM public.categories WHERE parent_id = m.id)
  );

-- 2. Delete every non-main category (level 2 and level 3) under the 10 mains.
--    category_filters rows cascade-delete with their category.
DELETE FROM public.categories
WHERE parent_id IN (
  SELECT id FROM public.categories WHERE slug IN (
    'elektronikk', 'interior', 'hus-og-hage', 'klar-og-mote', 'sport',
    'dyr-og-utstyr', 'bil-og-mc', 'kunst', 'barn-og-baby', 'bat'
  ) AND parent_id IS NULL
) OR parent_id IN (
  SELECT id FROM public.categories
  WHERE parent_id IN (
    SELECT id FROM public.categories WHERE slug IN (
      'elektronikk', 'interior', 'hus-og-hage', 'klar-og-mote', 'sport',
      'dyr-og-utstyr', 'bil-og-mc', 'kunst', 'barn-og-baby', 'bat'
    ) AND parent_id IS NULL
  )
);

-- 3. Level-2 subcategories for every main category.
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT v.slug, v.name_nb, v.sort_order, p.id
FROM (VALUES
  -- Elektronikk
  ('tv-og-lyd', 'TV og lyd', 1, 'elektronikk'),
  ('mobil-og-nettbrett', 'Mobil og nettbrett', 2, 'elektronikk'),
  ('data', 'Data', 3, 'elektronikk'),
  ('foto-og-video', 'Foto og video', 4, 'elektronikk'),
  ('gaming', 'Gaming', 5, 'elektronikk'),
  ('hvitevarer', 'Hvitevarer', 6, 'elektronikk'),
  ('smaelektrisk', 'Småelektrisk', 7, 'elektronikk'),

  -- Klær og mote
  ('herreklaer', 'Herreklær', 1, 'klar-og-mote'),
  ('dameklaer', 'Dameklær', 2, 'klar-og-mote'),
  ('barneklaer', 'Barneklær', 3, 'klar-og-mote'),
  ('vesker-og-accessories', 'Vesker og accessories', 4, 'klar-og-mote'),
  ('smykker-og-klokker', 'Smykker og klokker', 5, 'klar-og-mote'),
  ('sport-og-undertoy', 'Sport og undertøy', 6, 'klar-og-mote'),

  -- Interiør
  ('mobler', 'Møbler', 1, 'interior'),
  ('belysning', 'Belysning', 2, 'interior'),
  ('tekstiler', 'Tekstiler', 3, 'interior'),
  ('kjokken-og-servise', 'Kjøkken og servise', 4, 'interior'),
  ('dekorasjon', 'Dekorasjon', 5, 'interior'),

  -- Hus og hage
  ('verktoy', 'Verktøy', 1, 'hus-og-hage'),
  ('byggevarer', 'Byggevarer', 2, 'hus-og-hage'),
  ('hage', 'Hage', 3, 'hus-og-hage'),
  ('stillas-og-sikkerhet', 'Stillas og sikkerhet', 4, 'hus-og-hage'),
  ('tjenester', 'Tjenester', 5, 'hus-og-hage'),

  -- Sport
  ('trening-og-fitness', 'Trening og fitness', 1, 'sport'),
  ('sykkel', 'Sykkel', 2, 'sport'),
  ('ball-og-lagidrett', 'Ball- og lagidrett', 3, 'sport'),
  ('vintersport', 'Vintersport', 4, 'sport'),
  ('friluftsliv', 'Friluftsliv', 5, 'sport'),
  ('festivalutstyr', 'Festivalutstyr', 6, 'sport'),

  -- Dyr og utstyr
  ('hund', 'Hund', 1, 'dyr-og-utstyr'),
  ('katt', 'Katt', 2, 'dyr-og-utstyr'),
  ('smadyr', 'Smådyr', 3, 'dyr-og-utstyr'),
  ('fugl-og-akvarium', 'Fugl og akvarium', 4, 'dyr-og-utstyr'),
  ('hest', 'Hest', 5, 'dyr-og-utstyr'),

  -- Bil og MC
  ('biler', 'Biler', 1, 'bil-og-mc'),
  ('mc-og-moped', 'MC og moped', 2, 'bil-og-mc'),
  ('deler-og-tilbehor', 'Deler og tilbehør', 3, 'bil-og-mc'),
  ('tilhenger', 'Tilhenger', 4, 'bil-og-mc'),

  -- Kunst
  ('malerier-og-grafikk', 'Malerier og grafikk', 1, 'kunst'),
  ('skulptur-og-keramikk', 'Skulptur og keramikk', 2, 'kunst'),
  ('hobby-og-handverk', 'Hobby og håndverk', 3, 'kunst'),
  ('musikk', 'Musikk', 4, 'kunst'),
  ('boker-og-film', 'Bøker og film', 5, 'kunst'),
  ('samleobjekter', 'Samleobjekter', 6, 'kunst'),

  -- Barn og baby
  ('barnevogn-og-bilstol', 'Barnevogn og bilstol', 1, 'barn-og-baby'),
  ('mobler-til-barnerom', 'Møbler til barnerom', 2, 'barn-og-baby'),
  ('lek-og-laering', 'Lek og læring', 3, 'barn-og-baby'),
  ('amming-og-mat', 'Amming og mat', 4, 'barn-og-baby'),

  -- Båt
  ('bater', 'Båter', 1, 'bat'),
  ('motor', 'Motor', 2, 'bat'),
  ('tilbehor-og-utstyr', 'Tilbehør og utstyr', 3, 'bat'),
  ('vannsport', 'Vannsport', 4, 'bat')
) AS v(slug, name_nb, sort_order, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug;

-- 4. Level-3 leaf categories under the level-2 subcategories above.
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT v.slug, v.name_nb, v.sort_order, p.id
FROM (VALUES
  -- Elektronikk / TV og lyd
  ('tv', 'TV', 1, 'tv-og-lyd'),
  ('soundbar-og-hoyttalere', 'Soundbar og høyttalere', 2, 'tv-og-lyd'),
  -- Elektronikk / Mobil og nettbrett
  ('mobiltelefon', 'Mobiltelefon', 1, 'mobil-og-nettbrett'),
  ('nettbrett', 'Nettbrett', 2, 'mobil-og-nettbrett'),
  ('smartklokke', 'Smartklokke', 3, 'mobil-og-nettbrett'),
  ('mobiltilbehor', 'Mobiltilbehør', 4, 'mobil-og-nettbrett'),
  -- Elektronikk / Data
  ('barbar-pc', 'Bærbar PC', 1, 'data'),
  ('stasjonaer-pc', 'Stasjonær PC', 2, 'data'),
  ('skjerm', 'Skjerm', 3, 'data'),
  ('datatilbehor', 'Datatilbehør', 4, 'data'),
  -- Elektronikk / Foto og video
  ('kamera', 'Kamera', 1, 'foto-og-video'),
  ('drone', 'Drone', 2, 'foto-og-video'),
  ('fototilbehor', 'Fototilbehør', 3, 'foto-og-video'),
  -- Elektronikk / Gaming
  ('spillkonsoll', 'Spillkonsoll', 1, 'gaming'),
  ('dataspill', 'Dataspill', 2, 'gaming'),
  ('gaming-tilbehor', 'Gaming-tilbehør', 3, 'gaming'),
  -- Elektronikk / Hvitevarer
  ('kjoleskap-og-fryser', 'Kjøleskap og fryser', 1, 'hvitevarer'),
  ('vaskemaskin-og-torketrommel', 'Vaskemaskin og tørketrommel', 2, 'hvitevarer'),
  ('komfyr-og-ovn', 'Komfyr og ovn', 3, 'hvitevarer'),
  ('stovsuger', 'Støvsuger', 4, 'hvitevarer'),
  -- Elektronikk / Småelektrisk
  ('kaffemaskin', 'Kaffemaskin', 1, 'smaelektrisk'),
  ('personlig-pleie', 'Personlig pleie', 2, 'smaelektrisk'),

  -- Klær og mote / Herreklær
  ('herre-bukse', 'Bukse', 1, 'herreklaer'),
  ('herre-jakke', 'Jakke', 2, 'herreklaer'),
  ('herre-skjorte-og-genser', 'Skjorte og genser', 3, 'herreklaer'),
  ('herre-sko', 'Sko', 4, 'herreklaer'),
  -- Klær og mote / Dameklær
  ('dame-kjole', 'Kjole', 1, 'dameklaer'),
  ('dame-bukse', 'Bukse', 2, 'dameklaer'),
  ('dame-jakke-og-genser', 'Jakke og genser', 3, 'dameklaer'),
  ('dame-sko', 'Sko', 4, 'dameklaer'),
  -- Klær og mote / Barneklær
  ('barneklaer-0-2', 'Klær 0-2 år', 1, 'barneklaer'),
  ('barneklaer-3-10', 'Klær 3-10 år', 2, 'barneklaer'),
  ('barneklaer-11-16', 'Klær 11-16 år', 3, 'barneklaer'),
  ('barnesko', 'Barnesko', 4, 'barneklaer'),
  -- Klær og mote / Vesker og accessories
  ('veske', 'Veske', 1, 'vesker-og-accessories'),
  ('belte', 'Belte', 2, 'vesker-og-accessories'),
  ('lue-og-skjerf', 'Lue og skjerf', 3, 'vesker-og-accessories'),
  ('solbriller', 'Solbriller', 4, 'vesker-og-accessories'),
  -- Klær og mote / Smykker og klokker
  ('smykker', 'Ring, halskjede og armbånd', 1, 'smykker-og-klokker'),
  ('klokke', 'Klokke', 2, 'smykker-og-klokker'),
  -- Klær og mote / Sport og undertøy
  ('undertoy-og-badetoy', 'Undertøy og badetøy', 1, 'sport-og-undertoy'),
  ('treningsklaer', 'Treningsklær', 2, 'sport-og-undertoy'),

  -- Interiør / Møbler
  ('sofa', 'Sofa', 1, 'mobler'),
  ('stol-og-lenestol', 'Stol og lenestol', 2, 'mobler'),
  ('bord', 'Bord', 3, 'mobler'),
  ('skap-og-oppbevaring', 'Skap og oppbevaring', 4, 'mobler'),
  ('seng', 'Seng', 5, 'mobler'),
  -- Interiør / Belysning
  ('tak-gulv-og-bordlampe', 'Taklampe, gulvlampe og bordlampe', 1, 'belysning'),
  ('utebelysning', 'Utebelysning', 2, 'belysning'),
  -- Interiør / Tekstiler
  ('tepper', 'Tepper', 1, 'tekstiler'),
  ('gardiner-puter-og-sengetoy', 'Gardiner, puter og sengetøy', 2, 'tekstiler'),
  -- Interiør / Kjøkken og servise
  ('kjokkenutstyr', 'Kjøkkenutstyr', 1, 'kjokken-og-servise'),
  ('servise-og-bestikk', 'Servise og bestikk', 2, 'kjokken-og-servise'),
  ('oppbevaring-og-rengjoring', 'Oppbevaring og rengjøring', 3, 'kjokken-og-servise'),
  -- Interiør / Dekorasjon
  ('vegg-kunst-og-plakater', 'Vegg-kunst og plakater', 1, 'dekorasjon'),
  ('speil', 'Speil', 2, 'dekorasjon'),
  ('vaser-og-potter', 'Vaser og potter', 3, 'dekorasjon'),
  ('lys-og-lysestaker', 'Lys og lysestaker', 4, 'dekorasjon'),

  -- Hus og hage / Verktøy
  ('handverktoy', 'Håndverktøy', 1, 'verktoy'),
  ('elektroverktoy', 'Elektroverktøy', 2, 'verktoy'),
  ('maleverktoy', 'Måleverktøy', 3, 'verktoy'),
  -- Hus og hage / Byggevarer
  ('byggematerialer', 'Byggematerialer', 1, 'byggevarer'),
  ('maling-og-overflate', 'Maling og overflate', 2, 'byggevarer'),
  ('ror-og-elektro', 'Rør og elektro', 3, 'byggevarer'),
  -- Hus og hage / Hage
  ('hagemobler', 'Hagemøbler', 1, 'hage'),
  ('grill', 'Grill', 2, 'hage'),
  ('planter-og-jord', 'Planter og jord', 3, 'hage'),
  ('hageredskap', 'Hageredskap', 4, 'hage'),
  -- Hus og hage / Stillas og sikkerhet
  ('stillas-og-stige', 'Stillas og stige', 1, 'stillas-og-sikkerhet'),
  ('verneutstyr', 'Verneutstyr', 2, 'stillas-og-sikkerhet'),
  -- Hus og hage / Tjenester
  ('handverkertjenester', 'Håndverkertjenester', 1, 'tjenester'),
  ('flyttehjelp', 'Flyttehjelp', 2, 'tjenester'),
  ('renholdstjenester', 'Renholdstjenester', 3, 'tjenester'),
  ('undervisning', 'Undervisning', 4, 'tjenester'),

  -- Sport / Trening og fitness
  ('treningsutstyr', 'Treningsutstyr', 1, 'trening-og-fitness'),
  ('vekter-og-styrke', 'Vekter og styrke', 2, 'trening-og-fitness'),
  ('yoga-og-pilates', 'Yoga og pilates', 3, 'trening-og-fitness'),
  -- Sport / Sykkel
  ('sykkel-leaf', 'Sykkel', 1, 'sykkel'),
  ('sykkeltilbehor', 'Sykkeltilbehør', 2, 'sykkel'),
  ('sykkelklaer', 'Sykkelklær', 3, 'sykkel'),
  -- Sport / Ball- og lagidrett
  ('fotball', 'Fotball', 1, 'ball-og-lagidrett'),
  ('handball', 'Håndball', 2, 'ball-og-lagidrett'),
  ('basketball', 'Basketball', 3, 'ball-og-lagidrett'),
  ('tennis-og-padel', 'Tennis og padel', 4, 'ball-og-lagidrett'),
  -- Sport / Vintersport
  ('ski-og-snowboard', 'Ski og snowboard', 1, 'vintersport'),
  ('skisko-og-bindinger', 'Skisko og bindinger', 2, 'vintersport'),
  ('vinterklaer', 'Vinterklær', 3, 'vintersport'),
  -- Sport / Friluftsliv
  ('fisking', 'Fisking', 1, 'friluftsliv'),
  ('camping', 'Camping', 2, 'friluftsliv'),
  ('klatring', 'Klatring', 3, 'friluftsliv'),
  -- Sport / Festivalutstyr
  ('telt', 'Telt', 1, 'festivalutstyr'),
  ('sittemobler', 'Sittemøbler', 2, 'festivalutstyr'),

  -- Dyr og utstyr / Hund
  ('hundemat', 'Hundemat', 1, 'hund'),
  ('hundeutstyr', 'Hundeutstyr', 2, 'hund'),
  ('hundeseng-og-transport', 'Hundeseng og transport', 3, 'hund'),
  -- Dyr og utstyr / Katt
  ('kattemat', 'Kattemat', 1, 'katt'),
  ('katteutstyr', 'Katteutstyr', 2, 'katt'),
  ('kattekasse', 'Kattekasse', 3, 'katt'),
  -- Dyr og utstyr / Smådyr
  ('for-og-utstyr-smadyr', 'Fôr og utstyr smådyr', 1, 'smadyr'),
  -- Dyr og utstyr / Fugl og akvarium
  ('fuglebur-og-for', 'Fuglebur og fôr', 1, 'fugl-og-akvarium'),
  ('akvarium-og-tilbehor', 'Akvarium og tilbehør', 2, 'fugl-og-akvarium'),
  -- Dyr og utstyr / Hest
  ('hesteutstyr', 'Hesteutstyr', 1, 'hest'),
  ('hestefor', 'Fôr', 2, 'hest'),

  -- Bil og MC / Biler
  ('personbil', 'Personbil', 1, 'biler'),
  ('varebil', 'Varebil', 2, 'biler'),
  ('bobil-og-campingvogn', 'Bobil og campingvogn', 3, 'biler'),
  -- Bil og MC / MC og moped
  ('motorsykkel', 'Motorsykkel', 1, 'mc-og-moped'),
  ('moped-og-scooter', 'Moped og scooter', 2, 'mc-og-moped'),
  ('atv-og-snoscooter', 'ATV og snøscooter', 3, 'mc-og-moped'),
  -- Bil og MC / Deler og tilbehør
  ('dekk-og-felg', 'Dekk og felg', 1, 'deler-og-tilbehor'),
  ('bilstereo-og-elektronikk', 'Bilstereo og elektronikk', 2, 'deler-og-tilbehor'),
  ('reservedeler', 'Reservedeler', 3, 'deler-og-tilbehor'),
  -- Bil og MC / Tilhenger
  ('tilhenger-leaf', 'Tilhenger', 1, 'tilhenger'),

  -- Kunst / Malerier og grafikk
  ('malerier', 'Malerier', 1, 'malerier-og-grafikk'),
  ('litografier-og-fotokunst', 'Litografier, grafikk og fotokunst', 2, 'malerier-og-grafikk'),
  -- Kunst / Skulptur og keramikk
  ('skulptur-og-keramikk-leaf', 'Skulptur og keramikk', 1, 'skulptur-og-keramikk'),
  -- Kunst / Hobby og håndverk
  ('kunst-og-handverksmateriell', 'Kunst- og håndverksmateriell', 1, 'hobby-og-handverk'),
  ('brettspill-og-puslespill', 'Brettspill og puslespill', 2, 'hobby-og-handverk'),
  -- Kunst / Musikk
  ('musikkinstrumenter', 'Musikkinstrumenter', 1, 'musikk'),
  ('vinyl-og-cd', 'Vinyl og CD', 2, 'musikk'),
  -- Kunst / Bøker og film
  ('boker', 'Bøker', 1, 'boker-og-film'),
  ('tegneserier-og-dvd', 'Tegneserier og DVD/Blu-ray', 2, 'boker-og-film'),
  -- Kunst / Samleobjekter
  ('mynter-og-frimerker', 'Mynter og frimerker', 1, 'samleobjekter'),
  ('antikviteter', 'Antikviteter', 2, 'samleobjekter'),
  ('figurer-og-samlekort', 'Figurer og samlekort', 3, 'samleobjekter'),

  -- Barn og baby / Barnevogn og bilstol
  ('barnevogn', 'Barnevogn', 1, 'barnevogn-og-bilstol'),
  ('bilstol', 'Bilstol', 2, 'barnevogn-og-bilstol'),
  ('baereseler', 'Bæreseler', 3, 'barnevogn-og-bilstol'),
  -- Barn og baby / Møbler til barnerom
  ('barneseng', 'Barneseng', 1, 'mobler-til-barnerom'),
  ('stellebord-og-oppbevaring', 'Stellebord og oppbevaring', 2, 'mobler-til-barnerom'),
  -- Barn og baby / Lek og læring
  ('leker', 'Leker', 1, 'lek-og-laering'),
  ('puslespill-og-boker-barn', 'Puslespill, spill og bøker for barn', 2, 'lek-og-laering'),
  -- Barn og baby / Amming og mat
  ('ammeutstyr-og-tateflasker', 'Ammeutstyr og tåteflasker', 1, 'amming-og-mat'),
  ('barnemat-og-utstyr', 'Barnemat og utstyr', 2, 'amming-og-mat'),

  -- Båt / Båter
  ('motorbat', 'Motorbåt', 1, 'bater'),
  ('seilbat', 'Seilbåt', 2, 'bater'),
  ('jolle-og-gummibat', 'Jolle og gummibåt', 3, 'bater'),
  -- Båt / Motor
  ('batmotorer', 'Båtmotorer', 1, 'motor'),
  -- Båt / Tilbehør og utstyr
  ('battilbehor-og-utstyr', 'Båttilbehør og utstyr', 1, 'tilbehor-og-utstyr'),
  ('sikkerhetsutstyr-og-fortoyning', 'Sikkerhetsutstyr og fortøyning', 2, 'tilbehor-og-utstyr'),
  -- Båt / Vannsport
  ('vannsport-og-batutstyr', 'Vannsport og båtutstyr', 1, 'vannsport')
) AS v(slug, name_nb, sort_order, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug;

-- 5. Filters on the leaf categories.
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
SELECT c.id, f.key, f.label_nb, f.type, f.unit, f.options::jsonb, f.sort_order
FROM (VALUES
  -- Elektronikk
  ('tv', 'screen_size_inch', 'Skjermstørrelse', 'range', 'tommer', NULL, 1),
  ('tv', 'panel_tech', 'Panelteknologi', 'select', NULL,
    '[{"value":"led","label_nb":"LED"},{"value":"qled","label_nb":"QLED"},{"value":"oled","label_nb":"OLED"},{"value":"mini_led","label_nb":"Mini-LED"}]', 2),
  ('tv', 'resolution', 'Oppløsning', 'select', NULL,
    '[{"value":"hd","label_nb":"HD"},{"value":"full_hd","label_nb":"Full HD"},{"value":"4k","label_nb":"4K"},{"value":"8k","label_nb":"8K"}]', 3),
  ('tv', 'smart_tv', 'Smart-TV', 'select', NULL,
    '[{"value":"ja","label_nb":"Ja"},{"value":"nei","label_nb":"Nei"}]', 4),
  ('tv', 'brand', 'Merke', 'text', NULL, NULL, 5),
  ('soundbar-og-hoyttalere', 'speaker_type', 'Type', 'select', NULL,
    '[{"value":"soundbar","label_nb":"Soundbar"},{"value":"bookshelf","label_nb":"Reolhøyttaler"},{"value":"floorstanding","label_nb":"Gulvhøyttaler"},{"value":"portable","label_nb":"Bærbar"}]', 1),
  ('soundbar-og-hoyttalere', 'connectivity', 'Tilkobling', 'select', NULL,
    '[{"value":"bluetooth","label_nb":"Bluetooth"},{"value":"wifi","label_nb":"WiFi"},{"value":"optisk","label_nb":"Optisk"},{"value":"aux","label_nb":"AUX"}]', 2),
  ('soundbar-og-hoyttalere', 'brand', 'Merke', 'text', NULL, NULL, 3),

  ('mobiltelefon', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('mobiltelefon', 'storage_gb', 'Lagringsplass', 'select', 'GB',
    '[{"value":"64","label_nb":"64 GB"},{"value":"128","label_nb":"128 GB"},{"value":"256","label_nb":"256 GB"},{"value":"512","label_nb":"512 GB"},{"value":"1024","label_nb":"1 TB"}]', 2),
  ('mobiltelefon', 'screen_size_inch', 'Skjermstørrelse', 'range', 'tommer', NULL, 3),
  ('mobiltelefon', 'condition', 'Tilstand', 'select', NULL,
    '[{"value":"nytt","label_nb":"Nytt"},{"value":"som_nytt","label_nb":"Som nytt"},{"value":"bra","label_nb":"Bra"},{"value":"slitt","label_nb":"Slitt"}]', 4),
  ('nettbrett', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('nettbrett', 'storage_gb', 'Lagringsplass', 'select', 'GB',
    '[{"value":"64","label_nb":"64 GB"},{"value":"128","label_nb":"128 GB"},{"value":"256","label_nb":"256 GB"},{"value":"512","label_nb":"512 GB"}]', 2),
  ('nettbrett', 'screen_size_inch', 'Skjermstørrelse', 'range', 'tommer', NULL, 3),
  ('smartklokke', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('smartklokke', 'compatible_os', 'Kompatibilitet', 'select', NULL,
    '[{"value":"ios","label_nb":"iOS"},{"value":"android","label_nb":"Android"},{"value":"begge","label_nb":"Begge"}]', 2),
  ('mobiltilbehor', 'accessory_type', 'Type', 'select', NULL,
    '[{"value":"deksel","label_nb":"Deksel"},{"value":"lader","label_nb":"Lader"},{"value":"skjermbeskytter","label_nb":"Skjermbeskyttelse"},{"value":"hodetelefoner","label_nb":"Hodetelefoner"}]', 1),

  ('barbar-pc', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('barbar-pc', 'processor', 'Prosessor', 'select', NULL,
    '[{"value":"intel","label_nb":"Intel"},{"value":"amd","label_nb":"AMD"},{"value":"apple","label_nb":"Apple"}]', 2),
  ('barbar-pc', 'ram_gb', 'RAM', 'select', 'GB',
    '[{"value":"4","label_nb":"4 GB"},{"value":"8","label_nb":"8 GB"},{"value":"16","label_nb":"16 GB"},{"value":"32","label_nb":"32 GB"},{"value":"64","label_nb":"64 GB"}]', 3),
  ('barbar-pc', 'storage_gb', 'Lagringsplass', 'number', 'GB', NULL, 4),
  ('barbar-pc', 'screen_size_inch', 'Skjermstørrelse', 'range', 'tommer', NULL, 5),
  ('stasjonaer-pc', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('stasjonaer-pc', 'processor', 'Prosessor', 'select', NULL,
    '[{"value":"intel","label_nb":"Intel"},{"value":"amd","label_nb":"AMD"},{"value":"apple","label_nb":"Apple"}]', 2),
  ('stasjonaer-pc', 'ram_gb', 'RAM', 'select', 'GB',
    '[{"value":"4","label_nb":"4 GB"},{"value":"8","label_nb":"8 GB"},{"value":"16","label_nb":"16 GB"},{"value":"32","label_nb":"32 GB"},{"value":"64","label_nb":"64 GB"}]', 3),
  ('stasjonaer-pc', 'storage_gb', 'Lagringsplass', 'number', 'GB', NULL, 4),
  ('stasjonaer-pc', 'gpu', 'Skjermkort', 'text', NULL, NULL, 5),
  ('skjerm', 'screen_size_inch', 'Skjermstørrelse', 'range', 'tommer', NULL, 1),
  ('skjerm', 'resolution', 'Oppløsning', 'select', NULL,
    '[{"value":"hd","label_nb":"HD"},{"value":"full_hd","label_nb":"Full HD"},{"value":"2k","label_nb":"2K"},{"value":"4k","label_nb":"4K"}]', 2),
  ('skjerm', 'refresh_rate_hz', 'Oppdateringsfrekvens', 'number', 'Hz', NULL, 3),
  ('datatilbehor', 'accessory_type', 'Type', 'select', NULL,
    '[{"value":"tastatur","label_nb":"Tastatur"},{"value":"mus","label_nb":"Mus"},{"value":"nettverk","label_nb":"Nettverk"},{"value":"kabler","label_nb":"Kabler"}]', 1),

  ('kamera', 'camera_type', 'Type', 'select', NULL,
    '[{"value":"speilrefleks","label_nb":"Speilrefleks"},{"value":"speillos","label_nb":"Speilløs"},{"value":"kompakt","label_nb":"Kompakt"},{"value":"actioncam","label_nb":"Actionkamera"}]', 1),
  ('kamera', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('kamera', 'megapixels', 'Megapiksler', 'number', 'MP', NULL, 3),
  ('drone', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('drone', 'camera_resolution', 'Kameraoppløsning', 'text', NULL, NULL, 2),
  ('fototilbehor', 'accessory_type', 'Type', 'select', NULL,
    '[{"value":"objektiv","label_nb":"Objektiv"},{"value":"stativ","label_nb":"Stativ"},{"value":"minnekort","label_nb":"Minnekort"},{"value":"bag","label_nb":"Bag"}]', 1),

  ('spillkonsoll', 'platform', 'Plattform', 'select', NULL,
    '[{"value":"playstation","label_nb":"PlayStation"},{"value":"xbox","label_nb":"Xbox"},{"value":"nintendo","label_nb":"Nintendo"},{"value":"pc","label_nb":"PC"}]', 1),
  ('dataspill', 'platform', 'Plattform', 'select', NULL,
    '[{"value":"playstation","label_nb":"PlayStation"},{"value":"xbox","label_nb":"Xbox"},{"value":"nintendo","label_nb":"Nintendo"},{"value":"pc","label_nb":"PC"}]', 1),
  ('dataspill', 'genre', 'Sjanger', 'text', NULL, NULL, 2),
  ('gaming-tilbehor', 'accessory_type', 'Type', 'select', NULL,
    '[{"value":"kontroller","label_nb":"Kontroller"},{"value":"headset","label_nb":"Headset"},{"value":"stol","label_nb":"Stol"},{"value":"ratt","label_nb":"Ratt"}]', 1),

  ('kjoleskap-og-fryser', 'energy_class', 'Energiklasse', 'select', NULL,
    '[{"value":"a","label_nb":"A"},{"value":"b","label_nb":"B"},{"value":"c","label_nb":"C"},{"value":"d","label_nb":"D"},{"value":"e","label_nb":"E"},{"value":"f","label_nb":"F"},{"value":"g","label_nb":"G"}]', 1),
  ('kjoleskap-og-fryser', 'capacity_liter', 'Kapasitet', 'number', 'liter', NULL, 2),
  ('kjoleskap-og-fryser', 'width_cm', 'Bredde', 'number', 'cm', NULL, 3),
  ('kjoleskap-og-fryser', 'brand', 'Merke', 'text', NULL, NULL, 4),
  ('vaskemaskin-og-torketrommel', 'energy_class', 'Energiklasse', 'select', NULL,
    '[{"value":"a","label_nb":"A"},{"value":"b","label_nb":"B"},{"value":"c","label_nb":"C"},{"value":"d","label_nb":"D"},{"value":"e","label_nb":"E"},{"value":"f","label_nb":"F"},{"value":"g","label_nb":"G"}]', 1),
  ('vaskemaskin-og-torketrommel', 'capacity_kg', 'Kapasitet', 'number', 'kg', NULL, 2),
  ('vaskemaskin-og-torketrommel', 'brand', 'Merke', 'text', NULL, NULL, 3),
  ('komfyr-og-ovn', 'energy_class', 'Energiklasse', 'select', NULL,
    '[{"value":"a","label_nb":"A"},{"value":"b","label_nb":"B"},{"value":"c","label_nb":"C"},{"value":"d","label_nb":"D"},{"value":"e","label_nb":"E"},{"value":"f","label_nb":"F"},{"value":"g","label_nb":"G"}]', 1),
  ('komfyr-og-ovn', 'type', 'Type', 'select', NULL,
    '[{"value":"induksjon","label_nb":"Induksjon"},{"value":"keramisk","label_nb":"Keramisk"},{"value":"gass","label_nb":"Gass"}]', 2),
  ('komfyr-og-ovn', 'brand', 'Merke', 'text', NULL, NULL, 3),
  ('stovsuger', 'type', 'Type', 'select', NULL,
    '[{"value":"robot","label_nb":"Robot"},{"value":"stav","label_nb":"Stav"},{"value":"tradlos","label_nb":"Trådløs"},{"value":"sylinder","label_nb":"Sylinder"}]', 1),
  ('stovsuger', 'brand', 'Merke', 'text', NULL, NULL, 2),

  ('kaffemaskin', 'type', 'Type', 'select', NULL,
    '[{"value":"kapsel","label_nb":"Kapsel"},{"value":"espresso","label_nb":"Espresso"},{"value":"trakt","label_nb":"Trakt"},{"value":"fullautomat","label_nb":"Fullautomat"}]', 1),
  ('kaffemaskin', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('personlig-pleie', 'type', 'Type', 'select', NULL,
    '[{"value":"harforner","label_nb":"Hårføner"},{"value":"barbermaskin","label_nb":"Barbermaskin"},{"value":"tannborste","label_nb":"Tannbørste"}]', 1),
  ('personlig-pleie', 'brand', 'Merke', 'text', NULL, NULL, 2),

  -- Klær og mote
  ('herre-bukse', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('herre-bukse', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('herre-bukse', 'color', 'Farge', 'text', NULL, NULL, 3),
  ('herre-jakke', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('herre-jakke', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('herre-jakke', 'color', 'Farge', 'text', NULL, NULL, 3),
  ('herre-skjorte-og-genser', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('herre-skjorte-og-genser', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('herre-skjorte-og-genser', 'color', 'Farge', 'text', NULL, NULL, 3),
  ('herre-sko', 'shoe_size_eu', 'Skostørrelse (EU)', 'number', NULL, NULL, 1),
  ('herre-sko', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('herre-sko', 'shoe_type', 'Type', 'select', NULL,
    '[{"value":"sneakers","label_nb":"Sneakers"},{"value":"boots","label_nb":"Boots"},{"value":"loafers","label_nb":"Loafers"},{"value":"sandaler","label_nb":"Sandaler"}]', 3),

  ('dame-kjole', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('dame-kjole', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('dame-kjole', 'color', 'Farge', 'text', NULL, NULL, 3),
  ('dame-bukse', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('dame-bukse', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('dame-bukse', 'color', 'Farge', 'text', NULL, NULL, 3),
  ('dame-jakke-og-genser', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('dame-jakke-og-genser', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('dame-jakke-og-genser', 'color', 'Farge', 'text', NULL, NULL, 3),
  ('dame-sko', 'shoe_size_eu', 'Skostørrelse (EU)', 'number', NULL, NULL, 1),
  ('dame-sko', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('dame-sko', 'shoe_type', 'Type', 'select', NULL,
    '[{"value":"sneakers","label_nb":"Sneakers"},{"value":"boots","label_nb":"Boots"},{"value":"loafers","label_nb":"Loafers"},{"value":"sandaler","label_nb":"Sandaler"}]', 3),

  ('barneklaer-0-2', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"62","label_nb":"62"},{"value":"68","label_nb":"68"},{"value":"74","label_nb":"74"},{"value":"80","label_nb":"80"},{"value":"86","label_nb":"86"},{"value":"92","label_nb":"92"}]', 1),
  ('barneklaer-0-2', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('barneklaer-3-10', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"98","label_nb":"98"},{"value":"104","label_nb":"104"},{"value":"110","label_nb":"110"},{"value":"116","label_nb":"116"},{"value":"122","label_nb":"122"},{"value":"128","label_nb":"128"},{"value":"134","label_nb":"134"},{"value":"140","label_nb":"140"}]', 1),
  ('barneklaer-3-10', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('barneklaer-11-16', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"146","label_nb":"146"},{"value":"152","label_nb":"152"},{"value":"158","label_nb":"158"},{"value":"164","label_nb":"164"},{"value":"170","label_nb":"170"},{"value":"176","label_nb":"176"}]', 1),
  ('barneklaer-11-16', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('barnesko', 'shoe_size_eu', 'Skostørrelse (EU)', 'number', NULL, NULL, 1),
  ('barnesko', 'brand', 'Merke', 'text', NULL, NULL, 2),

  ('veske', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('veske', 'material', 'Materiale', 'select', NULL,
    '[{"value":"skinn","label_nb":"Skinn"},{"value":"kunstskinn","label_nb":"Kunstskinn"},{"value":"tekstil","label_nb":"Tekstil"}]', 2),
  ('belte', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('belte', 'material', 'Materiale', 'select', NULL,
    '[{"value":"skinn","label_nb":"Skinn"},{"value":"kunstskinn","label_nb":"Kunstskinn"},{"value":"tekstil","label_nb":"Tekstil"}]', 2),
  ('lue-og-skjerf', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('solbriller', 'brand', 'Merke', 'text', NULL, NULL, 1),

  ('smykker', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('smykker', 'material', 'Materiale', 'select', NULL,
    '[{"value":"gull","label_nb":"Gull"},{"value":"solv","label_nb":"Sølv"},{"value":"stal","label_nb":"Stål"},{"value":"annet","label_nb":"Annet"}]', 2),
  ('klokke', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('klokke', 'material', 'Materiale', 'select', NULL,
    '[{"value":"gull","label_nb":"Gull"},{"value":"solv","label_nb":"Sølv"},{"value":"stal","label_nb":"Stål"},{"value":"annet","label_nb":"Annet"}]', 2),

  ('undertoy-og-badetoy', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('undertoy-og-badetoy', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('treningsklaer', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('treningsklaer', 'brand', 'Merke', 'text', NULL, NULL, 2),

  -- Interiør
  ('sofa', 'material', 'Materiale', 'select', NULL,
    '[{"value":"stoff","label_nb":"Stoff"},{"value":"skinn","label_nb":"Skinn"},{"value":"kunstskinn","label_nb":"Kunstskinn"}]', 1),
  ('sofa', 'seats_count', 'Antall seter', 'number', NULL, NULL, 2),
  ('sofa', 'color', 'Farge', 'text', NULL, NULL, 3),
  ('sofa', 'brand', 'Merke', 'text', NULL, NULL, 4),
  ('stol-og-lenestol', 'material', 'Materiale', 'text', NULL, NULL, 1),
  ('stol-og-lenestol', 'style', 'Stil', 'select', NULL,
    '[{"value":"skandinavisk","label_nb":"Skandinavisk"},{"value":"vintage","label_nb":"Vintage"},{"value":"moderne","label_nb":"Moderne"},{"value":"industriell","label_nb":"Industriell"}]', 2),
  ('stol-og-lenestol', 'brand', 'Merke', 'text', NULL, NULL, 3),
  ('bord', 'table_type', 'Type', 'select', NULL,
    '[{"value":"spisebord","label_nb":"Spisebord"},{"value":"salongbord","label_nb":"Salongbord"},{"value":"skrivebord","label_nb":"Skrivebord"}]', 1),
  ('bord', 'material', 'Materiale', 'text', NULL, NULL, 2),
  ('bord', 'length_cm', 'Lengde', 'number', 'cm', NULL, 3),
  ('skap-og-oppbevaring', 'storage_type', 'Type', 'select', NULL,
    '[{"value":"garderobeskap","label_nb":"Garderobeskap"},{"value":"bokhylle","label_nb":"Bokhylle"},{"value":"kommode","label_nb":"Kommode"},{"value":"sideboard","label_nb":"Sideboard"}]', 1),
  ('skap-og-oppbevaring', 'material', 'Materiale', 'text', NULL, NULL, 2),
  ('skap-og-oppbevaring', 'width_cm', 'Bredde', 'number', 'cm', NULL, 3),
  ('seng', 'bed_size', 'Sengestørrelse', 'select', NULL,
    '[{"value":"90","label_nb":"90 cm"},{"value":"120","label_nb":"120 cm"},{"value":"140","label_nb":"140 cm"},{"value":"160","label_nb":"160 cm"},{"value":"180","label_nb":"180 cm"}]', 1),
  ('seng', 'material', 'Materiale', 'text', NULL, NULL, 2),

  ('tak-gulv-og-bordlampe', 'light_source', 'Lyskilde', 'select', NULL,
    '[{"value":"led","label_nb":"LED"},{"value":"glodepaere","label_nb":"Glødepære"},{"value":"smart","label_nb":"Smart"}]', 1),
  ('tak-gulv-og-bordlampe', 'style', 'Stil', 'text', NULL, NULL, 2),
  ('utebelysning', 'power_source', 'Strømkilde', 'select', NULL,
    '[{"value":"strom","label_nb":"Strøm"},{"value":"solcelle","label_nb":"Solcelle"},{"value":"batteri","label_nb":"Batteri"}]', 1),

  ('tepper', 'material', 'Materiale', 'select', NULL,
    '[{"value":"ull","label_nb":"Ull"},{"value":"syntetisk","label_nb":"Syntetisk"},{"value":"naturfiber","label_nb":"Naturfiber"}]', 1),
  ('tepper', 'size_cm', 'Størrelse', 'text', NULL, NULL, 2),
  ('gardiner-puter-og-sengetoy', 'material', 'Materiale', 'text', NULL, NULL, 1),
  ('gardiner-puter-og-sengetoy', 'color', 'Farge', 'text', NULL, NULL, 2),

  ('kjokkenutstyr', 'material', 'Materiale', 'select', NULL,
    '[{"value":"rustfritt_stal","label_nb":"Rustfritt stål"},{"value":"stopejern","label_nb":"Støpejern"},{"value":"tre","label_nb":"Tre"},{"value":"silikon","label_nb":"Silikon"}]', 1),
  ('servise-og-bestikk', 'material', 'Materiale', 'select', NULL,
    '[{"value":"porselen","label_nb":"Porselen"},{"value":"stentoy","label_nb":"Stentøy"},{"value":"glass","label_nb":"Glass"},{"value":"rustfritt_stal","label_nb":"Rustfritt stål"}]', 1),
  ('servise-og-bestikk', 'piece_count', 'Antall deler', 'number', NULL, NULL, 2),
  ('oppbevaring-og-rengjoring', 'type', 'Type', 'text', NULL, NULL, 1),

  ('vegg-kunst-og-plakater', 'style', 'Stil', 'text', NULL, NULL, 1),
  ('speil', 'style', 'Stil', 'text', NULL, NULL, 1),
  ('vaser-og-potter', 'material', 'Materiale', 'text', NULL, NULL, 1),
  ('lys-og-lysestaker', 'material', 'Materiale', 'text', NULL, NULL, 1),

  -- Hus og hage
  ('handverktoy', 'tool_type', 'Type', 'text', NULL, NULL, 1),
  ('handverktoy', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('elektroverktoy', 'power_source', 'Strømkilde', 'select', NULL,
    '[{"value":"batteri","label_nb":"Batteri"},{"value":"strom","label_nb":"Strøm"}]', 1),
  ('elektroverktoy', 'voltage_v', 'Spenning', 'number', 'V', NULL, 2),
  ('elektroverktoy', 'brand', 'Merke', 'text', NULL, NULL, 3),
  ('maleverktoy', 'tool_type', 'Type', 'text', NULL, NULL, 1),
  ('maleverktoy', 'brand', 'Merke', 'text', NULL, NULL, 2),

  ('byggematerialer', 'material_type', 'Materialtype', 'text', NULL, NULL, 1),
  ('maling-og-overflate', 'color', 'Farge', 'text', NULL, NULL, 1),
  ('maling-og-overflate', 'finish', 'Finish', 'select', NULL,
    '[{"value":"matt","label_nb":"Matt"},{"value":"silke","label_nb":"Silke"},{"value":"blank","label_nb":"Blank"}]', 2),
  ('ror-og-elektro', 'component_type', 'Type', 'text', NULL, NULL, 1),

  ('hagemobler', 'material', 'Materiale', 'select', NULL,
    '[{"value":"tre","label_nb":"Tre"},{"value":"aluminium","label_nb":"Aluminium"},{"value":"rattan","label_nb":"Rattan"},{"value":"plast","label_nb":"Plast"}]', 1),
  ('hagemobler', 'seats_count', 'Antall seter', 'number', NULL, NULL, 2),
  ('grill', 'fuel_type', 'Brenseltype', 'select', NULL,
    '[{"value":"gass","label_nb":"Gass"},{"value":"kull","label_nb":"Kull"},{"value":"elektrisk","label_nb":"Elektrisk"},{"value":"pellets","label_nb":"Pellets"}]', 1),
  ('grill', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('planter-og-jord', 'plant_type', 'Type', 'select', NULL,
    '[{"value":"innendors","label_nb":"Innendørs"},{"value":"utendors","label_nb":"Utendørs"},{"value":"stauder","label_nb":"Stauder"},{"value":"busker","label_nb":"Busker"}]', 1),
  ('hageredskap', 'tool_type', 'Type', 'text', NULL, NULL, 1),
  ('hageredskap', 'brand', 'Merke', 'text', NULL, NULL, 2),

  ('stillas-og-stige', 'max_height_m', 'Maks høyde', 'number', 'm', NULL, 1),
  ('stillas-og-stige', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('verneutstyr', 'equipment_type', 'Type', 'text', NULL, NULL, 1),

  ('handverkertjenester', 'service_area', 'Tjenesteområde', 'text', NULL, NULL, 1),
  ('flyttehjelp', 'service_area', 'Tjenesteområde', 'text', NULL, NULL, 1),
  ('renholdstjenester', 'service_area', 'Tjenesteområde', 'text', NULL, NULL, 1),
  ('undervisning', 'service_area', 'Fagområde', 'text', NULL, NULL, 1),

  -- Sport
  ('treningsutstyr', 'equipment_type', 'Type', 'text', NULL, NULL, 1),
  ('treningsutstyr', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('vekter-og-styrke', 'weight_kg', 'Vekt', 'number', 'kg', NULL, 1),
  ('vekter-og-styrke', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('yoga-og-pilates', 'equipment_type', 'Type', 'text', NULL, NULL, 1),

  ('sykkel-leaf', 'bike_type', 'Type', 'select', NULL,
    '[{"value":"el_sykkel","label_nb":"El-sykkel"},{"value":"terrengsykkel","label_nb":"Terrengsykkel"},{"value":"racersykkel","label_nb":"Racersykkel"},{"value":"bysykkel","label_nb":"Bysykkel"}]', 1),
  ('sykkel-leaf', 'frame_size_cm', 'Rammestørrelse', 'number', 'cm', NULL, 2),
  ('sykkel-leaf', 'brand', 'Merke', 'text', NULL, NULL, 3),
  ('sykkeltilbehor', 'accessory_type', 'Type', 'text', NULL, NULL, 1),
  ('sykkelklaer', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('sykkelklaer', 'brand', 'Merke', 'text', NULL, NULL, 2),

  ('fotball', 'size', 'Størrelse', 'text', NULL, NULL, 1),
  ('fotball', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('handball', 'size', 'Størrelse', 'text', NULL, NULL, 1),
  ('handball', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('basketball', 'size', 'Størrelse', 'text', NULL, NULL, 1),
  ('basketball', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('tennis-og-padel', 'equipment_type', 'Type', 'text', NULL, NULL, 1),
  ('tennis-og-padel', 'brand', 'Merke', 'text', NULL, NULL, 2),

  ('ski-og-snowboard', 'ski_length_cm', 'Lengde', 'number', 'cm', NULL, 1),
  ('ski-og-snowboard', 'ski_type', 'Type', 'select', NULL,
    '[{"value":"alpint","label_nb":"Alpint"},{"value":"langrenn","label_nb":"Langrenn"},{"value":"topptur","label_nb":"Topptur"},{"value":"snowboard","label_nb":"Snowboard"}]', 2),
  ('ski-og-snowboard', 'brand', 'Merke', 'text', NULL, NULL, 3),
  ('skisko-og-bindinger', 'boot_size_eu', 'Størrelse (EU)', 'number', NULL, NULL, 1),
  ('skisko-og-bindinger', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('vinterklaer', 'clothing_size', 'Størrelse', 'select', NULL,
    '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"},{"value":"xxl","label_nb":"XXL"}]', 1),
  ('vinterklaer', 'brand', 'Merke', 'text', NULL, NULL, 2),

  ('fisking', 'fishing_type', 'Type', 'select', NULL,
    '[{"value":"havfiske","label_nb":"Havfiske"},{"value":"ferskvann","label_nb":"Ferskvann"},{"value":"fluefiske","label_nb":"Fluefiske"}]', 1),
  ('camping', 'tent_capacity', 'Kapasitet', 'number', 'personer', NULL, 1),
  ('klatring', 'equipment_type', 'Type', 'text', NULL, NULL, 1),
  ('telt', 'capacity', 'Kapasitet', 'number', 'personer', NULL, 1),
  ('sittemobler', 'capacity', 'Antall seter', 'number', NULL, NULL, 1),

  -- Dyr og utstyr
  ('hundemat', 'food_type', 'Type', 'select', NULL,
    '[{"value":"torrfor","label_nb":"Tørrfôr"},{"value":"vatfor","label_nb":"Våtfôr"}]', 1),
  ('hundemat', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('hundeutstyr', 'animal_size', 'Størrelse', 'select', NULL,
    '[{"value":"liten","label_nb":"Liten"},{"value":"medium","label_nb":"Medium"},{"value":"stor","label_nb":"Stor"}]', 1),
  ('hundeutstyr', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('hundeseng-og-transport', 'animal_size', 'Størrelse', 'select', NULL,
    '[{"value":"liten","label_nb":"Liten"},{"value":"medium","label_nb":"Medium"},{"value":"stor","label_nb":"Stor"}]', 1),
  ('hundeseng-og-transport', 'brand', 'Merke', 'text', NULL, NULL, 2),

  ('kattemat', 'food_type', 'Type', 'select', NULL,
    '[{"value":"torrfor","label_nb":"Tørrfôr"},{"value":"vatfor","label_nb":"Våtfôr"}]', 1),
  ('kattemat', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('katteutstyr', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('kattekasse', 'type', 'Type', 'text', NULL, NULL, 1),

  ('for-og-utstyr-smadyr', 'animal_type', 'Dyretype', 'select', NULL,
    '[{"value":"kanin","label_nb":"Kanin"},{"value":"marsvin","label_nb":"Marsvin"},{"value":"hamster","label_nb":"Hamster"},{"value":"annet","label_nb":"Annet"}]', 1),

  ('fuglebur-og-for', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('akvarium-og-tilbehor', 'volume_liter', 'Volum', 'number', 'liter', NULL, 1),

  ('hesteutstyr', 'type', 'Type', 'text', NULL, NULL, 1),
  ('hestefor', 'brand', 'Merke', 'text', NULL, NULL, 1),

  -- Bil og MC
  ('personbil', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('personbil', 'model', 'Modell', 'text', NULL, NULL, 2),
  ('personbil', 'year', 'Årsmodell', 'number', NULL, NULL, 3),
  ('personbil', 'mileage_km', 'Kilometerstand', 'number', 'km', NULL, 4),
  ('personbil', 'fuel_type', 'Drivstoff', 'select', NULL,
    '[{"value":"bensin","label_nb":"Bensin"},{"value":"diesel","label_nb":"Diesel"},{"value":"el","label_nb":"El"},{"value":"hybrid","label_nb":"Hybrid"}]', 5),
  ('personbil', 'transmission', 'Girkasse', 'select', NULL,
    '[{"value":"manuell","label_nb":"Manuell"},{"value":"automat","label_nb":"Automat"}]', 6),
  ('varebil', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('varebil', 'model', 'Modell', 'text', NULL, NULL, 2),
  ('varebil', 'year', 'Årsmodell', 'number', NULL, NULL, 3),
  ('varebil', 'mileage_km', 'Kilometerstand', 'number', 'km', NULL, 4),
  ('varebil', 'fuel_type', 'Drivstoff', 'select', NULL,
    '[{"value":"bensin","label_nb":"Bensin"},{"value":"diesel","label_nb":"Diesel"},{"value":"el","label_nb":"El"},{"value":"hybrid","label_nb":"Hybrid"}]', 5),
  ('varebil', 'transmission', 'Girkasse', 'select', NULL,
    '[{"value":"manuell","label_nb":"Manuell"},{"value":"automat","label_nb":"Automat"}]', 6),
  ('bobil-og-campingvogn', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('bobil-og-campingvogn', 'year', 'Årsmodell', 'number', NULL, NULL, 2),
  ('bobil-og-campingvogn', 'length_m', 'Lengde', 'number', 'm', NULL, 3),

  ('motorsykkel', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('motorsykkel', 'model', 'Modell', 'text', NULL, NULL, 2),
  ('motorsykkel', 'year', 'Årsmodell', 'number', NULL, NULL, 3),
  ('motorsykkel', 'engine_cc', 'Motorvolum', 'number', 'cc', NULL, 4),
  ('moped-og-scooter', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('moped-og-scooter', 'year', 'Årsmodell', 'number', NULL, NULL, 2),
  ('atv-og-snoscooter', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('atv-og-snoscooter', 'year', 'Årsmodell', 'number', NULL, NULL, 2),

  ('dekk-og-felg', 'dimension', 'Dimensjon', 'text', NULL, NULL, 1),
  ('dekk-og-felg', 'season', 'Sesong', 'select', NULL,
    '[{"value":"sommer","label_nb":"Sommer"},{"value":"vinter","label_nb":"Vinter"},{"value":"helar","label_nb":"Helår"}]', 2),
  ('bilstereo-og-elektronikk', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('bilstereo-og-elektronikk', 'component_type', 'Type', 'text', NULL, NULL, 2),
  ('reservedeler', 'part_type', 'Deltype', 'text', NULL, NULL, 1),
  ('reservedeler', 'compatible_model', 'Passer til modell', 'text', NULL, NULL, 2),
  ('tilhenger-leaf', 'max_load_kg', 'Maks last', 'number', 'kg', NULL, 1),

  -- Kunst
  ('malerier', 'art_style', 'Stil', 'select', NULL,
    '[{"value":"abstrakt","label_nb":"Abstrakt"},{"value":"landskap","label_nb":"Landskap"},{"value":"portrett","label_nb":"Portrett"},{"value":"moderne","label_nb":"Moderne"}]', 1),
  ('malerier', 'technique', 'Teknikk', 'select', NULL,
    '[{"value":"olje","label_nb":"Olje"},{"value":"akryl","label_nb":"Akryl"},{"value":"akvarell","label_nb":"Akvarell"}]', 2),
  ('malerier', 'signed', 'Signert', 'select', NULL,
    '[{"value":"ja","label_nb":"Ja"},{"value":"nei","label_nb":"Nei"}]', 3),
  ('litografier-og-fotokunst', 'art_style', 'Stil', 'text', NULL, NULL, 1),
  ('litografier-og-fotokunst', 'signed', 'Signert', 'select', NULL,
    '[{"value":"ja","label_nb":"Ja"},{"value":"nei","label_nb":"Nei"}]', 2),
  ('skulptur-og-keramikk-leaf', 'material', 'Materiale', 'text', NULL, NULL, 1),

  ('kunst-og-handverksmateriell', 'material_type', 'Materialtype', 'text', NULL, NULL, 1),
  ('brettspill-og-puslespill', 'player_count', 'Antall spillere', 'text', NULL, NULL, 1),
  ('brettspill-og-puslespill', 'age_group', 'Aldersgruppe', 'select', NULL,
    '[{"value":"0-3","label_nb":"0-3 år"},{"value":"4-7","label_nb":"4-7 år"},{"value":"8-12","label_nb":"8-12 år"},{"value":"13+","label_nb":"13+ år"}]', 2),

  ('musikkinstrumenter', 'instrument_type', 'Instrumenttype', 'select', NULL,
    '[{"value":"gitar","label_nb":"Gitar"},{"value":"piano","label_nb":"Piano"},{"value":"trommer","label_nb":"Trommer"},{"value":"blas","label_nb":"Blåseinstrument"}]', 1),
  ('musikkinstrumenter', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('vinyl-og-cd', 'genre', 'Sjanger', 'text', NULL, NULL, 1),

  ('boker', 'language', 'Språk', 'text', NULL, NULL, 1),
  ('boker', 'genre', 'Sjanger', 'text', NULL, NULL, 2),
  ('boker', 'condition', 'Tilstand', 'select', NULL,
    '[{"value":"nytt","label_nb":"Nytt"},{"value":"som_nytt","label_nb":"Som nytt"},{"value":"bra","label_nb":"Bra"},{"value":"slitt","label_nb":"Slitt"}]', 3),
  ('tegneserier-og-dvd', 'genre', 'Sjanger', 'text', NULL, NULL, 1),

  ('mynter-og-frimerker', 'category_type', 'Type', 'text', NULL, NULL, 1),
  ('mynter-og-frimerker', 'era', 'Tidsperiode', 'text', NULL, NULL, 2),
  ('antikviteter', 'era', 'Tidsperiode', 'text', NULL, NULL, 1),
  ('figurer-og-samlekort', 'category_type', 'Type', 'text', NULL, NULL, 1),

  -- Barn og baby
  ('barnevogn', 'type', 'Type', 'select', NULL,
    '[{"value":"kombivogn","label_nb":"Kombivogn"},{"value":"sportsvogn","label_nb":"Sportsvogn"},{"value":"trillebag","label_nb":"Trillebag"}]', 1),
  ('barnevogn', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('barnevogn', 'age_months', 'Alder', 'number', 'måneder', NULL, 3),
  ('bilstol', 'group', 'Vektgruppe', 'select', NULL,
    '[{"value":"0-13","label_nb":"0-13 kg"},{"value":"9-18","label_nb":"9-18 kg"},{"value":"15-36","label_nb":"15-36 kg"}]', 1),
  ('bilstol', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('baereseler', 'brand', 'Merke', 'text', NULL, NULL, 1),

  ('barneseng', 'bed_size', 'Størrelse', 'select', NULL,
    '[{"value":"60x120","label_nb":"60x120"},{"value":"70x140","label_nb":"70x140"}]', 1),
  ('barneseng', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('stellebord-og-oppbevaring', 'brand', 'Merke', 'text', NULL, NULL, 1),

  ('leker', 'age_group', 'Aldersgruppe', 'select', NULL,
    '[{"value":"0-1","label_nb":"0-1 år"},{"value":"1-3","label_nb":"1-3 år"},{"value":"3-6","label_nb":"3-6 år"},{"value":"6+","label_nb":"6+ år"}]', 1),
  ('leker', 'brand', 'Merke', 'text', NULL, NULL, 2),
  ('puslespill-og-boker-barn', 'age_group', 'Aldersgruppe', 'select', NULL,
    '[{"value":"0-1","label_nb":"0-1 år"},{"value":"1-3","label_nb":"1-3 år"},{"value":"3-6","label_nb":"3-6 år"},{"value":"6+","label_nb":"6+ år"}]', 1),

  ('ammeutstyr-og-tateflasker', 'brand', 'Merke', 'text', NULL, NULL, 1),
  ('barnemat-og-utstyr', 'brand', 'Merke', 'text', NULL, NULL, 1),

  -- Båt
  ('motorbat', 'length_ft', 'Lengde', 'number', 'fot', NULL, 1),
  ('motorbat', 'year', 'Årsmodell', 'number', NULL, NULL, 2),
  ('motorbat', 'brand', 'Merke', 'text', NULL, NULL, 3),
  ('motorbat', 'material', 'Materiale', 'select', NULL,
    '[{"value":"glassfiber","label_nb":"Glassfiber"},{"value":"aluminium","label_nb":"Aluminium"},{"value":"tre","label_nb":"Tre"}]', 4),
  ('seilbat', 'length_ft', 'Lengde', 'number', 'fot', NULL, 1),
  ('seilbat', 'year', 'Årsmodell', 'number', NULL, NULL, 2),
  ('seilbat', 'brand', 'Merke', 'text', NULL, NULL, 3),
  ('seilbat', 'material', 'Materiale', 'select', NULL,
    '[{"value":"glassfiber","label_nb":"Glassfiber"},{"value":"aluminium","label_nb":"Aluminium"},{"value":"tre","label_nb":"Tre"}]', 4),
  ('jolle-og-gummibat', 'length_ft', 'Lengde', 'number', 'fot', NULL, 1),
  ('jolle-og-gummibat', 'material', 'Materiale', 'select', NULL,
    '[{"value":"glassfiber","label_nb":"Glassfiber"},{"value":"aluminium","label_nb":"Aluminium"},{"value":"gummi","label_nb":"Gummi"}]', 2),

  ('batmotorer', 'engine_type', 'Motortype', 'select', NULL,
    '[{"value":"pahengsmotor","label_nb":"Påhengsmotor"},{"value":"innenbordsmotor","label_nb":"Innenbordsmotor"}]', 1),
  ('batmotorer', 'power_hp', 'Effekt', 'number', 'hk', NULL, 2),
  ('batmotorer', 'brand', 'Merke', 'text', NULL, NULL, 3),

  ('battilbehor-og-utstyr', 'accessory_type', 'Type', 'text', NULL, NULL, 1),
  ('sikkerhetsutstyr-og-fortoyning', 'equipment_type', 'Type', 'text', NULL, NULL, 1),
  ('vannsport-og-batutstyr', 'equipment_type', 'Type', 'select', NULL,
    '[{"value":"sup","label_nb":"SUP"},{"value":"vannski","label_nb":"Vannski"},{"value":"wakeboard","label_nb":"Wakeboard"},{"value":"kajakk","label_nb":"Kajakk"}]', 1)
) AS f(category_slug, key, label_nb, type, unit, options, sort_order)
JOIN public.categories c ON c.slug = f.category_slug
ON CONFLICT (category_id, key) DO NOTHING;
