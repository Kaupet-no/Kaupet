# Instruksjoner for AI-agenter

Denne filen er inngangspunktet for alle kodeagenter som arbeider i Kaupet.
Følg den før du endrer filer. Mer detaljerte, emnespesifikke regler ligger i
dokumentene det lenkes til nedenfor. Ved motstrid gjelder den mest spesifikke
instruksen.

## Før du starter

1. Les denne filen og den fullstendige [CLAUDE.md](CLAUDE.md). `CLAUDE.md` er
   den autoritative, detaljerte arbeidsinstruksen og skal holdes konsistent med
   denne oversikten.
2. Les relevant dokumentasjon før du berører området: [ARCHITECTURE.md](docs/ARCHITECTURE.md)
   for systemgrenser og arkitektur, [UI-GUIDE.md](docs/UI-GUIDE.md)
   for frontend/native UI, [STAGING.md](docs/STAGING.md) for miljø og testing,
   [src/routes/README.md](src/routes/README.md) for routing, og
   [CONTRIBUTING.md](CONTRIBUTING.md) for bidrags- og commit-praksis.
3. Undersøk eksisterende `src/lib/`, `src/components/` og `src/features/` før
   du bygger noe nytt. Gjenbruk eller utvid det som finnes fremfor å innføre
   parallell logikk.
4. Se på nærliggende kode og tester, og hold endringen liten, fokusert og i
   tråd med etablerte mønstre. Ikke overskriv eller rydd bort urelaterte
   endringer i en skitten arbeidskopi.

## Kart over repoet

- `src/routes/` — TanStack Start-filbaserte ruter. Følg
  [rutekonvensjonene](src/routes/README.md); ikke bruk Next.js-/Remix-struktur
  som `src/pages/` eller `app/layout.tsx`. `src/routeTree.gen.ts` er generert
  og skal aldri redigeres manuelt.
- `src/features/<navn>/` — avgrensede featuremoduler.
- `src/components/` — delte UI-komponenter; `src/components/ui/` inneholder
  shadcn/Radix-primitiver.
- `src/lib/` — vertikal-agnostisk domenelogikk, validering og hjelpefunksjoner.
  `src/lib/vehicle/` er kjøretøyspesifikk kode.
- `src/integrations/supabase/` — Supabase-oppsett; behandle genererte typer
  forsiktig.
- `supabase/migrations/` — den historiske kilden til databaseskjema og
  RLS-policyer.
- `e2e/` — Playwright-tester; følg testid-konvensjonene i `CLAUDE.md`.

Stacken er TanStack Start (Vite + React) på Cloudflare Workers, Supabase
(Postgres, RLS og Auth) og Capacitor for iOS/Android.

## Arkitekturregler som ikke kan fravikes

- Bruk `*.server.ts` og `*.functions.ts` for serverkjørende kode og TanStack
  Start-serverfunksjoner. Ikke importer slike moduler fra klientkode.
  `supabaseAdmin` (service-role) er kun for serveren og omgår RLS.
- Behold den generiske annonsekjernen vertikal-agnostisk. Ikke importer
  `@/lib/vehicle/*` eller spre `isVehicle`-sjekker inn i generisk
  kategori-/annonsekode. Utvid `CategoryBehavior` i stedet. ESLint håndhever
  dette i utvalgte kjernefiler.
- Når du endrer RLS: søk gjennom **alle** migrasjoner for tabellen (`ALTER
TABLE public.<tabell>` og `CREATE POLICY`), siden gjeldende policy kan være
  fordelt over flere migrasjoner.
- Bruk eksisterende shadcn-primitiver og UI-mønstrene i `docs/UI-GUIDE.md`.
  Dette inkluderer `ResponsiveOverlay` for vanlige brukervendte dialoger,
  `FullscreenOverlay` for fullskjermtakeovers og `AlertDialog` for
  destruktive bekreftelser. Ikke bruk `confirm()` eller håndrullede varianter
  av etablerte primitiver.
- UI-tekst er på norsk bokmål. Bruk semantiske design-tokens, ikke hardkodede
  farger. Ivareta tilgjengelighet og native-/safe-area-reglene i UI-guiden.

## Verifisering og git-arbeidsflyt

- Kjør de mest relevante kontrollene for endringen: `bun run lint`,
  `bunx tsc --noEmit`, `bun run test`, og ved behov `bun run test:e2e` eller
  `bun run test:rls`. `test:rls` krever lokal Supabase-stack/Docker.
- Pre-commit formaterer og linter staged filer; pre-push kjører typecheck.
  Ikke stol bare på hookene når en passende kontroll kan kjøres lokalt.
- Hold commits atomiske og bruk den etablerte Conventional Commits-varianten.
  Ikke legg til `Co-Authored-By`-tagger.
- Test aldri endringer direkte i produksjon. Staging deployes fra
  `staging`-branchen; se `docs/STAGING.md`.
- Ikke kjør `supabase db push` mot et lenket prosjekt. Migrasjoner deployes av
  Supabase sin GitHub-integrasjon. Hvis appkode avhenger av en ny migrasjon,
  commit og push migrasjonen først, vent på at den er anvendt, og push deretter
  avhengig appkode.

## Leveranse

Rapporter kort hva som er endret og hvilke kontroller som ble kjørt. For hver
byggejobb skal svaret avsluttes med **Usikkerhet/verifisering**: list det som
ikke er verifisert eller antakelser/edge-caser som gjenstår. Hvis alt relevant
er verifisert, skriv eksplisitt at det er verifisert.
