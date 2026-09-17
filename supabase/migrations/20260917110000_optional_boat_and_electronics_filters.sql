-- Funn F7a: påkrevde felt er ukalibrert for båt og noen elektronikk-
-- kategorier. Båt > Båter (arves av Seilbåt/Motorbåt/Jolle og gummibåt)
-- krever i dag 14 felt for å publisere, uten noen automatisk kilde som
-- Statens vegvesen slik kjøretøy har. Å legge ut en jolle skal ikke kreve
-- hestekrefter, maksfart, sengeplasser, sitteplasser, konstruksjon eller
-- farge — feltene beholdes (for selgere som vil fylle dem ut og som
-- søkefilter), de skal bare ikke lenger blokkere publisering. Tilsvarende
-- for panelteknologi (TV) og skjermkort (Stasjonær PC).
--
-- Nøklene er delt på tvers av kategorier (f.eks. finnes `color` også på klær,
-- interiør og ni kjøretøykategorier; `power_hk` på moped/snøscooter/bobil/MC/
-- ATV/bil; `seats` på bobil/buss/bil; `sleeping_places` på campingvogn/bobil).
-- Disse skal ikke røres, så vi avgrenser strengt på category_id — slått opp
-- via slug-kjede (matcher mønsteret i 20260805091000_boat_vertical.sql),
-- ikke hardkodede UUID-er som kan avvike mellom staging og produksjon. Slug
-- er en identifikator (endres ikke om noen redigerer visningsnavnet i
-- kategoriadministrasjonen) og er ASCII, i motsetning til f.eks.
-- "Stasjonær PC" sin æ.
DO $$
DECLARE
  v_bater_id uuid;
  v_tv_id uuid;
  v_pc_id uuid;
  v_match_count integer;
  v_updated_count integer;
BEGIN
  -- Båt > Båter (samme slug-oppslag som boat_vertical-migrasjonen).
  SELECT c.id INTO v_bater_id
  FROM public.categories c
  JOIN public.categories p ON p.id = c.parent_id
  WHERE c.slug = 'bater' AND p.slug = 'bat';

  -- Elektronikk > TV og lyd > TV.
  SELECT c.id INTO v_tv_id
  FROM public.categories c
  JOIN public.categories p ON p.id = c.parent_id
  JOIN public.categories gp ON gp.id = p.parent_id
  WHERE c.slug = 'tv' AND p.slug = 'tv-og-lyd' AND gp.slug = 'elektronikk';

  -- Elektronikk > Data > Stasjonær PC.
  SELECT c.id INTO v_pc_id
  FROM public.categories c
  JOIN public.categories p ON p.id = c.parent_id
  JOIN public.categories gp ON gp.id = p.parent_id
  WHERE c.slug = 'stasjonaer-pc' AND p.slug = 'data' AND gp.slug = 'elektronikk';

  -- Radtallskontroll uavhengig av nåværende is_optional-verdi, slik at
  -- migrasjonen er trygg å kjøre to ganger (andre kjøring finner de samme 8
  -- radene, men UPDATE under blir en no-op siden is_optional allerede er
  -- true). Feiler høyt dersom kategoristrukturen ikke matcher forventningen
  -- (f.eks. manglende kategori eller endrede nøkler) fremfor å anta.
  SELECT count(*) INTO v_match_count
  FROM public.category_filters
  WHERE (category_id = v_bater_id AND key IN ('power_hk', 'max_speed_knots', 'sleeping_places', 'seats', 'construction', 'color'))
     OR (category_id = v_tv_id AND key = 'panel_tech')
     OR (category_id = v_pc_id AND key = 'gpu');

  IF v_match_count <> 8 THEN
    RAISE EXCEPTION 'F7a: forventet 8 category_filters-rader (6 båt + panel_tech + gpu), fant %. Båter-id: %, TV-id: %, Stasjonær PC-id: %. Sjekk kategoristruktur/nøkler før migrasjonen kjøres på nytt.',
      v_match_count, v_bater_id, v_tv_id, v_pc_id;
  END IF;

  UPDATE public.category_filters
  SET is_optional = true
  WHERE is_optional = false
    AND (
      (category_id = v_bater_id AND key IN ('power_hk', 'max_speed_knots', 'sleeping_places', 'seats', 'construction', 'color'))
      OR (category_id = v_tv_id AND key = 'panel_tech')
      OR (category_id = v_pc_id AND key = 'gpu')
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'F7a: satte is_optional = true på % rad(er) (0 forventet ved gjentatt kjøring).', v_updated_count;
END;
$$;
