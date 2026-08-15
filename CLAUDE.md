# Claude Code instructions

## Commits

- Ikke legg til `Co-Authored-By`-tagger i commit-meldinger.

## Usikkerhet i leveranser

For hver byggejobb (modifikasjon av eksisterende kode eller nyutvikling),
avslutt svaret med en kort seksjon som lister opp delene av arbeidet du er
minst sikker på eller ikke har fått verifisert (f.eks. ikke kjørt testene,
ikke testet i nettleser, antakelser om eksisterende atferd, edge-caser du
ikke har dekket). Hvis alt er verifisert, si det eksplisitt i én linje i
stedet for å utelate seksjonen.

## Gjenbruk før nybygg

Før du skriver ny kode: søk gjennom eksisterende `lib/`, `components/` og
`features/` etter funksjonalitet som allerede løser (eller nesten løser)
problemet, og gjenbruk/utvid den fremfor å bygge parallell logikk. Dette
gjelder selv om Ponytail-modus er av — det er en bevisst arbeidsvane, ikke
bare en automatisk sjekk.

## Arkitektur

Den normative arkitekturguiden ligger i [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Les den før endringer som berører systemgrenser, datamodell, serverfunksjoner,
plattformtilpasning eller delt featurearkitektur, og gå gjennom sjekklisten i
guidens § 11 før du anser en slik endring som ferdig.

Stack: TanStack Start (Vite + React) på Cloudflare Workers (via nitro/wrangler),
Supabase (Postgres + RLS + Auth), Capacitor (iOS/Android-wrapper).

`src/` er organisert feature-basert:

- `routes/` — TanStack Router filbasert routing.
- `features/<navn>/` — selvstendige featuremoduler (f.eks. `listing-creation`,
  `listing-search`, `listing-edit`, `vehicle-360-capture`).
- `components/` — delte UI-komponenter, inkl. `components/ui/` (Radix-baserte
  primitiver, generert av shadcn).
- `lib/` — vertikal-agnostisk domenelogikk, valideringsregler, Supabase-hjelpere.
- `integrations/supabase/` — klientoppsett.

### Server/klient-grense

Filnavn signaliserer kjøremiljø: `*.server.ts` og `*.functions.ts` kjører kun
server-side (TanStack Start server functions) og kan trygt bruke
`supabaseAdmin` (service-role, omgår RLS). Aldri importer disse fra
klientkode — `no-restricted-imports`-regelen i `eslint.config.js` blokkerer
`server-only`-pakken for å tvinge frem denne konvensjonen i stedet.

### Vertikal-agnostisk kjerne vs. kjøretøy-spesifikk kode

Kaupet startet med generisk annonselogikk og fikk siden en kjøretøy-vertikal
(Bil og MC) lagt oppå. Filer som `src/lib/category-filters.ts`,
`src/lib/category-behavior.ts`, `src/lib/listings.functions.ts` og
kjerneflyten i `features/listing-creation/` er ment å forbli vertikal-
agnostiske — kategori-spesifikk atferd skal uttrykkes via
`CategoryBehavior` (`src/lib/category-behavior.ts`), ikke ved å importere
`@/lib/vehicle/*` direkte eller strø `isVehicle`-boolske sjekker rundt i
generisk kode. `eslint.config.js` håndhever dette med et `no-restricted-imports`-
mønster for disse filene. Se commit `71fa7bd` for konkret eksempel på buggen
denne typen drift forårsaket (leveringsvalidering som brøt for kjøretøy fordi
en `isVehicle`-sjekk manglet ett sted).

## Kjøretester og typecheck

- `bun run test` — vitest (unit/komponent). `bun run test:coverage` kjører
  samme med dekningsrapport og håndhevet minimumsterskel (se `vitest.config.ts`).
- `bun run test:rls` — RLS-integrasjonstester. Krever en lokal Supabase-stack
  (`supabase start`, forutsetter Docker). Testscriptet leser lokale URL-er og
  nøkler fra `supabase status`; eksplisitte `LOCAL_SUPABASE_*`-variabler kan
  fortsatt brukes som override.
  Dekker nå ~35 tabeller/scenarioer (se `describe`-blokkene i filen for
  gjeldende liste) — ikke lenger begrenset til `conversations`/`messages`.
  Kjøres i CI mot en isolert lokal Supabase-stack.
- `bun run test:e2e` — Playwright, kjører nå automatisk på PR mot `main`
  (i tillegg til manuell `workflow_dispatch`), se `.github/workflows/ci.yml`.
- `bunx tsc --noEmit` — typecheck, kjøres også som pre-push-hook (lefthook).
- `bun run lint` — kjøres som pre-commit-hook på staged filer.

## E2E-testid-konvensjon

Etablert gjennom `e2e/pages/listing-wizard.ts` og annonse-wizardens
spec-filer (`e2e/publish-listing.spec.ts`, `e2e/publish-vehicle-listing.spec.ts`):

- Steg i annonse-wizarden: `wizard-step-<group-key>` (f.eks.
  `wizard-step-vehicle-facts`), satt på steg-containeren i `ny-annonse.tsx`.
  `<group-key>` er nøkkelen fra `field-groups/registry.ts`.
- Navigasjonsknapper: `wizard-next-button`, `continue-without-image-button`,
  `publish-listing-button`, `publish-anyway-button`.
- Feltspesifikke input-er der `getByLabel`/`getByRole` er tvetydig eller
  ustabilt på tvers av innholdsendringer: `listing-title-input`,
  `listing-description-textarea`, `category-search-input`.
- Unntak: kategoriflisene identifiseres via `data-category-name` (ikke
  `data-testid`) siden testene trenger å målrette en spesifikk kategori ved
  navn, ikke bare "en flis".

Tommelfingerregel: bruk `data-testid` kun når `getByRole`/`getByLabel` er
tvetydig eller ustabilt — ellers foretrekk `getByRole`/`getByLabel`, som er
mer robust mot markup-endringer og tettere på hva en bruker faktisk opplever.

## RLS-policyer

Policyer bor i `supabase/migrations/`, én tabell kan ha policyer spredt over
flere migrasjonsfiler kronologisk — søk etter `ALTER TABLE public.<tabell>`
og `CREATE POLICY` for gjeldende tilstand, ikke bare siste migrasjon.

## Migrasjoner og Supabase-CI

Migrasjoner i `supabase/migrations/` pushes til Supabase automatisk av
Supabase sin egen GitHub-plugin (ikke en jobb i `.github/workflows/` i dette
repoet — den finnes ikke her og skal ikke letes opp lokalt). Det betyr:

- Ikke kjør `supabase db push` manuelt mot et lenket prosjekt (f.eks.
  `staging_kaupet`) — det er allerede dekket, og en manuell push kan komme i
  utakt med det GitHub-pluginen tror er anvendt.
- Når en endring i samme omgang både legger til en migrasjon (f.eks. en ny
  kolonne) og appkode som avhenger av den (f.eks. en `.eq(...)`-spørring mot
  den nye kolonnen), commit og push migrasjonen for seg selv først, og vent
  til den er bekreftet anvendt før appkode-endringen som avhenger av den
  pushes — ellers kan allerede-levende spørringer feile mot databasen i
  vinduet mellom de to.
