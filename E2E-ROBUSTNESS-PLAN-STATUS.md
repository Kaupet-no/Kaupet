# E2E-robusthetsplan — status

Dette dokumentet oppsummerer arbeidet med å gjøre `publish-listing.spec.ts` (og
den nye `publish-vehicle-listing.spec.ts`) robuste mot UI- og
innholdsendringer, gjennomført som fem faser. Alle fasene er implementert,
verifisert grønne i CI (PR [#185](https://github.com/Kaupet-no/Kaupet/pull/185))
og pushet til `staging`.

## Bakgrunn

Etter at `publish-listing.spec.ts` ble stabilisert (se commit-historikken for
den opprinnelige feilsøkingsrunden), identifiserte vi at testen fortsatt var
skjør av tre grunner: den lånte en ekte produksjonskategori, brukte faste
`waitForTimeout`-kall, og manglet CI-dekning for én av de mest komplekse
delene av annonseflyten (Bil og MC). Denne planen adresserte alle tre, pluss
et par strukturelle tiltak funnet underveis.

## Fase 1 — Dedikert E2E-testkategori

**Gjort:** Ny migrasjon (`20260802210000_e2e_test_category.sql`) seeder en
rot-nivå kategori (`e2e-test-listing`, "E2E-test (ikke bruk)") uten
`category_filters`-rader, eid av testsuiten. `publish-listing.spec.ts` bruker
nå denne i stedet for en lånt produksjonskategori.

**Kjent avveining (uløst):** Det finnes ingen "skjult for sluttbrukere"-flagg
på `categories`-tabellen. Testkategorien er derfor teknisk sett synlig og
valgbar for ekte brukere — den sorteres sist (`sort_order 9999`) og er tydelig
navngitt for å minimere risikoen, men er ikke _ekte_ skjult. Å bygge en
ordentlig synlighetsmekanisme ble vurdert som for stort et inngrep for denne
oppgaven alene (17 spørringssteder mot `categories`-tabellen på tvers av
kodebasen). Se "Forslag til neste steg" under.

## Fase 2 — Fjern faste ventinger

**Gjort:**

- Kategorivelgeren venter nå på at den valgte flisen forsvinner fra DOM-en
  (`waitFor({ state: "detached" })`) i stedet for en blind
  `waitForTimeout(500)`.
- Wizardens steg-container har fått `data-testid="wizard-step-<gruppenøkkel>"`
  (`ny-annonse.tsx`), slik at tester kan vente på et konkret steg i stedet for
  å polle synlighet på tilfeldige felter.
- `publish-listing.spec.ts` omskrevet fra en generisk polling-løkke til
  eksplisitte, steg-for-steg-baserte handlinger.

## Fase 3 — Testdata-opprydning

**Funn:** Infrastrukturen fantes allerede — `e2e/global-setup.ts` oppretter en
engangs-testbruker, `e2e/global-teardown.ts` sletter den etterpå. Siden både
`listings.seller_id` og `profiles.id` har `ON DELETE CASCADE` mot
`auth.users`, rydder denne slettingen automatisk opp i alle annonser
testkjøringen opprettet — ingen egen opprydningsspørring trengs (bekrefter at
alternativ 1 fra det opprinnelige forslaget var riktig valg).

**Gjort:** Den ene reelle mangelen — `deleteUser`-feil ble svelget stille
(`.catch(() => {})`) — er rettet til å logge en tydelig advarsel i CI-output
ved feil, uten å feile testkjøringen.

## Fase 4 — CI-smoke-sjekk for miljøvariabler

**Gjort:** Nytt steg i `.github/workflows/ci.yml`s E2E-jobb som verifiserer at
alle påkrevde Supabase-env-variabler er satt _før_ selve testkjøringen
starter, og feiler raskt med en eksplisitt `::error::`-melding hvis noen
mangler. Adresserer direkte den forrige rundens mest tidkrevende enkeltfeil
(manglende `SUPABASE_PUBLISHABLE_KEY`, oppdaget først etter ~90 sekunders
Playwright-timeout).

## Fase 5 — Dekning av Bil og MC-flyten

**Gjort:** Ny test `publish-vehicle-listing.spec.ts` dekker
vehicle-registration/vehicle-facts/vehicle-condition-stegene via den manuelle
"kjøretøy ikke registrert"-veien (unngår avhengighet til Statens vegvesens
API i CI). Ny dedikert testkategori under Bil og MC
(`20260803090000_e2e_test_vehicle_category.sql`).

Denne fasen krevde flere oppfølgingsrunder — funnene er verdifulle i seg selv:

1. **"isVehicle" avgjøres av filtertype, ikke kategori-ancestry.**
   `vehicleCategoryGroupFor` (se `src/lib/category-filters.ts`) sjekker om
   kategorien har et `brand_select`-filter — ikke om den ligger under "Bil og
   MC". Første forsøk brukte vanlige tekst-filtre for Merke/Modell og falt
   dermed tilbake til den generiske attributt-flyten. Rettet ved å bruke
   `brand_select`/`model_select` i `bil`-referansegruppen (Volvo/XC60 finnes
   allerede i det kuraterte datasettet).
2. **Samme Label/Input-koblingsmangel funnet tre ganger til.** Utover
   `attribute-fields.tsx` (rettet i forrige runde) manglet også
   `VehicleBrandField`/`VehicleModelField` (`vehicle-brand-model-fields.tsx`)
   og Pris-feltet (`price/index.tsx`) `htmlFor`/`id`-kobling mellom `Label` og
   sitt input/select. Alle tre rettet. Dette gjentagende mønsteret er selve
   grunnen til forslag #1 under "Neste steg".
3. **Uløst mysterium, arbeidet rundt:** To påfølgende CI-kjøringer viste at et
   klikk på "Neste"-knappen fullførte uten feil, men etterlot UI-en helt
   uendret (ingen dialog, ingen feilmelding, ingen steg-overgang) — identisk
   og reproduserbart, ikke tilfeldig. Grundig statisk gjennomgang av
   `goToNextPage()`s valideringslogikk i `ny-annonse.tsx` fant ingen årsak, og
   nøyaktig samme klikk-mønster fungerer pålitelig i `publish-listing.spec.ts`.
   Løst pragmatisk med en begrenset retry (`clickNextAndWaitFor`, maks 3
   forsøk à 8s) som attacher et skjermbilde til testrapporten ved hvert
   mislykkede forsøk — retry-en løste problemet i praksis (kom forbi på andre
   forsøk), men **den underliggende årsaken er ikke identifisert**. Se "Ikke
   løst" under.
4. **Kjøretøy har ingen "Gis bort gratis"-avkrysning.** `price/index.tsx`
   skjuler denne helt for `isVehicle`-kategorier — testen måtte fylle en ekte
   pris i stedet.
5. **Samme "Steg N av M"-aria-label-tvetydighet som tidligere,** nå for
   "Pris & detaljer" vs. "Pris"-feltet — løst med samme mønster (scope til
   `getByRole("textbox", ...)`).

## Ikke løst / identifisert, men ikke fikset

- **Root-årsaken til det stille mislykkede "Neste"-klikket i Fase 5** (punkt 3
  over) er ikke funnet. Retry-mekanismen gjør testen pålitelig i praksis, men
  hvis dette er et reelt race condition-symptom i selve appen (ikke bare i
  testverktøyet), kan det i prinsippet påvirke ekte brukere med treg
  nettverksforbindelse på samme måte. Anbefaler en egen, fokusert
  undersøkelse (se forslag under) fremfor å anta at retry-en dekker over et
  reelt UX-problem.
- **Ingen ekte "skjult for sluttbrukere"-mekanisme for kategorier** (Fase 1).
- **Login-flake i `publish-listing.spec.ts`:** observert én gang i denne
  rundens CI-kjøringer (dekket av Playwright sin innebygde retry, så jobben
  som helhet er grønn) — ikke undersøkt videre, da det falt utenfor de fem
  fasenes omfang.

## Forslag til neste steg

Rangert etter antatt verdi/innsats-forhold:

1. **Systematisk Label/Input-tilgjengelighetsaudit.** Vi har nå funnet
   _fire_ separate steder (Merke i `attribute-fields.tsx`, Pris i
   `price/index.tsx`, Merke/Modell i `vehicle-brand-model-fields.tsx`) med
   identisk `<Label>` uten `htmlFor` koblet til et input/select uten `id`.
   Dette er ikke lenger et enkelttilfelle — det er et mønster som trolig
   finnes flere steder i kodebasen, og som er en reell
   tilgjengelighetsmangel for skjermleser-brukere, ikke bare et testproblem.
   Foreslår et dedikert søk (`grep -rn "<Label>" src` etterfulgt av manuell
   gjennomgang, eller en ESLint-regel som `jsx-a11y/label-has-associated-control`
   satt til feil i stedet for advarsel) for å finne og rette resten på én
   gang, i stedet for å oppdage dem én og én neste gang en test brekker.
2. **Undersøk root-årsaken til det stille "Neste"-klikk-mysteriet
   (Fase 5, punkt 3).** Bruk `page.on("console")`/`page.on("pageerror")`-
   lyttere gjennom hele testkjøringen (ikke bare ved feil) for å fange opp
   ting trace-verktøyet ikke viste, eller reproduser lokalt mot samme
   staging-Supabase-prosjekt med et lengre `--headed`-kjøreoppsett for
   direkte observasjon.
3. **Playwright Page Object for annonse-wizarden.** Med to tester som nå
   navigerer det samme wizardet (`publish-listing.spec.ts` og
   `publish-vehicle-listing.spec.ts`), begynner steg-navigering og
   testid-oppslag å dupliseres. Et lite `e2e/pages/listing-wizard.ts`-
   hjelpeobjekt ville samlet dette ett sted.
4. **Dokumentert `data-testid`-konvensjon i `CLAUDE.md`.** Testid-ene lagt
   til gjennom dette arbeidet (`listing-title-input`, `wizard-next-button`,
   `category-tile`, osv.) er ad hoc navngitt. En kort seksjon i `CLAUDE.md`
   ville sikre at fremtidige feltgrupper får stabile hooks fra dag én.
5. **Vurder engangs-opprydning av `omregistreringsavgift`-relatert
   kompleksitet i `price/index.tsx`** oppdaget i Fase 5 — komponenten har
   vokst til å håndtere generisk pris, kjøretøy-pris, og
   avgiftsberegning/-overstyring i én fil. Ikke i veien for noe akutt, men en
   kandidat for oppdeling neste gang den uansett må endres.

## Berørte filer (oversikt)

- `supabase/migrations/20260802210000_e2e_test_category.sql`
- `supabase/migrations/20260803090000_e2e_test_vehicle_category.sql`
- `supabase/migrations/20260803100000_fix_e2e_test_vehicle_category_filter_types.sql`
- `e2e/publish-listing.spec.ts`
- `e2e/publish-vehicle-listing.spec.ts` (ny)
- `e2e/global-teardown.ts`
- `src/routes/_authenticated/ny-annonse.tsx`
- `src/components/category-picker.tsx`
- `src/components/attribute-fields.tsx`
- `src/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields.tsx`
- `src/features/listing-creation/field-groups/price/index.tsx`
- `.github/workflows/ci.yml`
