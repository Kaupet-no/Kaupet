-- Bremser brukte to felter for samme plassering. Behold Plassering,
-- som også støtter "Foran og bak", og fjern det dupliserte Aksel-feltet.
DELETE FROM public.category_filters
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'bildeler-bremser')
  AND key = 'part_axle';
