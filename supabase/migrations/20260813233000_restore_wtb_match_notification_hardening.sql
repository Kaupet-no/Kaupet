-- Fase 4 la varslingspreferansen inn i matchfunksjonen, men overskrev samtidig
-- feilisoleringen fra 20260807145237. Behold samtykkefilteret og sørg for at
-- én foreldreløs/ugyldig WTB-match aldri kan blokkere annonsepublisering.
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
      BEGIN
        INSERT INTO public.wtb_match_notifications (wtb_listing_id, user_id, listing_id)
        VALUES (m.id, m.user_id, l.id)
        ON CONFLICT (wtb_listing_id, listing_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.push_dispatch_failures (kind, payload, error)
        VALUES (
          'wtb_match_notification',
          jsonb_build_object('wtb_listing_id', m.id, 'user_id', m.user_id, 'listing_id', l.id),
          SQLERRM
        );
      END;
    END IF;
  END LOOP;
END;
$$;

-- Fjern eksisterende WTB-rader som ikke lenger har en autentisert eier.
DELETE FROM public.wtb_listings w
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = w.user_id);
