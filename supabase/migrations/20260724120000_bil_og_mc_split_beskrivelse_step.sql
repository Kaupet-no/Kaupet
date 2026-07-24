-- UX audit finding: the "Beskrivelse" step (description-keywords) for Bil og
-- MC had grown to carry Tittel, Tilstand, Kilometerstand, Pris, Undertittel,
-- Beskrivelse, nøkkelord, kjente feil/mangler and vedlikeholdshistorikk all
-- on one page — 9+ data points, several required free-text fields. Splits
-- this into three focused steps: vehicle-facts (Tittel/Kilometerstand/
-- Pris/Undertittel), vehicle-condition (Tilstand/kjente feil-mangler/
-- vedlikeholdshistorikk) and description-keywords (ren beskrivelse+
-- nøkkelord, now identical to every other category's step). See
-- src/features/listing-creation/field-groups/vehicle-facts/index.tsx and
-- vehicle-condition/index.tsx.
UPDATE public.category_flows
SET field_groups = '{vehicle-registration,category-attributes,title-photos,vehicle-facts,vehicle-condition,description-keywords,delivery-location,review-publish}'
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL);
