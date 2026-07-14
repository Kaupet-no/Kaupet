-- Undertittel for kjøretøy-annonser (utstyrsvariant/modellkode/annen kort
-- info) — se src/features/listing-creation/field-groups/title-photos.
ALTER TABLE public.listings
  ADD COLUMN subtitle text;

-- Bil og MC-treet må ha kjøretøyoppslaget (i category-attributes-steget)
-- FØR title-photos-steget, siden tittelen for disse kategoriene bygges
-- automatisk av Årsmodell/Merke/Modell hentet der. `title-photos` er ikke
-- lenger posisjonsfast (se field-groups/registry.ts), så rekkefølgen i
-- field_groups avgjør nå steg-rekkefølgen direkte.
UPDATE public.category_flows
SET field_groups = '{category-attributes,title-photos,condition,price,description-keywords,delivery-location,review-publish}'
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'bil-og-mc' AND parent_id IS NULL);
