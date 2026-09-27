-- Fritekst må finne visningsverdier i attributter, også når lagret verdi er
-- en kode (color=red vises som «Rød»). Begge søke-RPC-ene bruker samme vektor.
CREATE OR REPLACE FUNCTION public.listings_search_vector_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  body_type_hint text;
  lookup_color text;
  attribute_text text;
  option_labels text;
BEGIN
  BEGIN
    body_type_hint := (NEW.attributes->>'vehicle_lookup')::jsonb ->> 'body_type_hint';
    lookup_color := (NEW.attributes->>'vehicle_lookup')::jsonb ->> 'color';
  EXCEPTION WHEN OTHERS THEN
    body_type_hint := NULL;
    lookup_color := NULL;
  END;

  SELECT string_agg(value, ' ') INTO attribute_text
  FROM jsonb_each_text(coalesce(NEW.attributes, '{}'::jsonb)) AS a(key, value)
  WHERE key <> 'vehicle_lookup';

  WITH RECURSIVE category_ancestors AS (
    SELECT id, parent_id FROM public.categories WHERE id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id
    FROM public.categories c
    JOIN category_ancestors a ON c.id = a.parent_id
  )
  SELECT string_agg(opt->>'label_nb', ' ') INTO option_labels
  FROM jsonb_each_text(coalesce(NEW.attributes, '{}'::jsonb)) AS a(key, value)
  JOIN public.category_filters cf ON cf.key = a.key
    AND cf.category_id IN (SELECT id FROM category_ancestors)
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(cf.options, '[]'::jsonb)) opt
  WHERE opt->>'value' = a.value
    OR (jsonb_typeof(NEW.attributes->a.key) = 'array'
      AND NEW.attributes->a.key ? (opt->>'value'));

  NEW.search_vector :=
    setweight(to_tsvector('norwegian', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('norwegian', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('norwegian', coalesce(NEW.city, '')), 'C') ||
    setweight(to_tsvector('norwegian', coalesce(body_type_hint, '')), 'C') ||
    setweight(to_tsvector('norwegian', coalesce(lookup_color, '')), 'C') ||
    setweight(to_tsvector('norwegian', coalesce(attribute_text, '')), 'C') ||
    setweight(to_tsvector('norwegian', coalesce(option_labels, '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER listings_search_vector_update ON public.listings;
CREATE TRIGGER listings_search_vector_update
  BEFORE INSERT OR UPDATE OF title, description, city, category_id, attributes
  ON public.listings FOR EACH ROW
  EXECUTE FUNCTION public.listings_search_vector_trigger();

-- Oppdater eksisterende annonser uten å endre tidsstempelet brukerne ser.
ALTER TABLE public.listings DISABLE TRIGGER listings_set_updated_at;
UPDATE public.listings SET attributes = attributes
WHERE attributes IS NOT NULL AND attributes <> '{}'::jsonb;
ALTER TABLE public.listings ENABLE TRIGGER listings_set_updated_at;
