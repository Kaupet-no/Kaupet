-- Fase 4 av ØK-matching: gjør selger-hintet ("N brukere ønsker å kjøpe noe
-- lignende") faktisk attributtbasert i stedet for bare tittel-tekstsøk.
--
-- Tynn, read-only wrapper rundt compute_wtb_matches (fra
-- 20260805100500_wtb_matching_engine.sql) — ingen duplisert
-- sammenligningslogikk. Skriver ingen rader; kan trygt kalles med
-- hypotetiske verdier for en annonse som ikke er lagret ennå (mens brukeren
-- fortsatt fyller ut opprettelsesflyten).
CREATE OR REPLACE FUNCTION public.wtb_match_count(
    _category_id uuid,
    _price_nok integer,
    _is_free boolean,
    _title text,
    _description text,
    _attributes jsonb
) RETURNS TABLE(match_count integer, max_price integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT count(*)::integer AS match_count, max(max_price_nok)::integer AS max_price
  FROM public.compute_wtb_matches(_category_id, _price_nok, _is_free, _title, _description, _attributes);
$$;
