-- Expand category tree: rename vehicle category to parts/accessories only,
-- add missing top-level categories, and seed subcategories (parent_id) for all.
-- No vehicles (cars/MC/boats) for sale — only parts, accessories and equipment.

-- 1. Repurpose "Biler og MC" -> parts/accessories only (keeps existing listing references intact)
UPDATE public.categories
SET slug = 'bildeler-og-tilbehor',
    name_nb = 'Bildeler og bilrekvisita',
    icon = 'Wrench'
WHERE slug = 'biler-og-mc';

-- 2. New top-level categories
INSERT INTO public.categories (slug, name_nb, sort_order, icon) VALUES
  ('boker-film-og-musikk', 'Bøker, film og musikk', 120, 'BookOpen'),
  ('kjaeledyr-og-dyreutstyr', 'Kjæledyr og dyreutstyr', 130, 'Dog'),
  ('helse-og-skjonnhet', 'Helse og skjønnhet', 140, 'HeartPulse'),
  ('tjenester', 'Tjenester', 150, 'Handshake');

-- 3. Subcategories (parent looked up by slug, so this is safe to re-run after step 1/2)
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT v.slug, v.name_nb, v.sort_order, p.id
FROM (VALUES
  -- Møbler og interiør
  ('sofaer', 'Sofaer', 1, 'mobler-og-interior'),
  ('spisebord-og-stoler', 'Spisebord og stoler', 2, 'mobler-og-interior'),
  ('senger-og-sengetoy', 'Senger og sengetøy', 3, 'mobler-og-interior'),
  ('oppbevaring-og-hyller', 'Oppbevaring og hyller', 4, 'mobler-og-interior'),
  ('belysning', 'Belysning', 5, 'mobler-og-interior'),
  ('tepper', 'Tepper', 6, 'mobler-og-interior'),
  ('speil', 'Speil', 7, 'mobler-og-interior'),
  ('kontormobler', 'Kontormøbler', 8, 'mobler-og-interior'),

  -- Elektronikk
  ('mobiltelefon', 'Mobiltelefon', 1, 'elektronikk'),
  ('data-og-laptop', 'Datamaskin og laptop', 2, 'elektronikk'),
  ('tv-og-lyd', 'TV og lyd', 3, 'elektronikk'),
  ('foto-og-video', 'Foto og video', 4, 'elektronikk'),
  ('spillkonsoller', 'Spillkonsoller', 5, 'elektronikk'),
  ('smartklokker', 'Smartklokker og wearables', 6, 'elektronikk'),
  ('hvitevarer', 'Hvitevarer', 7, 'elektronikk'),
  ('nettverk-og-tilbehor', 'Nettverk og tilbehør', 8, 'elektronikk'),

  -- Klær og mote
  ('dameklaer', 'Dameklær', 1, 'klar-og-mote'),
  ('herreklaer', 'Herreklær', 2, 'klar-og-mote'),
  ('barneklaer', 'Barneklær', 3, 'klar-og-mote'),
  ('sko', 'Sko', 4, 'klar-og-mote'),
  ('vesker', 'Vesker', 5, 'klar-og-mote'),
  ('smykker-og-klokker', 'Smykker og klokker', 6, 'klar-og-mote'),
  ('sportsklaer', 'Sportsklær', 7, 'klar-og-mote'),
  ('vintage-og-merkeklaer', 'Vintage og merkeklær', 8, 'klar-og-mote'),

  -- Barn og baby
  ('barnevogner', 'Barnevogner', 1, 'barn-og-baby'),
  ('bilstoler', 'Bilstoler', 2, 'barn-og-baby'),
  ('leketoy', 'Leketøy', 3, 'barn-og-baby'),
  ('babyutstyr', 'Babyutstyr', 4, 'barn-og-baby'),
  ('skoleutstyr', 'Skolesekker og skoleutstyr', 5, 'barn-og-baby'),

  -- Sport og friluft
  ('sykler', 'Sykler', 1, 'sport-og-friluft'),
  ('ski-og-snowboard', 'Ski og snowboard', 2, 'sport-og-friluft'),
  ('trening-og-fitness', 'Trening og fitness', 3, 'sport-og-friluft'),
  ('camping-og-friluft', 'Camping og friluft', 4, 'sport-og-friluft'),
  ('fiskeutstyr', 'Fiskeutstyr', 5, 'sport-og-friluft'),
  ('klatreutstyr', 'Klatreutstyr', 6, 'sport-og-friluft'),
  ('vannsport-og-batutstyr', 'Vannsport og båtutstyr', 7, 'sport-og-friluft'),
  ('ballsport', 'Ballsport', 8, 'sport-og-friluft'),

  -- Hage og utemiljø
  ('plen-og-hageredskap', 'Plen og hageredskap', 1, 'hage-og-utemiljo'),
  ('drivhus-og-utebod', 'Drivhus og utebod', 2, 'hage-og-utemiljo'),
  ('grill', 'Grill', 3, 'hage-og-utemiljo'),
  ('utepynt-og-planter', 'Utepynt og planter', 4, 'hage-og-utemiljo'),
  ('basseng-og-spa', 'Basseng og spa', 5, 'hage-og-utemiljo'),
  ('hagemobler', 'Hagemøbler', 6, 'hage-og-utemiljo'),

  -- Verktøy og byggevarer
  ('handverktoy', 'Håndverktøy', 1, 'verktoy-og-byggvarer'),
  ('elektroverktoy', 'Elektroverktøy', 2, 'verktoy-og-byggvarer'),
  ('byggematerialer', 'Byggematerialer', 3, 'verktoy-og-byggvarer'),
  ('maling-og-overflate', 'Maling og overflate', 4, 'verktoy-og-byggvarer'),
  ('ror-og-elektro', 'Rørlegger- og elektroutstyr', 5, 'verktoy-og-byggvarer'),
  ('stillas-og-stige', 'Stillas og stige', 6, 'verktoy-og-byggvarer'),

  -- Hobby, fritid og underholdning
  ('brettspill-og-puslespill', 'Brettspill og puslespill', 1, 'hobby-fritid-og-underholdning'),
  ('kunst-og-handverk', 'Kunst og håndverk', 2, 'hobby-fritid-og-underholdning'),
  ('musikkinstrumenter', 'Musikkinstrumenter og lydutstyr', 3, 'hobby-fritid-og-underholdning'),
  ('samleobjekter', 'Samleobjekter', 4, 'hobby-fritid-og-underholdning'),
  ('festivalutstyr', 'Festivalutstyr', 5, 'hobby-fritid-og-underholdning'),

  -- Kjøkken og husholdning
  ('kjokkenutstyr', 'Kjøkkenutstyr', 1, 'kjokken-og-husholdning'),
  ('servise-og-bestikk', 'Servise og bestikk', 2, 'kjokken-og-husholdning'),
  ('husholdningsapparater', 'Husholdningsapparater', 3, 'kjokken-og-husholdning'),
  ('oppbevaring-husholdning', 'Oppbevaring og organisering', 4, 'kjokken-og-husholdning'),
  ('rengjoring', 'Rengjøring', 5, 'kjokken-og-husholdning'),

  -- Antikviteter og kunst
  ('antikke-mobler', 'Antikke møbler', 1, 'antikviteter-og-kunst'),
  ('malerier-og-kunst', 'Malerier og kunst', 2, 'antikviteter-og-kunst'),
  ('klokker-antikk', 'Klokker', 3, 'antikviteter-og-kunst'),
  ('porselen-og-glass', 'Porselen og glass', 4, 'antikviteter-og-kunst'),
  ('mynter-og-sedler', 'Mynter og sedler', 5, 'antikviteter-og-kunst'),

  -- Bildeler og bilrekvisita (renamed from Biler og MC)
  ('bildeler', 'Bildeler', 1, 'bildeler-og-tilbehor'),
  ('dekk-og-felger', 'Dekk og felger', 2, 'bildeler-og-tilbehor'),
  ('bilstereo-og-elektronikk', 'Bilstereo og elektronikk', 3, 'bildeler-og-tilbehor'),
  ('tilhenger-og-hengerutstyr', 'Tilhenger og hengerutstyr', 4, 'bildeler-og-tilbehor'),
  ('bilverktoy', 'Bilverktøy og diagnoseutstyr', 5, 'bildeler-og-tilbehor'),
  ('mc-deler-og-utstyr', 'MC-deler og -utstyr', 6, 'bildeler-og-tilbehor'),
  ('bilpleie-og-tilbehor', 'Bilpleie og tilbehør', 7, 'bildeler-og-tilbehor'),

  -- Bøker, film og musikk
  ('boker', 'Bøker', 1, 'boker-film-og-musikk'),
  ('tegneserier', 'Tegneserier', 2, 'boker-film-og-musikk'),
  ('vinyl-og-cd', 'Vinyl og CD', 3, 'boker-film-og-musikk'),
  ('dvd-og-blu-ray', 'DVD og Blu-ray', 4, 'boker-film-og-musikk'),

  -- Kjæledyr og dyreutstyr
  ('hundeutstyr', 'Hundeutstyr', 1, 'kjaeledyr-og-dyreutstyr'),
  ('katteutstyr', 'Katteutstyr', 2, 'kjaeledyr-og-dyreutstyr'),
  ('akvarium-og-terrarium', 'Akvarium og terrarium', 3, 'kjaeledyr-og-dyreutstyr'),
  ('dyremat', 'Dyremat', 4, 'kjaeledyr-og-dyreutstyr'),
  ('bur-og-smadyrutstyr', 'Bur og smådyrutstyr', 5, 'kjaeledyr-og-dyreutstyr'),

  -- Helse og skjønnhet
  ('sminke-og-hudpleie', 'Sminke og hudpleie', 1, 'helse-og-skjonnhet'),
  ('parfyme', 'Parfyme', 2, 'helse-og-skjonnhet'),
  ('treningsutstyr-helse', 'Treningsutstyr', 3, 'helse-og-skjonnhet'),
  ('velvaere', 'Velvære og massasje', 4, 'helse-og-skjonnhet'),

  -- Tjenester
  ('handverkertjenester', 'Håndverkertjenester', 1, 'tjenester'),
  ('flyttehjelp', 'Flyttehjelp', 2, 'tjenester'),
  ('undervisning', 'Undervisning og leksehjelp', 3, 'tjenester'),
  ('renholdstjenester', 'Renholdstjenester', 4, 'tjenester')
) AS v(slug, name_nb, sort_order, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);
