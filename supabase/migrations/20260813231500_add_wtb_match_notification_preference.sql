ALTER TABLE public.wtb_listings
  ADD COLUMN notify_matches boolean NOT NULL DEFAULT false;

-- WTB matching is the single notification source for purchase requests. It
-- already matches structured attributes and deduplicates per WTB/listing.
CREATE OR REPLACE FUNCTION public.match_listing_to_wtb_listings(_listing_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  l RECORD;
  m RECORD;
BEGIN
  SELECT * INTO l FROM public.listings WHERE id = _listing_id AND status = 'active';
  IF NOT FOUND THEN RETURN; END IF;

  FOR m IN
    SELECT * FROM public.compute_wtb_matches(
      l.category_id, l.price_nok, l.is_free, l.title, l.description, l.attributes
    )
  LOOP
    IF m.notify_matches AND m.user_id <> l.seller_id THEN
      INSERT INTO public.wtb_match_notifications (wtb_listing_id, user_id, listing_id)
      VALUES (m.id, m.user_id, l.id)
      ON CONFLICT (wtb_listing_id, listing_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;
