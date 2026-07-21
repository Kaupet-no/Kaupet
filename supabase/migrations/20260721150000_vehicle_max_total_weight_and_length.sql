-- Tillatt totalvekt og lengde er spesielt kjøpsrelevant for varebil, bobil,
-- campingvogn og tilhenger (nyttelast/kapasitet og garasje-/parkeringsplass),
-- på en måte de ikke er for personbil/MC/moped/ATV — så disse to feltene
-- legges kun til for de fire kategoriene. `campingvogn` fikk allerede
-- `length_m` i 20260721120000_split_bobil_campingvogn_leaf.sql (den gang som
-- et rent manuelt felt); `max_total_weight_kg` er nytt der også. Verdiene
-- hentes nå fra Statens vegvesen-oppslaget når tilgjengelig (se
-- vehicle-lookup.server.ts) og kan bekreftes/rettes av selger i
-- vehicle-confirm-steget, som ethvert annet SVV-hentet felt.
insert into public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
select c.id, f.key, f.label_nb, f.type, f.unit, f.options::jsonb, f.sort_order
from (values
  ('varebil', 'max_total_weight_kg', 'Tillatt totalvekt', 'number', 'kg', null, 20),
  ('varebil', 'length_m', 'Lengde', 'number', 'm', null, 21),
  ('bobil', 'max_total_weight_kg', 'Tillatt totalvekt', 'number', 'kg', null, 19),
  ('bobil', 'length_m', 'Lengde', 'number', 'm', null, 20),
  ('campingvogn', 'max_total_weight_kg', 'Tillatt totalvekt', 'number', 'kg', null, 11),
  ('tilhenger-leaf', 'max_total_weight_kg', 'Tillatt totalvekt', 'number', 'kg', null, 7),
  ('tilhenger-leaf', 'length_m', 'Lengde', 'number', 'm', null, 8)
) as f(slug, key, label_nb, type, unit, options, sort_order)
join public.categories c on c.slug = f.slug
where not exists (
  select 1 from public.category_filters cf where cf.category_id = c.id and cf.key = f.key
);
