-- 20260617142736_fix-listing-view-logging.sql løste et reelt
-- rettighetsproblem (anon manglet SELECT for upsert), men gjorde det ved å
-- gjeninnføre en eldre versjon av log_listing_view som kun skriver til
-- listing_views. Det slettet ved et uhell innsettingen i
-- listing_view_events, som ble lagt til i 20260617124920 for å skille
-- "totalt antall visninger" fra "unike besøkende". Resultat: total_views
-- har stått fast på 0 siden den migrasjonen.
--
-- Denne migrasjonen kombinerer rettighetsfiksen (SECURITY DEFINER-funksjon,
-- ingen direkte tabelltilgang for klienten) med dual-table-loggingen.

CREATE OR REPLACE FUNCTION public.log_listing_view(_listing_id uuid, _visitor_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _visitor_key IS NULL OR length(trim(_visitor_key)) = 0 THEN
    RAISE EXCEPTION 'visitor_key er påkrevd';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.listings l WHERE l.id = _listing_id AND l.status = 'active'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.listing_views (listing_id, visitor_key, user_id)
  VALUES (_listing_id, _visitor_key, auth.uid())
  ON CONFLICT (listing_id, visitor_key) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.listing_view_events e
    WHERE e.listing_id = _listing_id
      AND e.visitor_key = _visitor_key
      AND e.created_at > now() - interval '30 minutes'
  ) THEN
    INSERT INTO public.listing_view_events (listing_id, visitor_key, user_id)
    VALUES (_listing_id, _visitor_key, auth.uid());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.log_listing_view(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_listing_view(uuid, text) TO anon, authenticated;
