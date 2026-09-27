-- Funn R6: kategorispesifikke egenskaper (Materiale, Stil, Merke, osv.) er i
-- dag påkrevd (is_optional = false) på svært mange ikke-kjøretøy/ikke-båt-
-- kategorier, i tillegg til beskrivelse, tilstand, pris, levering og sted.
-- Eksempel: Interiør > Møbler > Stol og lenestol krever Materiale, Stil og
-- Merke — en vintagestol med ukjent produsent tvinger fram "Ukjent" i
-- Merke-feltet for å kunne publisere.
--
-- Prinsipp: påkrevd er bare det kjøperen må ha for å handle (tittel,
-- kategori, pris, sted — beskrivelse og tilstand er allerede påkrevd
-- generelt, uavhengig av category_filters). Kategorispesifikke egenskaper
-- gjøres valgfrie ("gjør annonsen bedre"), UNNTATT der søk/filtrering er
-- avhengig av dem på en måte der en manglende verdi gjør annonsen usynlig/
-- meningsløs. Eneste slikt unntak som faktisk finnes i dagens
-- category_filters (verifisert mot data): klesstørrelse og skostørrelse
-- (`clothing_size`, `shoe_size_eu`, `boot_size_eu`) — en klesplagg-/
-- skoannonse uten størrelse er ikke søkbar/nyttig på samme måte som andre
-- attributter. Det finnes i dag ingen boligkategori (Hus og hage inneholder
-- kun hage/verktøy/byggevarer, ikke bolig til salgs/leie), så "boligdata"-
-- unntaket fra prinsippet har ingen treff å anvende på.
--
-- Feltene beholdes i category_filters (for selgere som vil fylle dem ut, og
-- som søkefilter for kjøpere) — de skal bare ikke lenger blokkere
-- publisering. Se `getMissingRequiredFilters` i src/lib/category-filters.ts,
-- som er eneste stedet klienten (og serveren, via samme funksjon) avgjør
-- hvilke category_filters som er påkrevd — den leser `is_optional` fra denne
-- tabellen, ingen hardkodet per-kategori-liste.
--
-- Kjøretøy (bil-og-mc), bildeler/tilbehør (bildeler-og-tilbehor, som deler
-- kjøretøyets registreringsnummer-/SVV-avledede felt-mønster) og båt (bat)
-- røres ikke, jf. eget vedtak om at kjøretøy og båt ikke skal endres i denne
-- omgangen. Båt har for øvrig allerede requiresCategoryFilterValues = false
-- i CategoryBehavior (src/lib/category-behavior.ts), så is_optional der
-- påvirker ikke publisering — men vi lar dem stå urørt likevel.
--
-- Avgrenser på rot-kategori-slug (stabil identifikator — endres ikke om en
-- admin redigerer visningsnavnet — og likt på tvers av miljøer, i motsetning
-- til UUID-er) via rekursiv nedstigning i kategoritreet, ikke en oppramsing
-- av de ~210 berørte (kategori, filter-key)-parene.
DO $$
DECLARE
  v_root_count integer;
  v_updated_count integer;
BEGIN
  SELECT count(*) INTO v_root_count
  FROM public.categories
  WHERE parent_id IS NULL
    AND slug IN ('bil-og-mc', 'bat', 'bildeler-og-tilbehor');

  -- En tom lokal/CI-database får referansedata først fra seed.sql, etter at
  -- migrasjonene er kjørt (se scripts/refresh-local-from-staging.mjs og
  -- mønsteret i 20260917110000_optional_boat_and_electronics_filters.sql).
  -- bildeler-og-tilbehor opprettes av 20260826200000_parts_fitment.sql selv
  -- i en tom database, så bootstrap kjennes igjen på at seed-røttene
  -- bil-og-mc og bat mangler.
  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE parent_id IS NULL AND slug IN ('bil-og-mc', 'bat')
  ) THEN
    RAISE NOTICE 'R6: rotkategoriene finnes ikke ennå — hopper over i tom bootstrap-database';
    RETURN;
  END IF;

  IF v_root_count <> 3 THEN
    RAISE EXCEPTION 'R6: forventet rotkategoriene bil-og-mc, bat og bildeler-og-tilbehor, fant %. Sjekk kategoristruktur før migrasjonen kjøres på nytt.',
      v_root_count;
  END IF;

  WITH RECURSIVE excluded_tree AS (
    SELECT id
    FROM public.categories
    WHERE parent_id IS NULL
      AND slug IN ('bil-og-mc', 'bat', 'bildeler-og-tilbehor')
    UNION ALL
    SELECT c.id
    FROM public.categories c
    JOIN excluded_tree t ON c.parent_id = t.id
  )
  UPDATE public.category_filters
  SET is_optional = true
  WHERE is_optional = false
    AND category_id NOT IN (SELECT id FROM excluded_tree)
    AND key NOT IN ('clothing_size', 'shoe_size_eu', 'boot_size_eu');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'R6: satte is_optional = true på % rad(er) utenfor kjøretøy/bildeler/båt (klesstørrelse/skostørrelse beholdt påkrevd; 0 forventet ved gjentatt kjøring).',
    v_updated_count;
END;
$$;
