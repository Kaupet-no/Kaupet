-- Fyller hullene i kategoritreet som kom fram i gjennomgangen 2026-09-09.
--
-- Konvensjoner som følges her (lest ut av eksisterende rader):
--   * grupper har `icon`, blader har `icon = NULL`
--   * slug er ASCII-foldet (ø->o, æ->ae, å->a), samme som "stovsuger"
--   * sort_order går i tiere, og nye søsken legges etter de eksisterende
--   * foreldre slås opp på slug, ikke id, slik at migrasjonen gir samme
--     resultat i alle miljøer
--
-- Alt er ON CONFLICT (slug) DO NOTHING: migrasjonen skal kunne kjøre mot et
-- miljø der noen av kategoriene allerede er lagt inn manuelt fra admin.

-- 1. Nye grupper først — de er foreldre til blader i steg 2. ------------------

INSERT INTO public.categories (slug, name_nb, parent_id, sort_order, icon)
SELECT v.slug, v.name_nb, p.id, v.sort_order, v.icon
FROM (
  VALUES
    ('vannsport', 'Vannsport', 'sport', 70, 'Waves'),
    ('mikromobilitet', 'Mikromobilitet', 'sport', 80, 'Zap'),
    ('oppvarming', 'Oppvarming', 'hus-og-hage', 50, 'Flame')
) AS v(slug, name_nb, parent_slug, sort_order, icon)
JOIN public.categories p ON p.slug = v.parent_slug
ON CONFLICT (slug) DO NOTHING;

-- 2. Blader. ------------------------------------------------------------------

INSERT INTO public.categories (slug, name_nb, parent_id, sort_order, icon)
SELECT v.slug, v.name_nb, p.id, v.sort_order, NULL
FROM (
  VALUES
    -- Elektronikk: TV og lyd hadde bare TV og høyttalere, så en selger av
    -- hodetelefoner hadde ingen kategori å legge annonsen i.
    ('hodetelefoner-og-headset', 'Hodetelefoner og headset', 'tv-og-lyd', 30),
    ('hifi-og-forsterkere', 'HiFi og forsterkere', 'tv-og-lyd', 40),
    ('oppvaskmaskin', 'Oppvaskmaskin', 'hvitevarer', 50),
    ('mikrobolgeovn-og-ventilator', 'Mikrobølgeovn og ventilator', 'hvitevarer', 60),
    ('objektiv', 'Objektiv', 'foto-og-video', 40),
    -- Sport og friluft
    ('kajakk-og-kano', 'Kajakk og kano', 'vannsport', 10),
    ('sup-og-brett', 'SUP og brett', 'vannsport', 20),
    ('dykking-og-snorkling', 'Dykking og snorkling', 'vannsport', 30),
    ('elsparkesykkel', 'Elsparkesykkel', 'mikromobilitet', 10),
    ('elektrisk-skateboard-og-stahjuling', 'Elektrisk skateboard og ståhjuling', 'mikromobilitet', 20),
    ('jakt', 'Jakt', 'friluftsliv', 40),
    ('golf', 'Golf', 'ball-og-lagidrett', 50),
    -- Hobby og håndverk hadde én eneste underkategori.
    ('symaskin-og-tekstil', 'Symaskin og tekstil', 'hobby-og-handverk', 20),
    ('garn-og-strikking', 'Garn og strikking', 'hobby-og-handverk', 30),
    ('modellbygging', 'Modellbygging', 'hobby-og-handverk', 40),
    -- Interiør
    ('kontormobler', 'Kontormøbler', 'mobler', 60),
    -- Hus og hage
    ('gressklipper-og-hagemaskiner', 'Gressklipper og hagemaskiner', 'hage', 50),
    ('vedovn-og-peis', 'Vedovn og peis', 'oppvarming', 10),
    ('varmepumpe', 'Varmepumpe', 'oppvarming', 20),
    ('elektrisk-oppvarming', 'Elektrisk oppvarming', 'oppvarming', 30),
    -- Underholdning: studioutstyr er ikke et instrument.
    ('lyd-og-studioutstyr', 'Lyd- og studioutstyr', 'musikk', 30),
    -- Barn og baby: lagt under eksisterende grupper i stedet for som nye
    -- blader rett under hovedkategorien, slik at dybden forblir konsistent.
    ('barnegrind-og-babycall', 'Barnegrind og babycall', 'mobler-til-barnerom', 30),
    ('sparkesykkel-og-trehjulssykkel', 'Sparkesykkel og trehjulssykkel', 'lek-og-laering', 30),
    ('trampoline-og-husker', 'Trampoline og husker', 'lek-og-laering', 40),
    -- Samleobjekter
    ('militaria', 'Militaria', 'samleobjekter', 40),
    ('reklame-og-skilt', 'Reklame og skilt', 'samleobjekter', 50)
) AS v(slug, name_nb, parent_slug, sort_order)
JOIN public.categories p ON p.slug = v.parent_slug
ON CONFLICT (slug) DO NOTHING;

-- 3. Filtre for hodetelefoner. -----------------------------------------------
--
-- Kun Type er påkrevd. Søsken som "Soundbar og høyttalere" krever fire felt,
-- men gjennomgangen viste at antall obligatoriske felt er den største
-- friksjonen i annonseflyten — resten er derfor is_optional, og kan strammes
-- inn fra /admin/kategorier hvis dere heller vil ha full paritet.

INSERT INTO public.category_filters (
  category_id, key, label_nb, type, options, sort_order, is_primary, is_optional
)
SELECT c.id, v.key, v.label_nb, v.type, v.options::jsonb, v.sort_order, v.is_primary, v.is_optional
FROM (
  VALUES
    ('headphone_type', 'Type', 'select',
     '[{"value":"over_ear","label_nb":"Over-ear"},
       {"value":"on_ear","label_nb":"On-ear"},
       {"value":"in_ear","label_nb":"In-ear"},
       {"value":"true_wireless","label_nb":"Trådløse propper"},
       {"value":"gaming_headset","label_nb":"Gaming-headset"}]', 1, true, false),
    ('connectivity', 'Tilkobling', 'select',
     '[{"value":"bluetooth","label_nb":"Bluetooth"},
       {"value":"kablet","label_nb":"Kablet"},
       {"value":"begge","label_nb":"Både trådløs og kablet"}]', 2, true, true),
    -- NULL, ikke 'null': jsonb-skalaren null ville passert
    -- "WHERE options IS NOT NULL" og brutt spørringer som forventer en array.
    ('noise_cancelling', 'Aktiv støydemping', 'boolean', NULL, 3, false, true),
    ('brand', 'Merke', 'text', NULL, 4, true, true)
) AS v(key, label_nb, type, options, sort_order, is_primary, is_optional)
JOIN public.categories c ON c.slug = 'hodetelefoner-og-headset'
ON CONFLICT DO NOTHING;

-- 4. Synonymer. ---------------------------------------------------------------
--
-- Ordene folk faktisk skriver i kategorivelgeren, men som ikke står i noe
-- kategorinavn. Vises aldri i UI — se 20260909150000.

UPDATE public.categories AS c
SET search_synonyms = v.synonyms, updated_at = now()
FROM (
  VALUES
    ('hodetelefoner-og-headset', ARRAY['hodetelefon','hodetelefoner','headset','ørepropper','oreklokker','airpods','earbuds']),
    ('hifi-og-forsterkere', ARRAY['platespiller','forsterker','receiver','stereoanlegg','hifi']),
    ('soundbar-og-hoyttalere', ARRAY['høyttaler','hoyttaler','basshøyttaler','subwoofer']),
    ('skjerm', ARRAY['pc-skjerm','monitor','dataskjerm']),
    ('stovsuger', ARRAY['robotstøvsuger','robotstovsuger','støvsuger']),
    ('vaskemaskin-og-torketrommel', ARRAY['vaskemaskin','tørketrommel','torketrommel']),
    ('kjoleskap-og-fryser', ARRAY['kjøleskap','kjoleskap','fryser','fryseboks']),
    ('oppvaskmaskin', ARRAY['oppvaskmaskin','oppvask']),
    ('mikrobolgeovn-og-ventilator', ARRAY['mikrobølgeovn','mikro','ventilator','avtrekk','kjøkkenvifte']),
    ('dekk-og-felg', ARRAY['vinterdekk','sommerdekk','piggdekk','felger','dekk']),
    ('sykkel', ARRAY['barnesykkel','elsykkel','terrengsykkel','landeveissykkel']),
    ('elsparkesykkel', ARRAY['elsparkesykkel','sparkesykkel el','elscooter']),
    ('kajakk-og-kano', ARRAY['kajakk','kano','padling']),
    ('sup-og-brett', ARRAY['sup','paddleboard','surfebrett']),
    ('gressklipper-og-hagemaskiner', ARRAY['gressklipper','robotgressklipper','plenklipper','motorsag']),
    ('varmepumpe', ARRAY['varmepumpe','luft til luft']),
    ('vedovn-og-peis', ARRAY['vedovn','peis','peisovn']),
    ('kontormobler', ARRAY['skrivebord','kontorstol','hev senk']),
    ('symaskin-og-tekstil', ARRAY['symaskin','overlock','stoff']),
    ('garn-og-strikking', ARRAY['garn','strikkepinner','heklenål']),
    ('lyd-og-studioutstyr', ARRAY['mikrofon','mikser','lydkort','studio']),
    ('objektiv', ARRAY['objektiv','linse','zoomobjektiv']),
    ('trampoline-og-husker', ARRAY['trampoline','husk','lekestativ']),
    ('barnegrind-og-babycall', ARRAY['barnegrind','babycall','sikkerhetsgrind'])
) AS v(slug, synonyms)
WHERE c.slug = v.slug;
