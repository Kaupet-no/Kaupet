-- Tilhenger (tilhenger-leaf) skal ikke spørres om drivstoff/girkasse/hjuldrift/
-- effekt/antall seter (irrelevant for hengere) — i stedet spør vi om hengeren
-- er fritatt for periodisk kjøretøykontroll (EU-kontroll). Fritatt gjelder
-- hengere som ikke er registrert som Tempo 100 og har tillatt totalvekt t.o.m.
-- 3500 kg. Tempo 100-hengere t.o.m. 3500 kg må kontrolleres hvert 2. år fra de
-- er 4 år gamle, mens hengere over 3500 kg må kontrolleres årlig uansett.
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
SELECT c.id, 'eu_control_exempt', 'Fritatt for EU-kontroll', 'boolean', NULL, NULL, 7
FROM public.categories c
WHERE c.slug = 'tilhenger-leaf';
