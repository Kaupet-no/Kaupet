-- Kjøretøy-treet ("Bil og MC" og hele undertreet: Biler, MC og moped, Deler
-- og tilbehør, Tilhenger) skal vise kjøretøyoppslag-modulen i tillegg til de
-- vanlige kategoriegenskapene. Én rad på foreldrekategorien er nok — flyten
-- arves av alle underkategorier via effectiveFlowForCategory (samme
-- arve-mønster som category_filters).

INSERT INTO public.category_flows (category_id, modules)
SELECT c.id, ARRAY['vehicle-lookup', 'generic-attributes']
FROM public.categories c
WHERE c.slug = 'bil-og-mc' AND c.parent_id IS NULL
ON CONFLICT (category_id) DO UPDATE SET modules = EXCLUDED.modules;
