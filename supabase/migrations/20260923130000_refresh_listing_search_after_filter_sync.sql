-- Recalculate search_vector without touching the listing's visible updated_at.
DROP TRIGGER listings_search_vector_update ON public.listings;
CREATE TRIGGER listings_search_vector_update
  BEFORE INSERT OR UPDATE OF title, description, city, category_id, attributes, search_vector
  ON public.listings FOR EACH ROW
  EXECUTE FUNCTION public.listings_search_vector_trigger();

CREATE FUNCTION public.preserve_listing_updated_at_on_search_refresh() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF to_jsonb(NEW) - 'search_vector' - 'updated_at'
     = to_jsonb(OLD) - 'search_vector' - 'updated_at' THEN
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER zzz_listings_preserve_search_refresh_updated_at
  BEFORE UPDATE OF search_vector ON public.listings FOR EACH ROW
  EXECUTE FUNCTION public.preserve_listing_updated_at_on_search_refresh();

-- Category sync changes option labels without updating the listings they index.
CREATE FUNCTION public.refresh_listing_search_vector_after_filter_change() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (
    TG_OP = 'UPDATE'
    AND (OLD.category_id IS DISTINCT FROM NEW.category_id OR OLD.key IS DISTINCT FROM NEW.key)
  ) THEN
    WITH RECURSIVE descendants AS (
      SELECT id FROM public.categories WHERE id = OLD.category_id
      UNION ALL
      SELECT c.id FROM public.categories c JOIN descendants d ON c.parent_id = d.id
    )
    UPDATE public.listings
    SET search_vector = search_vector
    WHERE attributes ? OLD.key
      AND category_id IN (SELECT id FROM descendants);
  END IF;

  IF TG_OP <> 'DELETE' THEN
    WITH RECURSIVE descendants AS (
      SELECT id FROM public.categories WHERE id = NEW.category_id
      UNION ALL
      SELECT c.id FROM public.categories c JOIN descendants d ON c.parent_id = d.id
    )
    UPDATE public.listings
    SET search_vector = search_vector
    WHERE attributes ? NEW.key
      AND category_id IN (SELECT id FROM descendants);
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER category_filters_refresh_listing_search_insert
  AFTER INSERT ON public.category_filters FOR EACH ROW
  EXECUTE FUNCTION public.refresh_listing_search_vector_after_filter_change();

CREATE TRIGGER category_filters_refresh_listing_search_update
  AFTER UPDATE OF category_id, key, options ON public.category_filters FOR EACH ROW
  WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id
    OR OLD.key IS DISTINCT FROM NEW.key
    OR OLD.options IS DISTINCT FROM NEW.options)
  EXECUTE FUNCTION public.refresh_listing_search_vector_after_filter_change();

CREATE TRIGGER category_filters_refresh_listing_search_delete
  AFTER DELETE ON public.category_filters FOR EACH ROW
  EXECUTE FUNCTION public.refresh_listing_search_vector_after_filter_change();
