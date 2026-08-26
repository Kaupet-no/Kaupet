-- Varebil er en egen karosseritype i Bil. Minibuss hører til den separate
-- kategorien "Buss og minibuss" og skal ikke være et Bil-filtervalg.
UPDATE public.category_filters AS filter
SET options = (
  SELECT jsonb_agg(
    CASE
      WHEN option->>'value' = 'minibuss' THEN
        jsonb_set(
          jsonb_set(option, '{value}', to_jsonb('varebil'::text)),
          '{label_nb}',
          to_jsonb('Varebil'::text)
        )
      ELSE option
    END
    ORDER BY position
  )
  FROM jsonb_array_elements(filter.options) WITH ORDINALITY AS item(option, position)
)
WHERE filter.category_id = (SELECT id FROM public.categories WHERE slug = 'bil')
  AND filter.key = 'body_type'
  AND filter.options @> '[{"value":"minibuss","label_nb":"Minibuss/varebil"}]'::jsonb;

-- Retter eventuelle utkast/annonser som allerede fikk den tidligere, for brede
-- interne verdien fra registreringsoppslaget.
UPDATE public.listings AS listing
SET attributes = jsonb_set(listing.attributes, '{body_type}', to_jsonb('varebil'::text))
WHERE listing.category_id = (SELECT id FROM public.categories WHERE slug = 'bil')
  AND listing.attributes->>'body_type' = 'minibuss';
