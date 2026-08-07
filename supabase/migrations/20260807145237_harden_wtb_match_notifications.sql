-- match_listing_to_wtb_listings() kjører synkront i samme transaksjon som
-- selve INSERT INTO listings (via listings_match_wtb_listings_trigger). Én
-- wtb_listings-rad som peker på en profil uten tilsvarende auth.users-rad
-- (f.eks. en bruker slettet uten opprydding av egne ØK-annonser — det
-- finnes ingen FK/cascade fra profiles til auth.users som ville forhindret
-- dette) fikk hele transaksjonen til å rulles tilbake med en FK-feil på
-- wtb_match_notifications_user_id_fkey — altså at ALLE brukeres
-- annonsepublisering kunne blokkeres av én enkelt foreldreløs ØK-annonse
-- tilhørende en helt annen bruker. Wrap innsettingen per match slik at én
-- ugyldig match hoppes over i stedet for å velte hele publiseringen.
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
    IF m.user_id <> l.seller_id THEN
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

-- Rydd opp eksisterende foreldreløse wtb_listings-rader (eier finnes ikke
-- lenger i auth.users) som allerede kunne trigge feilen over.
DELETE FROM public.wtb_listings w
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = w.user_id);
