-- Restrukturerer "Bil og MC": slår sammen Personbil+Varebil til én "Bil"
-- (avgiftskode blir et søkbart filter, ikke en kategoriskillelinje), flytter
-- ATV og Snøscooter opp ett nivå og splitter dem i to kategorier, oppretter
-- nye kategorier for tyngre kjøretøy (Lastebil og henger, Buss og minibuss,
-- Traktor og redskap, Anleggsmaskiner), og flytter "Deler og tilbehør" ut til
-- en egen hovedkategori "Bildeler og tilbehør" (det er ikke et registrert
-- kjøretøy, og hører ikke hjemme i et kjøretøy-tre).
--
-- Ingen annonser finnes ennå i disse kategoriene (produktet er ikke
-- lansert), så migrasjonen tar seg likevel bryet med å flytte
-- listings/wtb_listings for robusthet dersom det skulle finnes testdata.

-- ============================================================
-- 1. "Personbil" -> "Bil": gjenbruk raden (samme mønster som bobil/
--    campingvogn-splitten), flytt rett under bil-og-mc (ikke lenger under
--    "biler"), flytt varebil sine unike filtre og eventuelle annonser over,
--    og fjern varebil.
-- ============================================================

UPDATE public.categories
SET slug = 'bil',
    name_nb = 'Bil',
    parent_id = (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL),
    sort_order = 1
WHERE slug = 'personbil';

-- Varebils unike filtre (max_total_weight_kg, length_m) kopieres over på
-- "bil" hvis de ikke allerede finnes der (brand/model/year/mileage_km/
-- fuel_type/transmission er identiske på begge fra før og trengs ikke).
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT bil.id, cf.key, cf.label_nb, cf.type, cf.unit, cf.options, cf.sort_order, cf.is_primary
FROM public.category_filters cf
JOIN public.categories old ON old.id = cf.category_id AND old.slug = 'varebil'
JOIN public.categories bil ON bil.slug = 'bil'
WHERE NOT EXISTS (
  SELECT 1 FROM public.category_filters existing
  WHERE existing.category_id = bil.id AND existing.key = cf.key
);

UPDATE public.listings l
SET category_id = bil.id
FROM public.categories old, public.categories bil
WHERE old.slug = 'varebil' AND bil.slug = 'bil' AND l.category_id = old.id;

UPDATE public.wtb_listings l
SET category_id = bil.id
FROM public.categories old, public.categories bil
WHERE old.slug = 'varebil' AND bil.slug = 'bil' AND l.category_id = old.id;

-- Sletter varebil (category_filters på raden slettes automatisk via
-- ON DELETE CASCADE) og den nå tomme "biler"-beholderen.
DELETE FROM public.categories WHERE slug = 'varebil';
DELETE FROM public.categories WHERE slug = 'biler';

-- Avgiftskode (Personbil/Varebil) fra Statens vegvesen som eget, synlig og
-- søkbart filter på "Bil" — fylles automatisk fra kjøretøyoppslaget (se
-- vehicle-classification.ts) og vises som informativt felt i
-- vehicle-confirm-steget, som ethvert annet SVV-hentet felt.
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, 'avgiftskode_gruppe', 'Avgiftskode', 'select', NULL,
  '[
    {"value": "personbil", "label_nb": "Personbil"},
    {"value": "varebil", "label_nb": "Varebil"}
  ]'::jsonb,
  5, false
FROM public.categories c
WHERE c.slug = 'bil'
  AND NOT EXISTS (SELECT 1 FROM public.category_filters cf WHERE cf.category_id = c.id AND cf.key = 'avgiftskode_gruppe');

-- ============================================================
-- 1b. "Bobil og campingvogn"-beholderen (nivå 2) fjernes: "Bobil" og
--     "Campingvogn" (nivå 3) løftes til direkte barn av bil-og-mc, flatt
--     sammen med "Bil" og de andre kjøretøykategoriene, i stedet for nestet
--     under en egen wrapper-kategori.
-- ============================================================

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL)
WHERE slug IN ('bobil', 'campingvogn');

DELETE FROM public.categories WHERE slug = 'bobil-og-campingvogn';

-- ============================================================
-- 2. "ATV og snøscooter" -> "ATV" + ny "Snøscooter": begge rett under
--    bil-og-mc (ikke lenger under "mc-og-moped", som beholdes for
--    Motorsykkel/Moped og scooter).
-- ============================================================

UPDATE public.categories
SET slug = 'atv',
    name_nb = 'ATV',
    parent_id = (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL),
    sort_order = 6
WHERE slug = 'atv-og-snoscooter';

INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT 'snoscooter', 'Snøscooter', 7, c.id FROM public.categories c WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL;

-- Full spesifikasjonsparitet: snøscooter har motor, akkurat som ATV, så
-- filtersettet kopieres uendret (samme mønster som bobil -> campingvogn,
-- men uten campingvogns reduksjon siden begge er motoriserte).
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT sn.id, cf.key, cf.label_nb, cf.type, cf.unit, cf.options, cf.sort_order, cf.is_primary
FROM public.category_filters cf
JOIN public.categories atv ON atv.id = cf.category_id AND atv.slug = 'atv'
JOIN public.categories sn ON sn.slug = 'snoscooter';

-- ============================================================
-- 3. Nye kategorier for tyngre kjøretøy, direkte under bil-og-mc. Arver
--    vehicle-lookup-flyten og is_registered/registration_number-filtrene fra
--    bil-og-mc automatisk (samme arve-mønster som resten av treet).
--    Merke/modell er fritekst her (ingen egen vehicle_brands.category_group
--    for disse ennå), i motsetning til bil/mc/moped/atv/snøscooter.
-- ============================================================

INSERT INTO public.categories (slug, name_nb, sort_order, parent_id)
SELECT v.slug, v.name_nb, v.sort_order, c.id
FROM (VALUES
  ('lastebil-og-henger', 'Lastebil og henger', 8),
  ('buss-og-minibuss', 'Buss og minibuss', 9),
  ('traktor-og-redskap', 'Traktor og redskap', 10),
  ('anleggsmaskiner', 'Anleggsmaskiner', 11)
) AS v(slug, name_nb, sort_order)
CROSS JOIN public.categories c
WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL;

INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order, is_primary)
SELECT c.id, f.key, f.label_nb, f.type, f.unit, f.options::jsonb, f.sort_order, f.is_primary
FROM (VALUES
  ('lastebil-og-henger', 'brand', 'Merke', 'text', NULL, NULL, 1, true),
  ('lastebil-og-henger', 'model', 'Modell', 'text', NULL, NULL, 2, true),
  ('lastebil-og-henger', 'year', 'Årsmodell', 'number', NULL, NULL, 3, true),
  ('lastebil-og-henger', 'max_total_weight_kg', 'Tillatt totalvekt', 'number', 'kg', NULL, 4, true),
  ('lastebil-og-henger', 'length_m', 'Lengde', 'number', 'm', NULL, 5, false),
  ('buss-og-minibuss', 'brand', 'Merke', 'text', NULL, NULL, 1, true),
  ('buss-og-minibuss', 'model', 'Modell', 'text', NULL, NULL, 2, true),
  ('buss-og-minibuss', 'year', 'Årsmodell', 'number', NULL, NULL, 3, true),
  ('buss-og-minibuss', 'mileage_km', 'Kilometerstand', 'number', 'km', NULL, 4, true),
  ('buss-og-minibuss', 'seats', 'Antall seter', 'number', NULL, NULL, 5, true),
  ('buss-og-minibuss', 'max_total_weight_kg', 'Tillatt totalvekt', 'number', 'kg', NULL, 6, false),
  ('traktor-og-redskap', 'brand', 'Merke', 'text', NULL, NULL, 1, true),
  ('traktor-og-redskap', 'model', 'Modell', 'text', NULL, NULL, 2, true),
  ('traktor-og-redskap', 'year', 'Årsmodell', 'number', NULL, NULL, 3, true),
  ('traktor-og-redskap', 'hours_used', 'Driftstimer', 'number', 't', NULL, 4, true),
  ('anleggsmaskiner', 'brand', 'Merke', 'text', NULL, NULL, 1, true),
  ('anleggsmaskiner', 'model', 'Modell', 'text', NULL, NULL, 2, true),
  ('anleggsmaskiner', 'year', 'Årsmodell', 'number', NULL, NULL, 3, true),
  ('anleggsmaskiner', 'hours_used', 'Driftstimer', 'number', 't', NULL, 4, true),
  ('anleggsmaskiner', 'weight_kg', 'Egenvekt', 'number', 'kg', NULL, 5, false)
) AS f(slug, key, label_nb, type, unit, options, sort_order, is_primary)
JOIN public.categories c ON c.slug = f.slug;

-- ============================================================
-- 4. "Deler og tilbehør" ut av kjøretøy-treet og inn som egen hovedkategori
--    "Bildeler og tilbehør" (det er ikke et registrert kjøretøy). Barna
--    (Dekk og felg, Bilstereo og elektronikk, Reservedeler) flyttes uendret.
--    Ingen category_flows-rad opprettes for den nye roten, så den faller
--    tilbake til standardflyten i kode (ikke vehicle-lookup) — riktig, siden
--    delekategoriene aldri hadde egne kjøretøy-spesifikke filtre.
-- ============================================================

INSERT INTO public.categories (slug, name_nb, sort_order, parent_id, icon, color)
SELECT 'bildeler-og-tilbehor', 'Bildeler og tilbehør', old.sort_order, NULL, old.icon, old.color
FROM public.categories old
WHERE old.slug = 'deler-og-tilbehor' AND old.parent_id IS NOT NULL;

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'bildeler-og-tilbehor' AND parent_id IS NULL)
WHERE slug IN ('dekk-og-felg', 'bilstereo-og-elektronikk', 'reservedeler');

DELETE FROM public.categories WHERE slug = 'deler-og-tilbehor';

-- ============================================================
-- 5. Ryddige sort_order for gjenværende direkte barn av bil-og-mc.
-- ============================================================

UPDATE public.categories c
SET sort_order = v.sort_order
FROM (VALUES
  ('bil', 1),
  ('bobil', 2),
  ('campingvogn', 3),
  ('mc-og-moped', 4),
  ('atv', 6),
  ('snoscooter', 7),
  ('tilhenger', 8),
  ('lastebil-og-henger', 9),
  ('buss-og-minibuss', 10),
  ('traktor-og-redskap', 11),
  ('anleggsmaskiner', 12)
) AS v(slug, sort_order)
WHERE c.slug = v.slug;
