-- «Favoritt solgt»-varsel skal ikke gå til kjøperen selv. listing_sales-raden
-- finnes allerede når listing_sales_sync_status setter status = 'sold'.
CREATE OR REPLACE FUNCTION public.listings_emit_sold_notifications() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status = 'sold' OR NEW.status <> 'sold' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.favorite_sold_notifications (user_id, listing_id)
  SELECT f.user_id, NEW.id
  FROM public.favorites f
  WHERE f.listing_id = NEW.id
    AND f.user_id <> NEW.seller_id
    AND NOT EXISTS (
      SELECT 1 FROM public.listing_sales s
      WHERE s.listing_id = NEW.id AND s.buyer_id = f.user_id
    )
  ON CONFLICT (user_id, listing_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Disse radene har til nå bare gått ut som push, aldri vist i appen (read_at
-- ble aldri satt). Når /varsler og bjella begynner å vise dem, skal ikke
-- historikken dukke opp som en bunke uleste varsler.
DELETE FROM public.favorite_sold_notifications n
USING public.listing_sales s
WHERE s.listing_id = n.listing_id AND s.buyer_id = n.user_id;

UPDATE public.favorite_sold_notifications
SET read_at = now()
WHERE read_at IS NULL;
