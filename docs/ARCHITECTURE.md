# Arkitekturguide for Kaupet

Dette dokumentet er normativt for tekniske endringer i Kaupet. Målet er å
bevare tydelige grenser, én autoritativ implementasjon per ansvar og trygg
videreutvikling på web, iOS og Android. Ved motstrid gjelder den mest
områdespesifikke regelen i denne guiden, `UI-GUIDE.md` eller lokal README.

## 1. Systemoversikt

Kaupet består av:

- TanStack Start med React og Vite for web- og serverlaget.
- Cloudflare Workers som produksjonsruntime for serverfunksjoner.
- Supabase for Postgres, Auth, Storage, Realtime og RLS.
- Capacitor som native skall rundt samme webapplikasjon for iOS og Android.
- TanStack Query for servertilstand og React Hook Form/Zod for skjemaer.

Native og web deler domene, ruter og hovedkomponenter. Plattformtilpasning
skal ligge i tydelige presentasjonsgrenser, ikke i parallelle produktflyter.

## 2. Avhengighetsretning

Tillatt hovedretning:

```text
routes → features → components/ui
   ↓         ↓
 server functions / domain lib → Supabase
```

- `src/routes/` komponerer sider og knytter data, navigasjon og features
  sammen. Ruter skal ikke bli et nytt generelt bibliotek.
- `src/features/<navn>/` eier en avgrenset brukerflyt og dens presentasjon.
- `src/components/` inneholder delte, domenenøytrale komponenter.
- `src/lib/` inneholder domeneregler og plattformuavhengige hjelpere.
- `src/integrations/` eier klientoppsett mot eksterne systemer.

Unngå sirkler og «shared»-mapper uten et klart ansvar. Flytt først kode når
minst to reelle konsumenter trenger samme kontrakt.

## 3. Klient- og servergrense

- Serverkode navngis `*.server.ts` eller `*.functions.ts`.
- Klientkode skal aldri importere servermoduler direkte.
- `supabaseAdmin` og service-role er kun tillatt på serveren. Klienten bruker
  brukerens sesjon og RLS.
- Autorisasjon håndheves i databasen/RLS og gjentas ved behov på serveren for
  tydelige feil; klientkontroller er bare UX.
- Serverfunksjoner validerer alle eksterne data. Del Zod-/domeneregler når de
  faktisk er identiske, men stol aldri på at klienten allerede har validert.
- Same-origin serverfunksjoner skal beskyttes av TanStack Starts CSRF-
  middleware. Ikke deaktiver rammeverkets advarsel uten en dokumentert,
  testet alternativ mekanisme.
- Ikke logg fritekst, registreringsnummer, adresse, token eller andre
  personopplysninger i analyse eller generelle feillogger.
- Kall mot eksterne tredjeparts-API-er (f.eks. Hugging Face Inference
  Endpoints for AI-basert kategoriforslag i
  `category-suggestion-ai.server.ts`) skjer kun fra `*.server.ts`-moduler,
  aldri fra klientkode. Nøkler/endepunkt-URL-er lagres i sops-secrets
  (`secrets/`) og som Cloudflare Worker-secrets, aldri i `VITE_*`-variabler
  eller committet i klartekst.

## 4. Domenegrenser for annonser

Den generiske annonsekjernen er vertikal-agnostisk:

- Kategoriatferd uttrykkes gjennom `CategoryBehavior`, kategori-flow og
  registrerte feltgrupper/moduler.
- Kjøretøylogikk ligger i `src/lib/vehicle/` og kjøretøyspesifikke features.
- Generiske filer skal ikke importere `@/lib/vehicle/*` eller akkumulere
  `isVehicle`-spesialtilfeller. Utvid kontrakten i riktig grense i stedet.
- Salgsannonser og kjøpsønsker deler composer-skall, navigasjonssemantikk,
  utkastkontrakt, review og tilgjengelighetsmønster, men beholder separate
  domeneskjemaer og små domenehooks.
- Ikke slå sammen datamodeller bare fordi UI-et ligner. Del stabil kontrakt,
  ikke tilfeldig intern state.

## 5. Composer-arkitekturen

Opprettelsesflytene følger disse grensene:

- `ListingComposerShell` eier header, fremdrift, status, feiloppsummering,
  safe area, fokus ved sideskifte og fast footer.
- Flow-/feltgrupperegistre er autoritativ kilde for siderekkefølge og
  kategoriavhengig innhold i salgsflyten.
- Kjøpsønsket kan ha en mindre fast sidemodell, men bruker samme skall og
  interaksjonskontrakt.
- `ComposerReview` presenterer seksjoner. «Endre» går til riktig side og
  neste gyldige «Fortsett» returnerer til review uten datatap.
- Domenevalidering vises ved felt eller i `ComposerErrorSummary`; toast er
  for nettverks-, tillatelses- og systemfeil.
- Utkast er versjonerte og typebestemte. Lokal nyere state må ikke
  overskrives av eldre serverstate. Forkasting fjerner både lokal og eid
  serverkopi der dette finnes.
- Publisering blokkerer dobbeltinnsending og skal være idempotent der en
  retry kan forekomme.

## 6. Data, migrasjoner og RLS

- `supabase/migrations/` er historisk og append-only. Endre aldri en migrasjon
  som er pushet; legg til en ny korrigerende migrasjon.
- Søk gjennom alle migrasjoner for tabellen og funksjonen før en endring.
- `CREATE OR REPLACE FUNCTION` må bevare tidligere sikkerhetsherding,
  feilisolering, `search_path`, rettigheter og forretningsregler. Sammenlign
  alltid med siste effektive definisjon, ikke bare første migrasjon.
- RLS testes med eier, annen bruker og anonym der tabellen eksponeres.
- Test-fixtures ryddes eksplisitt i avhengighetsrekkefølge før auth-brukeren
  slettes. En lekket fixture skal ikke påvirke senere tester.
- Migrasjoner deployes via Supabase sin GitHub-integrasjon. Ikke bruk manuell
  `supabase db push` mot lenket miljø.
- Når appkode avhenger av nytt skjema: push migrasjonen, vent til den er
  anvendt, og push deretter den avhengige appkoden.

## 7. Native plattformgrense

- Capacitor er et skall, ikke en separat produktimplementasjon.
- Skill layoutdeteksjon (`useFormFactor`, `useIsNative`) fra faktisk plugin-
  tilgjengelighet (`nativePlatform`). Native-emulering i nettleser skal ikke
  kalle utilgjengelige plugins.
- Bruk wrapperne i `src/lib/` for haptikk, tastatur og plattformintegrasjoner.
- Android system-tilbake og iOS-kantsveip skal følge samme historikkmodell
  som synlig tilbakehandling.
- Safe area, dynamisk viewport og appnavigasjon uttrykkes med etablerte CSS-
  variabler; unngå lokale konstante høyder.

## 8. Tilstand, feil og observabilitet

- Servertilstand ligger i TanStack Query; lokal UI-state ligger nærmeste
  ansvarlige feature. Ikke kopier serverobjekter til global state uten behov.
- Loading, tom, feil og ferdig er eksplisitte tilstander. Ikke vis «ingen
  data» mens første lasting pågår.
- Feil som brukeren kan rette, må være ved handlingen/feltet. Tekniske feil
  formateres gjennom etablerte feilhjelpere uten å lekke interne detaljer.
- Produktanalyse bruker kontrollerte nøkler og enums. Aldri send rå
  feltverdier. Nye hendelser skal ha et konkret beslutningsformål.

## 9. Testing og endringsstrategi

- Enhetstester dekker domeneregler og små kontrakter.
- Komponenttester dekker fokus, semantikk og interaksjon som lett kan
  regresjonstestes uten full stack.
- RLS-tester beviser datatilgang og migrasjonsatferd.
- Playwright dekker kritiske brukerreiser på desktop og mobil, med page
  objects for delte composerhandlinger.
- Visual regression brukes på få, stabile milepælsflater og avtalte
  viewporter; ikke snapshot hele produktet uten et konkret formål.
- Rett rotårsaken i den laveste delte grensen. Hold commits atomiske og ikke
  bland migrasjon, avhengig appkode og urelatert opprydding.

## 10. Arkitekturbeslutninger

Når en endring introduserer en ny systemgrense, datakilde, plattformvariant
eller irreversibel avhengighet, dokumenter beslutningen kort i
`docs/decisions/YYYY-MM-DD-<navn>.md` med:

1. kontekst og problem;
2. valgt løsning;
3. alternativer som faktisk ble vurdert;
4. konsekvenser og reverseringsstrategi.

Ikke opprett ADR for vanlig komponentarbeid eller små refaktoreringer.

## 11. Sjekkliste før arkitekturendring

- Finnes ansvaret allerede i `lib`, `components` eller `features`?
- Respekterer importene klient/server- og domenegrensene?
- Er databasen fortsatt autoritativ for tilgang og integritet?
- Bevarer en erstattet databasefunksjon all tidligere hardening?
- Fungerer løsningen i web og Capacitor uten parallell forretningslogikk?
- Har endringen minste relevante test på riktig nivå?
- Er rollback mulig, og må migrasjon/appkode deployes i to steg?
