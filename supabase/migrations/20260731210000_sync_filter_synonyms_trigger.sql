-- Keeps filter_synonyms' auto-generated rows (is_generated = true) in sync
-- with category_filters.options/type/label_nb automatically, for ANY future
-- edit — not just the one-off seedings done by earlier migrations. This is
-- what makes Fase 2.6's "promote Merke from text to select" admin action
-- (and any future admin edit to a select/multiselect/boolean filter)
-- immediately searchable, without a developer having to remember to also
-- write a synonym-seeding migration by hand each time.
--
-- Hand-curated synonyms (is_generated = false, added via the
-- FilterSynonymsDialog admin UI) are untouched by this trigger.
CREATE OR REPLACE FUNCTION public.sync_filter_synonyms_from_options()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.filter_synonyms
  WHERE category_filter_id = NEW.id AND is_generated = true;

  IF NEW.type IN ('select', 'multiselect') THEN
    INSERT INTO public.filter_synonyms (category_filter_id, option_value, phrase, is_generated)
    SELECT NEW.id, opt->>'value', lower(opt->>'label_nb'), true
    FROM jsonb_array_elements(coalesce(NEW.options, '[]'::jsonb)) opt
    WHERE trim(coalesce(opt->>'label_nb', '')) <> ''
    ON CONFLICT (category_filter_id, option_value, phrase) DO NOTHING;
  ELSIF NEW.type = 'boolean' THEN
    INSERT INTO public.filter_synonyms (category_filter_id, option_value, phrase, is_generated)
    VALUES (NEW.id, NULL, lower(NEW.label_nb), true)
    ON CONFLICT (category_filter_id, option_value, phrase) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS category_filters_sync_synonyms ON public.category_filters;
CREATE TRIGGER category_filters_sync_synonyms
AFTER INSERT OR UPDATE OF options, type, label_nb ON public.category_filters
FOR EACH ROW EXECUTE FUNCTION public.sync_filter_synonyms_from_options();
