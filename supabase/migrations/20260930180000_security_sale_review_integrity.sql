BEGIN;

CREATE OR REPLACE FUNCTION public.user_reviews_validate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    VOLATILE
    SET search_path TO 'public'
    AS $$
DECLARE
  _sale record;
BEGIN
  SELECT seller_id, buyer_id INTO _sale
  FROM public.listing_sales WHERE listing_id = NEW.listing_id
  FOR UPDATE;
  IF _sale IS NULL THEN
    RAISE EXCEPTION 'Det finnes ingen bekreftet kjøper for denne annonsen';
  END IF;

  IF NEW.role = 'buyer' THEN
    IF _sale.buyer_id <> NEW.reviewer_id OR _sale.seller_id <> NEW.reviewee_id THEN
      RAISE EXCEPTION 'Vurderingen samsvarer ikke med salget';
    END IF;
  ELSE -- seller
    IF _sale.seller_id <> NEW.reviewer_id OR _sale.buyer_id <> NEW.reviewee_id THEN
      RAISE EXCEPTION 'Vurderingen samsvarer ikke med salget';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.user_reviews_validate() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.listing_sales_prevent_delete_with_reviews() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    VOLATILE
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_reviews WHERE listing_id = OLD.listing_id) THEN
    RAISE EXCEPTION 'Salget kan ikke angres etter at vurderinger er gitt'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.listing_sales_prevent_delete_with_reviews() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER listing_sales_prevent_delete_with_reviews_trigger
  BEFORE DELETE ON public.listing_sales
  FOR EACH ROW EXECUTE FUNCTION public.listing_sales_prevent_delete_with_reviews();

COMMIT;
