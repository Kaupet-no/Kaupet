# Instruksjoner for AI-agenter

Denne filen er den eneste, autoritative instruksen for alle kodeagenter som
arbeider i Kaupet. Ved motstrid med mer spesifikke dokumenter (se lenker
nedenfor) gjelder den mest spesifikke instruksen.

## Før du starter

1. Les denne filen. Detaljerte, emnespesifikke regler ligger i dokumentene
   det lenkes til nedenfor: [ARCHITECTURE.md](docs/ARCHITECTURE.md) for
   systemgrenser og arkitektur, [UI-GUIDE.md](docs/UI-GUIDE.md) for
   frontend/native UI, [STAGING.md](docs/STAGING.md) for miljø og testing,
   [src/routes/README.md](src/routes/README.md) for routing, og
   [CONTRIBUTING.md](CONTRIBUTING.md) for bidrags- og commit-praksis.
2. Søk gjennom eksisterende `src/lib/`, `src/components/` og `src/features/`
   etter funksjonalitet som allerede løser (eller nesten løser) problemet, og
   gjenbruk/utvid den fremfor å bygge parallell logikk.
3. Se på nærliggende kode og tester, og hold endringen liten, fokusert og i
   tråd med etablerte mønstre. Ikke overskriv eller rydd bort urelaterte
   endringer i en skitten arbeidskopi.

## Kart over repoet

- `src/routes/` — TanStack Start-filbaserte ruter. Følg
  [rutekonvensjonene](src/routes/README.md); ikke bruk Next.js-/Remix-struktur
  som `src/pages/` eller `app/layout.tsx`. `src/routeTree.gen.ts` er generert
  og skal aldri redigeres manuelt.
- `src/features/<navn>/` — avgrensede featuremoduler (f.eks.
  `listing-creation`, `listing-search`, `listing-edit`, `vehicle-360-capture`).
- `src/components/` — delte UI-komponenter; `src/components/ui/` inneholder
  shadcn/Radix-primitiver.
- `src/lib/` — vertikal-agnostisk domenelogikk, validering og hjelpefunksjoner.
  `src/lib/vehicle/` er kjøretøyspesifikk kode.
- `src/integrations/supabase/` — Supabase-klientoppsett; behandle genererte
  typer forsiktig.
- `supabase/migrations/` — den historiske kilden til databaseskjema og
  RLS-policyer.
- `e2e/` — Playwright-tester; følg testid-konvensjonen under.

Stack: TanStack Start (Vite + React) på Cloudflare Workers (via
nitro/wrangler), Supabase (Postgres + RLS + Auth), Capacitor (iOS/Android).

## Arkitekturregler som ikke kan fravikes

- Bruk `*.server.ts` og `*.functions.ts` for serverkjørende kode og TanStack
  Start-serverfunksjoner. Ikke importer slike moduler fra klientkode —
  `no-restricted-imports` i `eslint.config.js` håndhever dette.
  `supabaseAdmin` (service-role) er kun for serveren og omgår RLS.
- Behold den generiske annonsekjernen (`src/lib/category-filters.ts`,
  `src/lib/category-behavior.ts`, `src/lib/listings.functions.ts`,
  kjerneflyten i `features/listing-creation/`) vertikal-agnostisk. Ikke
  importer `@/lib/vehicle/*` eller spre `isVehicle`-sjekker inn i generisk
  kategori-/annonsekode — utvid `CategoryBehavior` i stedet. ESLint håndhever
  dette i utvalgte kjernefiler. Se commit `71fa7bd` for et konkret eksempel på
  buggen denne typen drift forårsaket.
- Når du endrer RLS: søk gjennom **alle** migrasjoner for tabellen (`ALTER
TABLE public.<tabell>` og `CREATE POLICY`), siden gjeldende policy kan være
  fordelt over flere migrasjonsfiler kronologisk.
- Bruk eksisterende shadcn-primitiver og UI-mønstrene i `docs/UI-GUIDE.md`:
  `ResponsiveOverlay` for vanlige brukervendte dialoger, `FullscreenOverlay`
  for fullskjermtakeovers, `AlertDialog` for destruktive bekreftelser. Ikke
  bruk `confirm()` eller håndrullede varianter av etablerte primitiver.
- UI-tekst er på norsk bokmål. Bruk semantiske design-tokens, ikke hardkodede
  farger. Ivareta tilgjengelighet og native-/safe-area-reglene i UI-guiden.
- Les [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) før endringer som berører
  systemgrenser, datamodell, serverfunksjoner, plattformtilpasning eller delt
  featurearkitektur, og gå gjennom sjekklisten i guidens § 11 før du anser en
  slik endring som ferdig.

## Verifisering og git-arbeidsflyt

- `bun run test` — vitest (unit/komponent). `bun run test:coverage` kjører
  samme med dekningsrapport og håndhevet minimumsterskel.
- `bun run test:rls` — RLS-integrasjonstester. Krever lokal Supabase-stack
  (`supabase start`, forutsetter Docker). Kjøres i CI mot en isolert stack.
- `bun run test:e2e` — Playwright, kjører automatisk på PR mot `main` i
  tillegg til manuell `workflow_dispatch`.
- `bunx tsc --noEmit` — typecheck, kjøres også som pre-push-hook (lefthook).
- `bun run lint` — kjøres som pre-commit-hook på staged filer. Ikke stol bare
  på hookene når en passende kontroll kan kjøres lokalt.
- Kjør de mest relevante kontrollene for endringen din før du er ferdig.
- Hold commits atomiske, bruk den etablerte Conventional Commits-varianten,
  og legg **ikke** til `Co-Authored-By`-tagger.
- Test aldri endringer direkte i produksjon. Staging deployes fra
  `staging`-branchen; se `docs/STAGING.md`.
- Migrasjoner i `supabase/migrations/` pushes automatisk av Supabase sin
  GitHub-plugin (finnes ikke som jobb i dette repoets `.github/workflows/`).
  Ikke kjør `supabase db push` manuelt mot et lenket prosjekt. Hvis appkode i
  samme omgang avhenger av en ny migrasjon (f.eks. en `.eq(...)`-spørring mot
  en ny kolonne), commit og push migrasjonen for seg selv først, og vent til
  den er bekreftet anvendt før du pusher den avhengige appkoden.

## Test

Den normative teststrategien er [docs/TESTSTRATEGI.md](docs/TESTSTRATEGI.md):
ISTQB-basert testpolicy, risikomatrise, testnivåer, playbooks for AI-agenter
(§ 10) og en konkret testkatalog for hele repoet (§ 11). Før du skriver eller
endrer en test: finn riktig nivå i § 3 og følg playbooken i § 10.

Repoet har to etablerte testagenter og en slash-kommando som tildeler dem
arbeid:

- `/testoppgave <TC-ID | område>` — slår opp casene, velger nivå og playbook,
  og delegerer.
- `test-author` — skriver og utvider automatiserte tester (PB-1–PB-4, PB-8).
- `test-explorer` — eksplorativ feiljakt, ytelse og tilgjengelighet
  (PB-5–PB-7). Rapporterer, endrer ikke kode.

### E2E-testid-konvensjon

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
tvetydig eller ustabilt — ellers foretrekk `getByRole`/`getByLabel`.

## Leveranse

Rapporter kort hva som er endret og hvilke kontroller som ble kjørt. For hver
byggejobb (modifikasjon av eksisterende kode eller nyutvikling) skal svaret
avsluttes med en kort seksjon **Usikkerhet/verifisering**: list delene av
arbeidet du er minst sikker på eller ikke har fått verifisert (f.eks. ikke
kjørt testene, ikke testet i nettleser, antakelser om eksisterende atferd,
edge-caser du ikke har dekket). Hvis alt relevant er verifisert, skriv
eksplisitt at det er verifisert i stedet for å utelate seksjonen.
