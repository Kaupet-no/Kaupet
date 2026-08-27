# Teststrategi for Kaupet

Normativ teststrategi for hele Kaupet-repoet, bygget på ISTQB CTFL 4.0
(testprosess, testnivåer, testtyper, testdesignteknikker, risikobasert
testing, defektstyring) og ISO/IEC 25010 (kvalitetsegenskaper).

Dokumentet har to lesere:

1. **Mennesker** (testleder, utviklere, produktansvarlig) — § 1–§ 9.
2. **AI-agenter med begrenset kontekst** — § 10 (playbooks) og § 11
   (testkatalog). En agent skal kunne løse en oppgave ved å lese
   _én_ playbook og _ett_ testcase-avsnitt, uten å lese resten.

Ved motstrid: `docs/ARCHITECTURE.md` er normativ for arkitektur, `CLAUDE.md`
for arbeidsvaner, dette dokumentet for test.

---

## 1. Testpolicy og mål

Kaupet er en markedsplass der brukere legger ut eiendeler, betaler for
promotering og kommuniserer med fremmede. Tillit er produktet. En feil som
lekker en telefonnummer, dobbeltbelaster et Vipps-kjøp eller mister et
halvferdig annonseutkast koster mer enn en manglende funksjon.

Testmål, prioritert:

| #   | Mål                                                           | Hvorfor                                  |
| --- | ------------------------------------------------------------- | ---------------------------------------- |
| M1  | Ingen uautorisert datatilgang                                 | RLS er eneste reelle autorisasjonsgrense |
| M2  | Ingen tap av brukerdata                                       | Utkast, bilder, meldinger, annonser      |
| M3  | Ingen dobbelt-/feilbelastning                                 | Vipps-integrasjonen er irreversibel utad |
| M4  | Kritiske brukerreiser fungerer på web, iOS og Android         | Én kodebase, tre skall                   |
| M5  | Opplevd kvalitet: ytelse, tilgjengelighet, polerte tilstander | Tillit                                   |
| M6  | Regresjonsvern skalerer med kodebasen                         | Dekningsgrad ratches opp, se § 9         |

**Testprinsipp som gjelder over alt annet:** en feilrapport beskriver et
symptom. Testen skrives mot _årsaken i den laveste delte grensen_, ikke mot
symptomet i den ene ruten der det ble observert (se `CLAUDE.md`, ARCHITECTURE
§ 9).

## 2. Kvalitetsegenskaper i scope (ISO 25010)

| Egenskap                                          | I scope    | Hvordan dekket                                           |
| ------------------------------------------------- | ---------- | -------------------------------------------------------- |
| Funksjonell korrekthet/egnethet                   | Ja, høyest | Enhets-, komponent-, E2E-test                            |
| Sikkerhet (tilgang, integritet, konfidensialitet) | Ja, høyest | RLS-test, server-boundary, signaturtest, statisk analyse |
| Pålitelighet (feilhåndtering, gjenoppretting)     | Ja         | Offline-/retry-caser, utkastgjenoppretting               |
| Ytelseseffektivitet                               | Ja         | Bundle-budsjett, Web Vitals, query-profilering           |
| Brukbarhet (inkl. tilgjengelighet)                | Ja         | A11y-caser, semantisk E2E, manuell QA                    |
| Kompatibilitet                                    | Ja         | Playwright-prosjekter, Capacitor iOS/Android             |
| Vedlikeholdbarhet                                 | Delvis     | Lint, typecheck, arkitekturregler i eslint               |
| Portabilitet                                      | Delvis     | Cloudflare Workers-runtime, Capacitor                    |

## 3. Testnivåer og hvor de bor i repoet

ISTQB-nivåene mappet konkret til dette repoet:

| Nivå                     | Verktøy                                                     | Filmønster                                           | Kommando                                                             | Kjøres                   |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------ |
| Komponenttest (unit)     | Vitest                                                      | `src/**/*.test.ts`                                   | `bun run test`                                                       | Hver CI-kjøring          |
| Komponentintegrasjon     | Vitest + Testing Library                                    | `src/**/*.test.tsx`                                  | `bun run test`                                                       | Hver CI-kjøring          |
| Systemintegrasjon (data) | Vitest mot lokal Supabase                                   | `src/**/*.integration.test.ts`                       | `bun run test:rls`                                                   | CI-jobb `rls`            |
| Systemtest (E2E)         | Playwright                                                  | `e2e/*.spec.ts`                                      | `bun run test:e2e`                                                   | PR mot `main` + dispatch |
| Visuell regresjon        | Playwright screenshots                                      | `e2e/*.visual.spec.ts`                               | samme                                                                | samme                    |
| Statisk test             | ESLint, tsc, prettier, boundary-script, `bun audit`, CodeQL | —                                                    | `bun run lint`, `bunx tsc --noEmit`, `bun run check:server-boundary` | Hver CI-kjøring + hooks  |
| Byggverifikasjon         | Vite + bundle-budsjett                                      | —                                                    | `bun run build && bun run check:bundle`                              | Hver CI-kjøring          |
| Native enhetstest        | Gradle                                                      | `android/**`                                         | `./gradlew test<Flavor>DebugUnitTest`                                | CI-jobb `native-android` |
| Akseptansetest (manuell) | Sjekklister                                                 | `docs/plans/ANNONSEOPPRETTELSE-MANUELL-QA.md` + § 12 | —                                                                    | Før release              |

**Nivåvalgstabell.** Slå opp raden som passer og bruk nivået den gir. Ikke
vurder — slå opp. Passer flere rader, velg den øverste.

| Det du tester                                                  | Nivå      | Filnavn                           | Kommando                                           |
| -------------------------------------------------------------- | --------- | --------------------------------- | -------------------------------------------------- |
| Ren funksjon, domeneregel, parser, validator, formatering      | Unit      | `<modul>.test.ts`                 | `bun run test -- <sti>`                            |
| Hook uten DOM                                                  | Unit      | `<hook>.test.ts`                  | `bun run test -- <sti>`                            |
| Fokus, ARIA, etikett, tastatur, betinget rendering, tilstander | Komponent | `<komponent>.test.tsx`            | `bun run test -- <sti>`                            |
| Hvem får lese/skrive rad X                                     | RLS       | `src/lib/rls.integration.test.ts` | `bun run test:rls`                                 |
| Serverfunksjon: autorisasjon, validering, idempotens           | Unit      | `<modul>.test.ts`                 | `bun run test -- <sti>`                            |
| Flere sider, navigasjon, ekte publisering, innlogging          | E2E       | `e2e/<flyt>.spec.ts`              | `bunx playwright test <fil> --project=desktop-web` |
| Layout/visuell kontrakt på avtalt milepælsflate                | Visuell   | `e2e/<flyt>.visual.spec.ts`       | `bunx playwright test <fil> --project=visual-web`  |

Å skrive en E2E-test for noe en unit-test kan bevise er en feil, ikke
grundighet. Finner du ingen rad som passer: **stopp og eskaler** (§ 16.3).

## 4. Testtyper

- **Funksjonell test** — hoveddelen. Se katalogen i § 11.
- **Ikke-funksjonell test** — ytelse (§ 11.14), tilgjengelighet (§ 11.15),
  sikkerhet (§ 11.13), kompatibilitet (§ 11.16).
- **White-box/strukturell test** — dekningsgradsmålinger via
  `bun run test:coverage`, med håndhevet terskel i `vitest.config.ts`.
- **Endringsrelatert test** — confirmation test (samme case reproduseres etter
  fiks) og regresjonstest (hele suiten). Hver rettet P0/P1-feil **skal**
  etterlate en automatisert test som feiler uten fiksen.

## 5. Testdesignteknikker som skal brukes

Agenter skal navngi teknikken i testens beskrivelse der det er relevant.

| Teknikk                | Bruk i Kaupet                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Ekvivalensklasser      | Pris, år, kilometerstand, tekstlengder, kategorier                                                     |
| Grenseverdier          | 0/1-pris, min/maks årstall, maks bildeantall, maks tegn, `request-size`                                |
| Beslutningstabell      | Kategoriavhengige feltgrupper, promoteringsstatus, moderasjonstilstand                                 |
| Tilstandsovergang      | Composer-navigasjon, utkast → publisert → solgt → republisert, betalingsstatus, samtale blokkert/aktiv |
| Use case-basert        | Kritiske brukerreiser (§ 12)                                                                           |
| Feilgjetting           | Dobbelttrykk, nettbrudd, tilbake-knapp, tvangsavslutning, klokkeskifte, tomme lister                   |
| Sjekklistebasert       | A11y, ytelse, polish (§ 11.15, § 11.14, § 11.17)                                                       |
| Kombinatorisk (parvis) | Kategori × plattform × autentisert/anonym                                                              |

## 6. Risikoanalyse (risikobasert testing)

Risikonivå = Sannsynlighet × Skade. R1 = høyest testintensitet.

| ID  | Risiko                                                                              | Sanns.  | Skade   | Nivå   | Primær dekning                                     |
| --- | ----------------------------------------------------------------------------------- | ------- | ------- | ------ | -------------------------------------------------- |
| R1  | RLS-hull eksponerer andres data (meldinger, profil, utkast, e-post)                 | Middels | Kritisk | **R1** | § 11.12 RLS-caser, obligatorisk ved hver migrasjon |
| R2  | Vipps: dobbeltbelastning, uteblitt capture, feil refusjon, forfalsket webhook       | Middels | Kritisk | **R1** | § 11.9                                             |
| R3  | Datatap i composeren (utkast overskrevet av eldre serverstate, forkastet ved krasj) | Høy     | Høy     | **R1** | § 11.3                                             |
| R4  | Service-role/hemmelighet lekker til klientbundle                                    | Lav     | Kritisk | **R1** | § 11.13 SEC-01..04                                 |
| R5  | Publisering oppretter flere annonser ved retry/dobbelttrykk                         | Middels | Høy     | **R2** | CRE-30..33                                         |
| R6  | Kjøretøyoppslag (SVV) feiler/timer ut og blokkerer flyten                           | Høy     | Middels | **R2** | § 11.4                                             |
| R7  | Søk gir feil/tomme treff (synonym, negasjon, filterkoding)                          | Høy     | Middels | **R2** | § 11.6                                             |
| R8  | Native tilbakenavigasjon/overlay-historikk låser brukeren                           | Middels | Høy     | **R2** | § 11.11                                            |
| R9  | Push-varsler dupliseres eller sendes til feil bruker                                | Middels | Høy     | **R2** | § 11.10                                            |
| R10 | Ytelsesregresjon: bundle, LCP, store bilder                                         | Høy     | Middels | **R2** | § 11.14                                            |
| R11 | Tilgjengelighetsbrudd (fokusfelle, manglende etikett, kontrast)                     | Høy     | Middels | **R2** | § 11.15                                            |
| R12 | Moderasjon/admin-handling utført av ikke-admin                                      | Lav     | Kritisk | **R2** | § 11.8                                             |
| R13 | PII i logger/analyse (regnr, adresse, fritekst)                                     | Middels | Høy     | **R2** | SEC-10..12                                         |
| R14 | Migrasjon og avhengig appkode deployes i feil rekkefølge                            | Middels | Høy     | **R2** | § 11.12 DB-20 + release-sjekkliste                 |
| R15 | Upolerte tilstander (tom/laster/feil) svekker tillit                                | Høy     | Lav     | **R3** | § 11.17                                            |

**Regel:** R1-områder skal ha automatisert dekning på minst to nivåer
(f.eks. unit + RLS, eller unit + E2E). R3 kan dekkes av sjekkliste alene.

## 7. Testmiljøer og testdata

| Miljø                             | Bruk                                       | Merknad                                                                           |
| --------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| Lokalt (`bun run dev`)            | Utvikling, Vitest, Playwright              | `.env` fra `bun run secrets:decrypt`                                              |
| Lokal Supabase (`supabase start`) | RLS-integrasjonstester                     | Krever Docker; `scripts/run-rls-tests.mjs` leser URL/nøkler fra `supabase status` |
| Staging (`staging.kaupet.no`)     | Manuell QA, native builds, Vipps testmodus | **All manuell QA skal skje her, aldri i produksjon**                              |
| Produksjon (`kaupet.no`)          | Kun røyktest etter deploy (§ 12.3)         | Ingen testdata skal opprettes                                                     |

Testdataregler:

1. Brukere: `test+<rolle>-<dato>@…`. Aldri ekte personopplysninger.
2. Fixtures i RLS-tester ryddes eksplisitt i avhengighetsrekkefølge før
   auth-brukeren slettes (ARCHITECTURE § 6). En lekket fixture er en
   testdefekt med samme alvorlighet som en produktdefekt.
3. Vipps kjøres i testmodus (`getVippsMode`). Ingen test skal treffe
   produksjonsendepunktet.
4. Kjøretøyoppslag mot SVV mockes i alle automatiske tester; ekte oppslag
   kun i manuell QA.

## 8. Inngangs- og utgangskriterier

**Inngangskriterier (før testkjøring anses meningsfull)**

- `bunx tsc --noEmit` og `bun run lint` er grønne.
- Bygget lykkes (`bun run build`).
- Nye migrasjoner er anvendt i testmiljøet.

**Utgangskriterier for en PR**

- Alle CI-jobber grønne (`verify`, `rls`, `native-android`, `e2e` på PR mot `main`).
- Ingen åpne S0/S1-defekter i endret område.
- Hver ny/endret domeneregel har minst én test på laveste relevante nivå.
- Hver rettet feil har en confirmation test som feiler uten fiksen.
- Dekningsterskelen i `vitest.config.ts` er ikke senket.

**Utgangskriterier for release til produksjon**

- Utgangskriterier for PR, pluss:
- Manuell akseptanse-sjekkliste § 12 gjennomført på staging for berørte reiser.
- Røyktest § 12.3 utført etter deploy.
- Kjente S2-defekter er dokumentert og akseptert av produktansvarlig.

## 9. Defektstyring og dekningsratchet

**Alvorlighet (severity)**

| Nivå | Definisjon                                                | Eksempel                        |
| ---- | --------------------------------------------------------- | ------------------------------- |
| S0   | Datalekkasje, feilbelastning, datatap, tjeneste nede      | Annen brukers meldinger synlige |
| S1   | Kritisk reise blokkert, ingen workaround                  | Kan ikke publisere annonse      |
| S2   | Funksjonsfeil med workaround, tydelig ytelses-/a11y-brudd | Filter nullstilles ved tilbake  |
| S3   | Kosmetikk, tekst, mindre polish                           | Feil mellomrom i pristekst      |

**Prioritet** settes uavhengig av alvorlighet av testleder (P0 = fiks nå,
P3 = backlog). S0/S1 er alltid P0.

**Defektrapport-mal** (agenter skal bruke _nøyaktig_ denne):

```
ID: DEF-<område>-<løpenr>
Tittel: <symptom i én setning>
Alvorlighet: S0|S1|S2|S3   Prioritet: P0|P1|P2|P3
Miljø: lokal|staging|prod — nettleser/enhet — build-SHA
Testcase: TC-XXX-NN (eller "eksplorativ")
Steg:
  1. …
Forventet: …
Faktisk: …
Bevis: <fil:linje | logglinje | skjermbilde-sti>
Mistenkt årsak (laveste delte grense): <fil:linje>
Foreslått testnivå for regresjonsvern: unit|component|rls|e2e
```

**Dekningsratchet.** Terskelen i `vitest.config.ts` står i dag på
statements 9 / branches 6 / functions 5 / lines 9. Den er et _gulv_, ikke et
mål. Ratchet-regel: når en modul får ny testdekning, hev terskelen til
nærmeste hele prosent under målt verdi i samme PR. Terskelen skal aldri
senkes; en senking krever eksplisitt godkjenning fra testleder i PR-teksten.

Måltrapp: 9 % → 20 % (Q+1) → 35 % (Q+2) på statements, med prioritert
rekkefølge `src/lib/` → `src/features/*/` (domenehooks) → `src/routes/`.

---

## 10. Playbooks for AI-agenter

Hver playbook er selvstendig. En agent som får en oppgave skal:

1. Identifisere område og testnivå (§ 3).
2. Åpne **én** playbook nedenfor og følge stegene i rekkefølge.
3. Hente konkrete caser fra § 11.
4. Rapportere i formatet playbooken angir.

**Globale regler for alle agenter**

- G1. Les eksisterende testfiler i samme mappe før du skriver en ny. Følg
  deres mønster (navngiving, mocking, språk). Ny testinfrastruktur krever
  begrunnelse.
- G2. Testnavn skrives på norsk, i presens, og beskriver _atferden_, ikke
  implementasjonen. Bra: `"beholder filtre som utkast til brukeren anvender dem"`.
  Dårlig: `"kaller setFilters"`.
- G3. Aldri assert på implementasjonsdetaljer (interne felt, klassenavn,
  kall-tellinger) når observerbar atferd finnes.
- G4. En test som ikke kan feile er verre enn ingen test. Verifiser ved å
  midlertidig bryte koden og se testen feile; nevn dette i rapporten.
- G5. Ikke endre produksjonskode for å gjøre en test enklere, med unntak av
  `data-testid` etter konvensjonen i `CLAUDE.md` (kun når `getByRole`/
  `getByLabel` er tvetydig).
- G6. Ikke commit hemmeligheter, ekte e-postadresser, regnr eller
  produksjons-ID-er i testdata.
- G7. Hvis du oppdager en produktfeil mens du skriver test: skriv defekt-
  rapporten (§ 9) _og_ la testen stå som feilende med `.fail`/skip-markør og
  referanse til defekt-ID. Ikke skjul funnet ved å svekke asserten.
- G8. Kjør alltid det minste relevante kommandosettet før du rapporterer
  ferdig, og lim inn faktisk utdata. Påstander uten utdata regnes som ikke
  verifisert.

### PB-1 — Skrive enhetstest (domeneregel, parser, validator)

```
1. Finn modulen i src/lib/ eller src/features/<navn>/.
2. Sjekk om <modul>.test.ts allerede finnes. Utvid den fremfor å lage ny fil.
3. Skriv én test per rad i denne obligatoriske datamatrisen. Hopp kun over
   en rad hvis den er umulig for typen — og skriv da hvorfor i rapporten.

   | Rad | Input |
   | --- | --- |
   | 1 | typisk gyldig verdi |
   | 2 | nedre grense (minste tillatte) |
   | 3 | nedre grense minus én |
   | 4 | øvre grense (største tillatte) |
   | 5 | øvre grense pluss én |
   | 6 | tom verdi (`""`, `[]`, `{}`) |
   | 7 | `null` og `undefined` |
   | 8 | feil type (streng der tall forventes) |
   | 9 | norske tegn æøå + emoji (for tekst) |
   | 10 | ekstremverdi (svært lang streng, svært stort tall) |
4. Skriv testene. Ingen mocking av det du faktisk tester.
5. Kjør: bun run test -- <filsti>
6. Bryt kilden midlertidig (G4), bekreft rødt, gjenopprett.
7. Kjør: bunx tsc --noEmit
8. Rapporter: filsti, antall caser, teknikker brukt, testutdata.
```

### PB-2 — Skrive komponenttest (fokus, semantikk, interaksjon)

```
1. Krever *.test.tsx og Testing Library. Se f.eks.
   src/features/listing-creation/composer-error-summary.test.tsx som mal.
2. Query-prioritet: getByRole > getByLabelText > getByText > getByTestId.
   getByTestId kun ved dokumentert tvetydighet.
3. Dekk minst: rendering av hver eksplisitte tilstand (laster/tom/feil/ferdig
   der komponenten har dem), tastaturinteraksjon, ARIA-navn på interaktive
   elementer, at feil er koblet til feltet (aria-describedby/aria-invalid).
4. Bruk userEvent, ikke fireEvent, for menneskelig interaksjon.
5. Kjør: bun run test -- <filsti>
6. Rapporter som PB-1.
```

### PB-3 — Skrive/utvide E2E-test (Playwright)

```
1. Vurder først om saken kan dekkes i PB-1/PB-2. E2E er dyrest — kun for
   flersides reiser, ekte navigasjon eller publisering.
2. Gjenbruk page objects i e2e/pages/ (listing-wizard.ts,
   want-listing-wizard.ts). Legg ny delt handling i page object, ikke i spec.
3. Følg testid-konvensjonen i CLAUDE.md: wizard-step-<group-key>,
   wizard-next-button, publish-listing-button osv.
4. Ingen faste sleep-kall. Bruk Playwrights auto-waiting og web-first
   assertions (expect(locator).toBeVisible()).
5. Testen skal være uavhengig: den oppretter sine egne data og tåler å kjøre
   to ganger etter hverandre.
6. Kjør: bun run test:e2e   (evt. bunx playwright test <fil> --project=desktop-web)
7. Ved visuell test: kun avtalte milepælsflater og eksisterende viewporter
   (visual-web, visual-phone, visual-landscape, visual-tablet). Nye
   baselines krever begrunnelse i PR-teksten.
8. Rapporter: spec-fil, prosjekter kjørt, utdata, evt. trace-sti.
```

### PB-4 — Skrive RLS-/datatilgangstest

```
1. Krever lokal stack: supabase start (Docker). Testene ligger i
   src/lib/rls.integration.test.ts.
2. For hver tabell som eksponeres skal minst tre roller testes:
   eier, annen innlogget bruker, anonym. Der relevant også: moderator,
   admin, utestengt/suspendert bruker.
3. Test både SELECT, INSERT, UPDATE og DELETE. En tabell som kun testes for
   SELECT er ikke dekket.
4. Assert på *fravær* av rader (tom liste) så vel som på feil — RLS skjuler
   ofte i stedet for å avvise.
5. Rydd fixtures eksplisitt i avhengighetsrekkefølge før auth-brukeren
   slettes.
6. Søk gjennom ALLE migrasjoner for tabellen før du antar gjeldende policy:
   grep -rn "ALTER TABLE public.<tabell>\|CREATE POLICY" supabase/migrations
7. Kjør: bun run test:rls
8. Rapporter: tabell, roller × operasjoner dekket, utdata.
```

### PB-5 — Eksplorativ feiljakt (charter-basert)

Tidsboksede sesjoner på 30–60 min per charter. Charter-mal:

```
CHARTER: Utforsk <område> med <teknikk/persona> for å oppdage <risiko R#>.
Enhet/miljø: …
Notater (fortløpende): observasjon → forventet → faktisk
Funn: DEF-… (§ 9-mal)
Dekning: hva ble berørt, hva ble ikke berørt
```

Obligatoriske feilgjettings-angrep i hvert charter:

- Dobbelttrykk på hver primærhandling.
- Nettverk av/på midt i en lagring og midt i en publisering.
- Systemtilbake / kantsveip / nettleserens tilbakeknapp fra hver overlay.
- Tvangsavslutt app midt i flyten, start på nytt.
- Kjør samme handling i to faner/enheter samtidig.
- Tomme lister, ett element, svært mange elementer.
- Svært lang tekst, emoji, norske tegn, RTL-tegn, HTML/SQL-lignende input.
- Ekstremverdier: pris 0, pris 999 999 999, år 1900, km 0.

### PB-6 — Ytelsestest

```
1. Statisk budsjett: bun run build && bun run check:bundle
   (grenser: 450 KiB JS, 180 KiB CSS per fil — scripts/check-bundle-budget.mjs)
2. Web Vitals: mål LCP, INP, CLS på ruter i § 11.14 mot staging, mobil-profil
   med nettverksstrupning (Fast 3G) og 4x CPU-throttling.
3. Nettverk: tell forespørsler per rute. Flag N+1-mønstre (én forespørsel per
   listeelement) og ikke-signerte/usignerte bildeurler som lastes på nytt.
4. Bilder: bekreft komprimering før opplasting (src/lib/image-compression.ts)
   og at listekort ikke laster fullstørrelsesbilder.
5. Rapporter tall, ikke inntrykk. Sammenlign mot budsjettene i § 11.14.
```

### PB-7 — Tilgjengelighetstest

```
1. Automatisk: kjør akse-/landmark-sjekk i tråd med
   e2e/semantic-quality.spec.ts (landemerker, ingen nøstede interaktive
   elementer). Utvid den spec-en fremfor å lage en ny mekanisme.
2. Tastatur: fullfør reisen uten peker. Fokus alltid synlig, logisk
   rekkefølge, ingen fokusfeller, Escape lukker overlay.
3. Skjermleser: VoiceOver (iOS/Safari) og TalkBack (Android). Bekreft
   sidetittel, "Steg X av Y", lagringsstatus, feltetikett, obligatorisk/
   valgfri, feiltekst, knappetilstand — i logisk rekkefølge og uten duplikat.
4. Tekstforstørrelse: 200 % (iOS Dynamic Type, Android font scale, web zoom),
   samt 320 px CSS-bredde. Ingen avkorting, overlapp eller horisontal scroll.
5. Kontrast og fargeuavhengighet i lys/mørk modus.
6. Rapporter per WCAG 2.1 AA-suksesskriterium som brytes.
```

### PB-8 — Verifisere en feilretting (confirmation + regresjon)

```
1. Reproduser feilen på koden FØR fiksen. Uten reproduksjon er fiksen ikke
   verifiserbar — si det eksplisitt i rapporten.
2. Skriv testen som feiler uten fiksen, på laveste delte grense (§ 1).
3. Grep alle kallere av funksjonen som endres:
   grep -rn "<funksjonsnavn>" src/ | grep -v test
   Bekreft at søskenkallere ikke har samme feil. Hvis de har det, hører
   fiksen og testen hjemme lenger ned.
4. Kjør full suite: bun run test && bunx tsc --noEmit && bun run lint
5. Rapporter: defekt-ID, testfil, kallere sjekket, utdata.
```

---

## 11. Testkatalog

Kolonner: **Nivå** (U=unit, C=komponent, R=RLS, E=E2E, M=manuell/eksplorativ),
**P** (prioritet P0–P3), **Teknikk** (se § 5).

Alle caser er skrevet slik at forventet resultat er verifiserbart uten
tilgang til implementasjonen.

### 11.1 Autentisering og konto

| ID      | Nivå | P   | Tittel                                                      | Forventet resultat                                                                                                    |
| ------- | ---- | --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AUTH-01 | U    | P0  | Passordstyrke-regler (`password-strength.ts`)               | Grenseverdier for lengde/kompleksitet gir riktig styrkenivå; tom streng gir laveste nivå uten unntak                  |
| AUTH-02 | U    | P0  | Auth-skjemavalidering (`auth-schemas.ts`)                   | Ugyldig e-post, for kort passord og manglende felt gir feltspesifikke feil, ikke generisk feil                        |
| AUTH-03 | U    | P0  | `auth-return.ts` returnerer bare til interne stier          | Absolutte eksterne URL-er, `//evil.no` og `javascript:` avvises → open redirect umulig                                |
| AUTH-04 | U    | P1  | `pending-auth-intent.ts` lagrer og henter intensjon én gang | `take…` tømmer lageret; utløpt/ugyldig payload gir `null` uten kast                                                   |
| AUTH-05 | E    | P0  | Innlogging og redirect tilbake til opprinnelig side         | Bruker som klikket «favoritt» anonymt havner tilbake på samme annonse, med handlingen fullført                        |
| AUTH-06 | E    | P0  | Beskyttede ruter krever sesjon                              | Anonym på `/mine-annonser`, `/meldinger`, `/ny-annonse` sendes til auth, ikke til feilside                            |
| AUTH-07 | E    | P1  | Passordtilbakestilling                                      | Ugyldig/utløpt token gir forklarende melding, ikke stack trace; gyldig token setter nytt passord og logger inn        |
| AUTH-08 | R    | P0  | Utestengt bruker (`user_bans`)                              | Kan ikke opprette annonse, melding eller anmeldelse; eksisterende data er fortsatt skjult/vist etter policy           |
| AUTH-09 | R    | P0  | Suspendert bruker (`user_suspensions`)                      | Skrivetilgang blokkert i suspensjonsperioden, gjenopprettes automatisk etter utløp                                    |
| AUTH-10 | E+R  | P1  | Kontosletting (`account_deletions`)                         | Sletting fjerner/anonymiserer eierdata etter policy; samtalepartner ser konsistent tilstand, ikke ødelagte referanser |
| AUTH-11 | M    | P1  | Sesjonsutløp midt i en flyt                                 | Bruker mister ikke utfylte data; blir bedt om å logge inn og returneres til samme sted                                |

### 11.2 Kategorier og landingsflater

| ID     | Nivå | P   | Tittel                                                                                       | Forventet resultat                                                                                                 |
| ------ | ---- | --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| CAT-01 | U    | P0  | `categories.ts` bygger tre og breadcrumb korrekt                                             | Foreldreløs node, syklisk referanse og dyp nesting håndteres uten uendelig løkke                                   |
| CAT-02 | U    | P0  | `category-behavior.ts` returnerer riktig atferd per kategori                                 | Ukjent kategori-ID faller tilbake til generisk atferd, ikke `undefined`                                            |
| CAT-03 | U    | P1  | `category-filters.ts` er vertikal-agnostisk                                                  | Modulen importerer ikke `@/lib/vehicle/*` (håndheves også av eslint); kjøretøyatferd kommer via `CategoryBehavior` |
| CAT-04 | U    | P1  | `slug.ts` normalisering                                                                      | Æ/Ø/Å, mellomrom, doble bindestreker og store bokstaver gir stabil slug; `normalizeSlugForMatch` er idempotent     |
| CAT-05 | U    | P1  | `use-category-drilldown` navigasjonstilstand                                                 | Tilbake fra dypeste nivå går ett nivå opp, ikke til rot                                                            |
| CAT-06 | E    | P1  | Kategorilandingsside via `$kaupetCode`                                                       | Ukjent kode gir 404-flate med navigasjon videre, ikke tom side                                                     |
| CAT-07 | U    | P2  | `category-icons.ts` / `category-fonts.ts` fallback                                           | Manglende ikon/font gir definert fallback, aldri tomt element                                                      |
| CAT-08 | R    | P1  | `categories`/`category_filters`/`category_flows` er lesbare anonymt, skrivbare kun for admin | Anonym SELECT OK; INSERT/UPDATE/DELETE avvist for vanlig bruker                                                    |
| CAT-09 | U    | P2  | Kategorisynk staging→produksjon (`category-sync.functions.ts`)                               | Synk er idempotent: kjørt to ganger gir samme resultat og ingen duplikater                                         |

### 11.3 Annonseopprettelse (composer) — R1/R3

Høyeste testintensitet. Dekker `src/features/listing-creation/` og
`field-groups/`.

| ID     | Nivå | P   | Tittel                                                                          | Forventet resultat                                                                                                     |
| ------ | ---- | --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| CRE-01 | U    | P0  | `field-groups/registry.ts` gir riktig siderekkefølge per kategori               | Beslutningstabell: hver kategori-flow gir forventet gruppesekvens; ukjent kategori gir generisk sekvens                |
| CRE-02 | U    | P0  | `field-groups/validators.ts` — tittel                                           | Grenser: tom, 1 tegn, maks, maks+1, kun mellomrom                                                                      |
| CRE-03 | U    | P0  | `validators.ts` — pris                                                          | 0 (gratis) er gyldig hvis flyten tillater det; negativ, ikke-numerisk, ekstremt stor avvises med feltspesifikk melding |
| CRE-04 | U    | P0  | `validators.ts` — beskrivelse og nøkkelord                                      | Maks lengde, HTML-lignende input beholdes som tekst (ikke tolket)                                                      |
| CRE-05 | U    | P0  | `modules/validators.ts` — kategoriavhengige attributter                         | Manglende obligatorisk attributt blokkerer; valgfri tom passerer                                                       |
| CRE-06 | U    | P0  | Leveranse/lokasjon-validering er kategori-uavhengig                             | Både generisk og kjøretøy validerer likt (regresjonsvern for commit `71fa7bd`)                                         |
| CRE-07 | C    | P0  | `composer-error-summary` annonseres og lenker til felt                          | Feiloppsummering har rolle/`aria-live`, annonseres én gang, fokus flyttes til første feilfelt ved klikk                |
| CRE-08 | C    | P0  | `listing-composer-shell` — steg-indikator og fokus ved sideskifte               | «Steg X av Y» er korrekt og lest opp; fokus settes på sidetittel ved bytte                                             |
| CRE-09 | U    | P0  | `composer-navigation` — neste/forrige og hopp fra review                        | «Endre» går til riktig side; neste gyldige «Fortsett» returnerer til review uten datatap                               |
| CRE-10 | C    | P0  | `composer-review` viser alle utfylte seksjoner                                  | Tomme valgfrie seksjoner vises som «ikke utfylt», ikke som blanke rader                                                |
| CRE-11 | U    | P0  | `use-draft-autosave` — nyere lokal state overskrives ikke av eldre server-state | Tilstandsovergang: lokal v3 + server v2 → v3 vinner, ingen tap                                                         |
| CRE-12 | U    | P0  | Utkast er versjonert og typebestemt                                             | Utkast av feil type/versjon ignoreres i stedet for å krasje eller blande felt                                          |
| CRE-13 | U    | P0  | `draft-image-store` — bilder overlever reload                                   | Bilder gjenopprettes med riktig rekkefølge; korrupt post forkastes uten å ta med de andre                              |
| CRE-14 | C    | P0  | `discard-listing-dialog` forkaster både lokalt og eid serverutkast              | Etter forkasting finnes ingen rester ved ny start av flyten                                                            |
| CRE-15 | U    | P1  | `use-listing-title-hints` / `use-title-based-listing-hints`                     | Hint er deterministiske for samme tittel; tom tittel gir ingen hint, ikke feil                                         |
| CRE-16 | U    | P1  | `use-location-picker` / `use-edit-location-picker`                              | Avbrutt valg beholder forrige verdi; geokoding-feil vises som feltfeil                                                 |
| CRE-17 | U    | P1  | `use-nominatim-search` debounce og feilhåndtering                               | Nettverksfeil gir tom liste + feiltilstand, ikke uendelig spinner                                                      |
| CRE-18 | C    | P1  | `image-uploader` — antall, rekkefølge, sletting                                 | Maks antall håndheves; drag-omrokkering bevarer rekkefølge etter lagring; sletting av midterste bilde bevarer resten   |
| CRE-19 | U    | P1  | `image-compression.ts`                                                          | Store bilder komprimeres under grensen; svært små bilder komprimeres ikke unødig; ikke-bilde avvises                   |
| CRE-20 | C    | P1  | Kategoribytte etter utfylte kategoriavhengige felt                              | Bekreftelsesdialog vises; ved «ja» ryddes kun kategoriavhengige felt, generiske felt beholdes                          |
| CRE-21 | C    | P1  | `native-composer-deck` kortnavigasjon                                           | Atomiske kort valideres enkeltvis; ugyldig kort blokkerer fremdrift med synlig årsak                                   |
| CRE-22 | U    | P1  | `category-flows.ts` / `composer-route.ts`                                       | Direktenavigasjon til en side som ikke er gyldig for kategorien omdirigeres til nærmeste gyldige side                  |
| CRE-23 | C    | P2  | `use-edit-listing-hints` i redigeringsmodus                                     | Redigering av publisert annonse viser hva som endres, ikke opprettelses-copy                                           |
| CRE-30 | E    | P0  | Publisering blokkerer dobbeltinnsending                                         | Dobbeltklikk på «Publiser» oppretter nøyaktig én annonse; knappen går til ventetilstand                                |
| CRE-31 | E    | P0  | Publisering er idempotent ved retry                                             | Retry etter timeout gir ikke duplikat                                                                                  |
| CRE-32 | E    | P0  | Publisering uten bilde                                                          | «Fortsett uten bilde» er mulig der flyten tillater det, med tydelig konsekvens                                         |
| CRE-33 | E    | P0  | Turnstile-verifisering ved publisering                                          | Manglende/ugyldig token avvises server-side med forklarende feil, ikke stille fall-through                             |
| CRE-34 | E    | P1  | Full generisk salgsannonse ende-til-ende                                        | Annonsen vises på `annonse.$listingId`/kaupet-kode med alle felt korrekt                                               |
| CRE-35 | M    | P0  | Nettbrudd under autolagring og under publisering                                | Ingen datatap; tydelig feil; ved gjenoppkobling kan brukeren fortsette                                                 |
| CRE-36 | M    | P0  | Tvangsavslutning midt i flyten                                                  | Ved ny start tilbys gjenoppretting av utkastet med alle utfylte felt                                                   |
| CRE-37 | M    | P1  | Samme utkast åpnet på to enheter                                                | Ingen stille overskriving; nyeste vinner deterministisk og brukeren informeres                                         |

### 11.4 Kjøretøy (bil, MC, båt) — R6

| ID     | Nivå | P   | Tittel                                               | Forventet resultat                                                                                                        |
| ------ | ---- | --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| VEH-01 | U    | P0  | `parse-vehicle-lookup.ts` mot ekte SVV-responsformer | Manglende felt, null-verdier og uventede enum-verdier gir delvis utfylt resultat, aldri kast                              |
| VEH-02 | U    | P0  | `vehicle-classification.ts`                          | Kjøretøygruppe utledes korrekt; ukjent kode gir definert «ukjent», ikke feil kategori                                     |
| VEH-03 | U    | P0  | `vehicle-brand-match.ts`                             | Fuzzy-match på skrivefeil, store/små bokstaver og bindestrek; ingen falsk match på ulike merker med lik prefiks           |
| VEH-04 | U    | P0  | `first-registration.ts` / `vehicle-date.ts`          | Grenser: årsskifte, skuddår, fremtidig dato avvises, tidsone påvirker ikke resultatet                                     |
| VEH-05 | U    | P1  | `body-type-search-expansion.ts`                      | Ett karosseri-søk utvides til forventede synonymer uten å dra inn urelaterte                                              |
| VEH-06 | U    | P0  | `vehicle-lookup.server.ts` feilhåndtering            | Timeout, 4xx, 5xx og ugyldig JSON fra SVV gir kontrollert feil, brukbar melding og ingen PII i logg                       |
| VEH-07 | E    | P0  | Kjøretøyoppslag utilgjengelig                        | Brukeren kan fortsette manuelt; flyten blokkeres ikke                                                                     |
| VEH-08 | U    | P1  | `vehicle-options.ts` / `vehicle-title.ts`            | Generert tittel er stabil og uten dobbelt mellomrom/tomme segmenter                                                       |
| VEH-09 | U    | P1  | `vehicle-360.functions.ts`                           | Token-basert opplasting: ugyldig/utløpt token avvises; rammer lagres i riktig rekkefølge                                  |
| VEH-10 | E    | P1  | 360-opptak via `/360-opptak/$token`                  | Uautentisert enhet med gyldig token kan laste opp; token kan ikke gjenbrukes på annen annonse                             |
| VEH-11 | C    | P1  | `vehicle-registration` feltgruppe                    | Ugyldig regnr-format gir feltfeil før nettverkskall                                                                       |
| VEH-12 | C    | P1  | `vehicle-price` og `omregistreringsavgift`           | Avgiftsboks vises kun når relevant; beregning avrundes og formateres som norsk valuta                                     |
| VEH-13 | C    | P1  | `vehicle-equipment` / `vehicle-condition`            | Valgt utstyr overlever navigasjon frem/tilbake; «Tilstand» vises i teknisk informasjon på detaljsiden                     |
| VEH-14 | R    | P1  | `vehicle_lookup_log`                                 | Vanlig bruker kan ikke lese andres oppslagslogg; regnr logges ikke sammen med bruker-ID i klartekst der policy forbyr det |
| VEH-15 | U    | P2  | `admin-vehicle-brands` / `vehicle_models`            | Admin-CRUD validerer duplikater og bevarer referanser fra eksisterende annonser                                           |

### 11.5 Kjøpsønske (WTB)

| ID     | Nivå     | P   | Tittel                                      | Forventet resultat                                                                            |
| ------ | -------- | --- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| WTB-01 | U        | P0  | `wtb-criteria-fields.ts`                    | Kriterier med min>maks avvises; åpne intervaller er gyldige                                   |
| WTB-02 | U        | P0  | `use-wtb-draft-autosave`                    | Samme utkastkontrakt som salg (jf. CRE-11/12): nyere lokal state vinner                       |
| WTB-03 | E        | P0  | Publiser kjøpsønske med og uten kategori    | Begge varianter publiseres; uten kategori gis fortsatt gyldige kriterier                      |
| WTB-04 | E        | P0  | Blokkert «Fortsett» forklares               | Årsaken vises ved felt og i feiloppsummering, ikke bare som deaktivert knapp                  |
| WTB-05 | E-visual | P1  | Visuell kontrakt for startflaten            | Baseline holder i alle fire viewporter                                                        |
| WTB-06 | U        | P1  | `wtb-listings.functions.ts`                 | Eier kan oppdatere/slette eget ønske; andre kan kun lese aktive                               |
| WTB-07 | R        | P0  | `wtb_listings` og `wtb_match_notifications` | Eier, annen bruker, anonym × SELECT/INSERT/UPDATE/DELETE                                      |
| WTB-08 | U        | P1  | Matching av nye annonser mot kjøpsønsker    | Treff utløser nøyaktig ett varsel per (ønske, annonse); ingen varsel til eier av egen annonse |

### 11.6 Søk og filtre — R7

| ID      | Nivå | P   | Tittel                                                           | Forventet resultat                                                                                                      |
| ------- | ---- | --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| SRCH-01 | U    | P0  | `search-schema.ts` koding/dekoding av URL-parametre              | Round-trip: encode(decode(x)) == x for alle filterkombinasjoner; ugyldig parameter ignoreres uten å tømme øvrige filtre |
| SRCH-02 | U    | P0  | `encodeAttrFilters` / attributtfiltre                            | Spesialtegn og norske tegn overlever URL-koding                                                                         |
| SRCH-03 | U    | P0  | `search-negation.ts`                                             | «ikke diesel», «-diesel» ekskluderer korrekt; negasjon uten term ignoreres                                              |
| SRCH-04 | U    | P0  | `listing-search-query.ts`                                        | Riktig spørring bygges for fritekst + kategori + attributter + prisintervall + lokasjon samtidig                        |
| SRCH-05 | U    | P1  | `use-search-synonym-matches` / `filter-synonyms`                 | Synonymtreff utvider, men snevrer aldri inn resultatet                                                                  |
| SRCH-06 | U    | P1  | `search-number-parser.ts`                                        | «150k», «1 500 000», «1.5 mill» tolkes; tvetydig input gir ingen falsk tolkning                                         |
| SRCH-07 | U    | P1  | `search-stopwords.ts` / `term-groups.ts`                         | Stoppord fjernes ikke når de er hele søket                                                                              |
| SRCH-08 | U    | P1  | `filter-range-bounds.ts` / `attribute-bounds.functions.ts`       | Grenser hentes fra data; tomt datasett gir fornuftige default-grenser, ikke NaN                                         |
| SRCH-09 | C    | P0  | Søkepanel holder filtre som utkast til «Bruk»                    | Endring uten «Bruk» endrer ikke resultatlisten eller URL                                                                |
| SRCH-10 | C    | P0  | `active-filter-items` / `filter-chip-labels`                     | Hver aktiv filterchip har lesbar norsk etikett og kan fjernes enkeltvis                                                 |
| SRCH-11 | C    | P1  | `search-summary-pill`                                            | Oppsummeringen matcher faktisk antall aktive filtre                                                                     |
| SRCH-12 | U    | P1  | `use-annonser-search-state`                                      | Tilbakenavigasjon gjenoppretter forrige søketilstand; ny søking nullstiller paginering                                  |
| SRCH-13 | E    | P0  | Søk fra forsiden lander på `/annonser` med treff                 | URL inneholder søket; deling av URL gir samme resultat for annen bruker                                                 |
| SRCH-14 | E    | P1  | Tomt treff                                                       | Tom-tilstand forklarer og tilbyr neste handling (fjern filter / lagre søk)                                              |
| SRCH-15 | U    | P1  | `saved-searches.ts` + `saved_searches`                           | Lagret søk gjenskaper nøyaktig samme filtersett; duplikat lagres ikke to ganger                                         |
| SRCH-16 | R    | P0  | `saved_searches`, `search_query_stats`, `search_log_rate_limits` | Eier ser kun egne lagrede søk; statistikk ikke skrivbar for vanlig bruker; rate limit kan ikke omgås av klienten        |
| SRCH-17 | U    | P1  | `search-logging.functions.ts`                                    | Ingen PII i logget søk; rate-limit håndheves server-side                                                                |
| SRCH-18 | C    | P1  | Kart-/lokasjonsfilter (`location-filter`, `listings-map`)        | Radius og sted gir konsistent resultat med listen; manglende geoposisjon degraderer pent                                |
| SRCH-19 | U    | P2  | `search-category-match.ts` / `keyword-suggestion.functions.ts`   | Forslag er deterministiske og aldri tomme strenger                                                                      |
| SRCH-20 | M    | P1  | Søk med svært lang/rar input                                     | Emoji, 5000 tegn, SQL-lignende input gir kontrollert resultat uten feilside                                             |

### 11.7 Annonsedetalj, meldinger, profil og mine annonser

**11.7.1 Annonsedetalj, favoritter og deling**

| ID     | Nivå | P   | Tittel                                                             | Forventet resultat                                                               |
| ------ | ---- | --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| DET-01 | E    | P0  | Detaljside via `annonse.$listingId` og `$kaupetCode`               | Begge ruter viser samme annonse; ukjent ID gir 404-flate                         |
| DET-02 | U    | P0  | `storage.ts` signerte URL-er                                       | Utløpt signatur fornyes; ingen usignert sti eksponeres for private buckets       |
| DET-03 | C    | P1  | `zoomable-image` og bildekarusell                                  | Tastatur- og sveipenavigasjon; første bilde lastes prioritert                    |
| DET-04 | U    | P1  | `use-listing-card-images`                                          | Manglende bilde gir placeholder, ikke ødelagt `<img>`                            |
| DET-05 | C    | P0  | Favorittknapp for anonym bruker                                    | Fører til innlogging og fullfører handlingen etterpå (jf. AUTH-05)               |
| DET-06 | R    | P0  | `favorites`, `favorite_price_drops`, `favorite_sold_notifications` | Kun eier leser/skriver; annonseeier ser ikke hvem som favoriserte                |
| DET-07 | U    | P1  | Visningstelling (`listing_views`, `listing_view_events`)           | Egen visning telles ikke; gjentatte visninger innen vindu telles én gang         |
| DET-08 | C    | P1  | `moderation-banner`                                                | Deaktivert/rapportert annonse viser korrekt status til eier og skjules for andre |
| DET-09 | C    | P1  | `report-dialog`                                                    | Rapport krever årsak; dobbeltinnsending blokkeres                                |
| DET-10 | E    | P1  | Deling og `qr.ts` / kaupet-kode                                    | Delt lenke åpner riktig annonse; QR-koden dekoder til samme URL                  |
| DET-11 | U    | P2  | `format.ts`                                                        | Pris, dato og avstand formateres på norsk (mellomrom som tusenskille, «kr»)      |

**11.7.2 Meldinger og blokkering**

| ID     | Nivå | P   | Tittel                                          | Forventet resultat                                                                                     |
| ------ | ---- | --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| MSG-01 | R    | P0  | `conversations` og `messages`                   | Kun deltakere leser/skriver; anonym får ingenting; ikke-deltaker kan ikke sette inn melding i samtalen |
| MSG-02 | C    | P0  | `messages-button` og ulest-teller (`unread.ts`) | Teller stemmer etter lesing, ny melding og blokkering; ingen negativ eller «NaN»                       |
| MSG-03 | R    | P0  | `user_blocks` og `blocks.functions.ts`          | Blokkert bruker kan ikke sende ny melding; historikk håndteres etter policy for begge parter           |
| MSG-04 | C    | P1  | `block-conversation-menu`                       | Blokkering krever bekreftelse og kan oppheves                                                          |
| MSG-05 | E    | P1  | Samtale fra annonse til svar                    | Førstegangskontakt oppretter én samtale, ikke én per klikk                                             |
| MSG-06 | C    | P1  | Realtime-oppdatering av meldinger               | Ny melding vises uten refresh; reconnect etter nettbrudd gir ingen duplikater                          |
| MSG-07 | C    | P1  | `swipe-to-delete-row`                           | Sveip krever bekreftelse; angre er mulig eller handlingen er tydelig irreversibel                      |
| MSG-08 | R    | P1  | `system_messages`                               | Systemmeldinger kan ikke forfalskes av vanlig bruker                                                   |
| MSG-09 | M    | P1  | Melding med lenke/HTML/emoji                    | Rendres som tekst, ikke tolket markup; lange ord bryter i stedet for å sprenge layout                  |

**11.7.3 Mine annonser, salg, profil og anmeldelser**

| ID    | Nivå | P   | Tittel                                  | Forventet resultat                                                                                       |
| ----- | ---- | --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| MY-01 | C    | P1  | `listing-row` i mine annonser           | Status (aktiv/solgt/deaktivert/promotert) vises korrekt for hver tilstand                                |
| MY-02 | U    | P0  | `republishListing`                      | Republisering av utløpt annonse gjenbruker samme ID/kode og nullstiller ikke statistikk feilaktig        |
| MY-03 | U    | P0  | `sales.functions.ts` / `listing_sales`  | Markering som solgt er idempotent; solgt annonse forsvinner fra søk men er tilgjengelig via direktelenke |
| MY-04 | R    | P0  | `listings`, `listing_images`            | Eier full CRUD; andre kun SELECT på aktive; anonym kun SELECT på aktive                                  |
| MY-05 | R    | P0  | `profiles`                              | Kun offentlige profilfelt lesbare for andre; e-post/telefon eksponeres ikke via profil-SELECT            |
| MY-06 | U    | P1  | `reviews.functions.ts` / `user_reviews` | Kun motpart i fullført handel kan anmelde; én anmeldelse per handel; egen anmeldelse umulig              |
| MY-07 | E    | P1  | Offentlig brukerside `/bruker/$id`      | Viser aktive annonser og vurdering; ingen private data                                                   |
| MY-08 | C    | P1  | `notification_preferences` i profil     | Endring lagres og respekteres av varselutsending (jf. NOTIF-04)                                          |

### 11.8 Admin og moderasjon — R12

| ID     | Nivå | P   | Tittel                                                          | Forventet resultat                                                                        |
| ------ | ---- | --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| ADM-01 | U    | P0  | `admin-auth.server.ts` / `moderator-auth.server.ts`             | Vanlig bruker, anonym og manipulert JWT avvises; kun `user_roles`-basert rolle godtas     |
| ADM-02 | R    | P0  | `user_roles`                                                    | Bruker kan ikke gi seg selv admin/moderator; kun admin kan skrive                         |
| ADM-03 | U    | P0  | Hver `admin-*.functions.ts`-eksport sjekker rolle før effekt    | For hver eksportert funksjon: kall som vanlig bruker gir avvisning uten sideeffekt        |
| ADM-04 | U    | P0  | `adminDisableListing`/`adminEnableListing`/`adminDeleteListing` | Idempotent; logges i `admin_moderation_log` med aktør og årsak                            |
| ADM-05 | U    | P0  | `adminBanUser`/`adminSuspendUser` + oppheving                   | Tilstandsovergang aktiv↔utestengt↔suspendert er konsistent; dobbelt ban gir ikke duplikat |
| ADM-06 | U    | P1  | `adminBanIp` / `ip_bans` + `request-ip.server.ts`               | IP utledes fra riktig header-kjede; spoofet header gir ikke bypass                        |
| ADM-07 | U    | P1  | `adminListReports` / `adminResolveReport` / `reports`           | Rapport kan kun løses én gang; løst rapport forsvinner fra kø                             |
| ADM-08 | U    | P1  | `adminGrantModeratorRole` / `adminRevokeModeratorRole`          | Kun admin; kan ikke fjerne siste admin                                                    |
| ADM-09 | U    | P1  | `admin-users.functions.ts`                                      | Brukersøk lekker ikke passordhash/tokens; paginering er stabil                            |
| ADM-10 | U    | P1  | `admin-feedback.functions.ts` / `feedback`                      | Innsending er rate-limitet; admin ser alt, bruker kun eget                                |
| ADM-11 | E    | P0  | Admin-ruter `/admin/*` for ikke-admin                           | Omdirigeres/404, ikke tom admin-flate med deaktiverte knapper                             |
| ADM-12 | U    | P1  | `admin-promotions.functions.ts` / `vipps-admin.functions.ts`    | Refusjon krever admin og logges; kan ikke kjøres to ganger for samme betaling             |
| ADM-13 | R    | P1  | `error_log`, `server-error-log.ts`                              | Kun admin leser; ingen PII i lagrede feilmeldinger                                        |
| ADM-14 | R    | P1  | `app_settings` / `site_settings`                                | Kun admin skriver; lesing er begrenset etter policy                                       |

### 11.9 Promotering og betaling (Vipps) — R2/R1

Ingen test skal treffe Vipps' produksjonsendepunkt. Alt kjøres i testmodus
eller mot mock.

| ID     | Nivå | P   | Tittel                                                                      | Forventet resultat                                                                                                                              |
| ------ | ---- | --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| PAY-01 | U    | P0  | `verifyVippsWebhookSignature`                                               | Gyldig signatur godtas; endret payload, feil hemmelighet, manglende header og replay av gammel timestamp avvises. Sammenligning er tidskonstant |
| PAY-02 | U    | P0  | `assertVippsConfigured` / `getVippsMode`                                    | Manglende konfigurasjon feiler tydelig ved oppstart av kallet, ikke halvveis i en betaling                                                      |
| PAY-03 | U    | P0  | `createPromotionCheckout`                                                   | Idempotens: to raske kall for samme annonse gir én betaling, ikke to                                                                            |
| PAY-04 | U    | P0  | `createVippsPayment` feilbaner                                              | Timeout/5xx fra Vipps gir ingen lokal «betalt»-tilstand                                                                                         |
| PAY-05 | U    | P0  | `captureVippsPayment`                                                       | Capture skjer nøyaktig én gang per autorisasjon; dobbel capture avvises                                                                         |
| PAY-06 | U    | P0  | `refundVippsPayment`                                                        | Refusjon over beløpsgrensen avvises; delvis refusjon regnskapsføres korrekt                                                                     |
| PAY-07 | U    | P0  | `reconcilePromotionPayment`                                                 | Avstemming er idempotent og konvergerer mot Vipps' status som fasit ved uenighet                                                                |
| PAY-08 | U    | P0  | Webhook-håndtering (`api/public/vipps/webhook.ts`) + `vipps_webhook_events` | Duplikat webhook-ID behandles én gang; ukjent event-type logges og ignoreres uten 500                                                           |
| PAY-09 | R    | P0  | `vipps_webhook_secrets`                                                     | Ikke lesbar for noen klientrolle overhodet                                                                                                      |
| PAY-10 | U    | P0  | `getPromotionPricing` / `promotion_pricing`                                 | Pris hentes server-side; klient-manipulert beløp ignoreres                                                                                      |
| PAY-11 | R    | P0  | `listing_promotions`                                                        | Kun eier ser egen promoteringsstatus; ingen kan sette status direkte fra klienten                                                               |
| PAY-12 | E    | P0  | Betalingsreise: promoter → betal (test) → kvittering                        | `/bekrefter/$promoId` og `/kvittering/$promoId` viser korrekt status; avbrutt betaling gir ikke aktiv promotering                               |
| PAY-13 | E    | P1  | Retur fra Vipps med nettbrudd                                               | Bruker som ikke returnerer får likevel riktig status via webhook/avstemming                                                                     |
| PAY-14 | U    | P1  | `getFeaturedListings`                                                       | Kun aktive, betalte promoteringer vises; utløpt promotering forsvinner ved grensen (tidssone-uavhengig)                                         |
| PAY-15 | M    | P1  | Betaling avbrutt i Vipps-appen                                              | Ingen belastning, tydelig melding, annonsen er uendret                                                                                          |

### 11.10 Varsler og push — R9

| ID       | Nivå | P   | Tittel                                                 | Forventet resultat                                                                                                            |
| -------- | ---- | --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| NOTIF-01 | U    | P0  | `api/public/push/dispatch.ts` (har allerede test)      | Utvid: ugyldig token fjernes fra `push_subscriptions`; feil logges i `push_dispatch_failures` uten å stoppe resten av batchen |
| NOTIF-02 | U    | P0  | `fcm.server.ts`                                        | Manglende Firebase-konfig gir kontrollert feil, ikke krasj i Worker                                                           |
| NOTIF-03 | U    | P0  | Ingen dobbeltvarsling                                  | Samme hendelse behandlet to ganger gir ett varsel (dedupe-nøkkel)                                                             |
| NOTIF-04 | U    | P0  | `notification_preferences` respekteres                 | Avslått kategori gir ingen push og ingen e-post                                                                               |
| NOTIF-05 | R    | P0  | `push_subscriptions`                                   | Kun eier skriver/leser egen subscription; ingen kan liste andres tokens                                                       |
| NOTIF-06 | U    | P1  | `saved_search_notifications`                           | Ett varsel per (søk, annonse); ingen varsel for egen annonse                                                                  |
| NOTIF-07 | U    | P1  | `favorite_price_drops` / `favorite_sold_notifications` | Prisøkning varsler ikke; prisfall varsler én gang per nivå                                                                    |
| NOTIF-08 | U    | P1  | `email.server.ts` / `email-templates.ts`               | Maler rendres uten manglende variabler; ingen HTML-injeksjon fra brukerinput                                                  |
| NOTIF-09 | C    | P1  | `notifications-bell` / `/varsler`                      | Ulest-markering, tom tilstand og «merk alle som lest»                                                                         |
| NOTIF-10 | U    | P1  | `native-push.ts` (har test)                            | Utvid: nektet tillatelse gir degradert, forklart tilstand — ikke gjentatt prompt                                              |

### 11.11 Native (Capacitor, iOS/Android) — R8

| ID     | Nivå | P   | Tittel                                                                    | Forventet resultat                                                                                              |
| ------ | ---- | --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| NAT-01 | U    | P0  | `native.ts` / `native-setup.ts` skiller layout fra plugin-tilgjengelighet | Native-emulering i nettleser kaller aldri utilgjengelig plugin (ARCHITECTURE § 7)                               |
| NAT-02 | U    | P0  | `use-overlay-history` (har test)                                          | Utvid: Android system-tilbake og iOS kantsveip lukker øverste overlay, ikke hele siden; historikken lekker ikke |
| NAT-03 | U    | P0  | Navigasjon blokkeres ikke når forhåndsvisning lukkes internt              | Regresjonsvern for commit `d3ee40f`                                                                             |
| NAT-04 | U    | P1  | `use-sheet-drag-gate` / `sheet-gestures` (har tester)                     | Utvid grensetilfeller: drag under terskel spretter tilbake; drag under scroll i innhold flytter ikke sheet      |
| NAT-05 | U    | P1  | `haptics.ts`, `orientation.ts`, `text-scale.ts` (har tester)              | Utvid: plugin utilgjengelig → no-op, aldri kast                                                                 |
| NAT-06 | U    | P1  | `native-offline.ts`                                                       | Offline gir køing/forklart feil; online igjen gjenopptar uten dobbeltinnsending                                 |
| NAT-07 | M    | P0  | Safe area på enheter med notch/hjemindikator                              | Ingen innhold under statuslinje eller hjemindikator; ingen lokale konstanthøyder                                |
| NAT-08 | M    | P0  | Kamera- og geoposisjonstillatelser avslått                                | Flyten fortsetter med manuell inntasting og forklarende tekst                                                   |
| NAT-09 | M    | P1  | Tastatur skjuler ikke aktivt felt                                         | På iOS og Android scrolles feltet i synlig område                                                               |
| NAT-10 | M    | P1  | App i bakgrunnen i lang tid                                               | Ved retur er sesjon og data konsistente; ingen tom skjerm                                                       |
| NAT-11 | CI   | P1  | Android-enhetstester og APK-bygg                                          | `./gradlew test<Flavor>DebugUnitTest` grønn for både staging- og produksjonsflavor                              |
| NAT-12 | M    | P1  | Deep link / universal link til annonse                                    | Åpner riktig skjerm i appen, med fungerende tilbake til app-rot                                                 |

### 11.12 Data, migrasjoner og RLS — R1

Gjennomføres etter PB-4. `src/lib/rls.integration.test.ts` dekker i dag ~35
tabeller/scenarioer. Kravet er _fullstendig_ dekning av tabellene under.

| ID    | Nivå    | P   | Tittel                                                                                                              | Forventet resultat                                                                                                                   |
| ----- | ------- | --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| DB-01 | R       | P0  | Tabellinventar mot testinventar                                                                                     | Skript/test som feiler når en tabell i `supabase/migrations` mangler RLS-case. Ingen tabell skal være udekket                        |
| DB-02 | R       | P0  | Alle tabeller har `ENABLE ROW LEVEL SECURITY`                                                                       | Ingen tabell er eksponert uten policy                                                                                                |
| DB-03 | R       | P0  | Rollematrise per tabell                                                                                             | For hver tabell: eier / annen bruker / anonym / moderator / admin × SELECT/INSERT/UPDATE/DELETE                                      |
| DB-04 | R       | P0  | Utestengt og suspendert bruker i matrisen                                                                           | Skrivetilgang faktisk blokkert på DB-nivå, ikke bare i UI                                                                            |
| DB-05 | R       | P0  | `CREATE OR REPLACE FUNCTION` bevarer herding                                                                        | For hver erstattet DB-funksjon: `search_path`, `SECURITY DEFINER`-vurdering, rettigheter og feilisolering er uendret eller strengere |
| DB-06 | R       | P0  | Rate-limit-tabeller (`product_event_rate_limits`, `search_log_rate_limits`)                                         | Klienten kan ikke slette/oppdatere egne rate-limit-rader                                                                             |
| DB-07 | R       | P1  | Statistikktabeller (`listing_keyword_stats`, `listing_category_word_stats`, `search_query_stats`, `product_events`) | Ikke skrivbare fra klient; aggregater lekker ikke enkeltbrukeres søk                                                                 |
| DB-08 | R       | P1  | Storage-buckets                                                                                                     | Private objekter kun via signert URL; opplasting begrenset til eier og filtype/størrelse                                             |
| DB-09 | U       | P1  | `request-size.server.ts` (har test)                                                                                 | Utvid: grenseverdi nøyaktig på maks og maks+1; ingen minnesprekk ved stor payload                                                    |
| DB-10 | R       | P1  | Fixtures ryddes i avhengighetsrekkefølge                                                                            | Testkjøring nr. 2 rett etter nr. 1 er grønn uten manuell opprydding                                                                  |
| DB-20 | Prosess | P0  | To-stegs deploy av migrasjon + avhengig appkode                                                                     | Sjekkliste: migrasjon pushet og bekreftet anvendt før avhengig appkode pushes (ARCHITECTURE § 6)                                     |

### 11.13 Sikkerhet — R4/R13

| ID     | Nivå    | P   | Tittel                                  | Forventet resultat                                                                                                  |
| ------ | ------- | --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| SEC-01 | Statisk | P0  | `bun run check:server-boundary`         | Ingen klientmodul importerer `*.server.ts`/`*.functions.ts`-internals i strid med regelen                           |
| SEC-02 | Statisk | P0  | Hemmeligheter ikke i klientbundle       | Grep i `dist/client` etter service-role-mønstre, `SUPABASE_SERVICE_ROLE`, Vipps-nøkler, HF-token → null treff       |
| SEC-03 | Statisk | P0  | Kun `VITE_*` er offentlig               | Ingen hemmelighet ligger i en `VITE_`-variabel; sops-secrets er ikke committet i klartekst                          |
| SEC-04 | U       | P0  | `env.server.ts` / `config.server.ts`    | Manglende obligatorisk variabel feiler tydelig ved oppstart, ikke som `undefined` senere                            |
| SEC-05 | E       | P0  | CSRF-beskyttelse på serverfunksjoner    | Kall med feil/uten origin avvises; rammeverkets advarsel er ikke deaktivert                                         |
| SEC-06 | U       | P0  | Alle serverfunksjoner validerer input   | For hver `*.functions.ts`-eksport: manipulert/uventet payload avvises med Zod-feil før sideeffekt                   |
| SEC-07 | U       | P0  | Autorisasjon gjentas server-side        | Ingen serverfunksjon stoler på klientsendt bruker-ID/rolle                                                          |
| SEC-08 | E       | P0  | IDOR-sonde                              | Bytt ut ID i URL/payload med annen brukers ressurs (annonse, samtale, promo, utkast) → avvist, ikke lekket          |
| SEC-09 | C       | P1  | XSS-sonde                               | Brukertekst med `<script>`, `javascript:`-lenker og markdown-lignende input rendres som tekst                       |
| SEC-10 | U       | P0  | Ingen PII i `product-analytics`         | Kun kontrollerte nøkler/enums; rå feltverdier avvises av typer eller runtime-sjekk                                  |
| SEC-11 | U       | P0  | Ingen PII i feillogg                    | Regnr, adresse, e-post, fritekst og tokens filtreres i `error-capture.ts`/`server-error-log.ts`                     |
| SEC-12 | M       | P1  | Personvernkrav                          | `/personvern` og `/vilkar` er oppdatert mot faktisk databehandling og tredjeparter (Vipps, SVV, Turnstile, Mistral) |
| SEC-13 | CI      | P0  | `bun audit --audit-level=high` + CodeQL | Ingen høy/kritisk sårbarhet; funn trieres innen én uke                                                              |
| SEC-14 | U       | P1  | Turnstile-verifisering server-side      | Klientens «ok» alene er aldri tilstrekkelig                                                                         |
| SEC-15 | U       | P1  | Rate-limiting og bot-beskyttelse        | Rask gjentatt publisering, rapportering, feedback og søk begrenses server-side                                      |
| SEC-16 | U       | P1  | `category-suggestion-ai.server.ts`      | Kall skjer kun server-side; prompt inneholder ikke PII; feil/timeout faller tilbake til vote-basert forslag         |

### 11.14 Ytelse — R10

Budsjetter (mål; juster med data, ikke med følelse):

| Metrikk                       | Budsjett                                     |
| ----------------------------- | -------------------------------------------- |
| Største JS-fil                | 450 KiB (håndhevet av `check:bundle`)        |
| Største CSS-fil               | 180 KiB (håndhevet)                          |
| LCP, mobil Fast 3G + 4x CPU   | < 2,5 s på `/`, `/annonser`, annonsedetalj   |
| INP                           | < 200 ms på søk, filter, composer-navigasjon |
| CLS                           | < 0,1 på alle offentlige ruter               |
| Forespørsler per listevisning | Ingen per-element-runde (N+1)                |

| ID      | Nivå | P   | Tittel                         | Forventet resultat                                                               |
| ------- | ---- | --- | ------------------------------ | -------------------------------------------------------------------------------- |
| PERF-01 | CI   | P0  | Bundle-budsjett                | `bun run check:bundle` grønn; regresjon > 5 % forklares i PR                     |
| PERF-02 | M    | P0  | Web Vitals på tre nøkkelruter  | Innenfor budsjett i tabellen over                                                |
| PERF-03 | M    | P0  | N+1 i listevisninger           | Én spørring per side, ikke per kort (særlig bilde-signering)                     |
| PERF-04 | M    | P1  | Bildevekt på listekort         | Kort laster ikke fullstørrelsesbilder; `image-compression` kjører før opplasting |
| PERF-05 | M    | P1  | Søk med mange filtre           | Responstid under 1 s på staging-datasett; ingen blokkering av UI-tråden          |
| PERF-06 | M    | P1  | Uendelig scroll / paginering   | Ingen minnevekst som fortsetter å øke etter 10 sider                             |
| PERF-07 | M    | P1  | Kaldstart i Worker             | Første respons uten unødvendige sekvensielle eksterne kall                       |
| PERF-08 | M    | P2  | Native oppstartstid            | Splash til interaktiv innen 3 s på referanseenhet                                |
| PERF-09 | M    | P1  | Kartvisning med mange markører | Ingen frys ved >200 treff                                                        |

### 11.15 Tilgjengelighet — R11

Referanse: WCAG 2.1 AA. Utføres etter PB-7.

| ID      | Nivå | P   | Tittel                                             | Forventet resultat                                                                         |
| ------- | ---- | --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A11Y-01 | E    | P0  | Landemerker og ingen nøstede interaktive elementer | Dekket av `e2e/semantic-quality.spec.ts` — utvid til alle offentlige ruter                 |
| A11Y-02 | C    | P0  | Alle skjemafelt har programmatisk etikett          | Ingen felt uten `label`/`aria-label`; obligatorisk er annonsert, ikke bare markert med `*` |
| A11Y-03 | C    | P0  | Feil er koblet til feltet                          | `aria-invalid` + `aria-describedby`; feiloppsummering annonseres én gang                   |
| A11Y-04 | C    | P0  | Fokusfelle i overlay/sheet                         | Fokus fanges i åpen dialog og returnerer til utløsende element ved lukking                 |
| A11Y-05 | M    | P0  | Tastaturfullføring av begge composer-flyter        | Ingen handling krever peker; fokus alltid synlig                                           |
| A11Y-06 | M    | P0  | Skjermleser: steg, status, knappetilstand          | VoiceOver og TalkBack leser «Steg X av Y», lagringsstatus og ventetilstand uten duplikat   |
| A11Y-07 | M    | P0  | 200 % tekst og 320 px bredde                       | Ingen avkorting, overlapp, skjult primærhandling eller horisontal scroll                   |
| A11Y-08 | M    | P1  | Kontrast lys/mørk modus                            | Alle tekst-/ikonkombinasjoner ≥ 4.5:1 (3:1 for stor tekst og UI-grafikk)                   |
| A11Y-09 | M    | P1  | Informasjon ikke avhengig av farge alene           | Status, feil og valgt tilstand har form/tekst i tillegg til farge                          |
| A11Y-10 | C    | P1  | Redusert bevegelse                                 | `prefers-reduced-motion` fjerner ikke-essensielle animasjoner                              |
| A11Y-11 | C    | P1  | Bilder har meningsfull alt-tekst                   | Dekorative bilder er `alt=""`; annonsebilder har beskrivende tekst                         |
| A11Y-12 | M    | P2  | Switch Access / Full Keyboard Access               | Alle handlinger nås og har forståelige navn                                                |

### 11.16 Kompatibilitet

| ID      | Nivå     | P   | Tittel                                        | Forventet resultat                                                                         |
| ------- | -------- | --- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| COMP-01 | E        | P0  | Playwright `desktop-web` + `mobile-web`       | Hele E2E-suiten grønn i begge prosjekter                                                   |
| COMP-02 | M        | P0  | Desktop Safari, Chrome, Firefox               | Kritiske reiser fungerer; ingen layoutbrudd                                                |
| COMP-03 | M        | P0  | iOS: nyeste + eldste støttede versjon         | Kritiske reiser fungerer                                                                   |
| COMP-04 | M        | P0  | Android: nyeste stabile + én eldre støttet    | Kritiske reiser fungerer                                                                   |
| COMP-05 | M        | P1  | iPad og Android-nettbrett med fysisk tastatur | Layout og tastaturnavigasjon holder                                                        |
| COMP-06 | E-visual | P1  | Fire viewport-baselines                       | `visual-web`, `visual-phone`, `visual-landscape`, `visual-tablet` uendret uten begrunnelse |
| COMP-07 | M        | P2  | Landskapsmodus på telefon                     | Ingen skjult primærhandling                                                                |

### 11.17 Polish og opplevd kvalitet — R15

Sjekkliste, kjøres per ny eller endret flate.

| ID     | Nivå | P   | Sjekk                                                                                                           |
| ------ | ---- | --- | --------------------------------------------------------------------------------------------------------------- |
| POL-01 | C/M  | P1  | Fire eksplisitte tilstander finnes: laster, tom, feil, ferdig. «Ingen data» vises aldri under første lasting    |
| POL-02 | C/M  | P1  | Skjelett-/lasteflater matcher den ferdige layouten (ingen hopp)                                                 |
| POL-03 | C/M  | P1  | Feil brukeren kan rette står ved handlingen/feltet; toast brukes kun til nettverks-, tillatelses- og systemfeil |
| POL-04 | M    | P1  | Ingen tekniske feilmeldinger eller interne ID-er i brukergrensesnittet                                          |
| POL-05 | M    | P1  | Norsk språk konsekvent: ingen engelske rester, riktig bruk av «du», korrekt entall/flertall ved 0/1/mange       |
| POL-06 | M    | P1  | Tall, pris, dato og avstand formatert etter norsk konvensjon                                                    |
| POL-07 | M    | P1  | Alle destruktive handlinger har bekreftelse og forklarer konsekvensen                                           |
| POL-08 | M    | P2  | Ingen layout-hopp når bilder lastes (reserverte dimensjoner)                                                    |
| POL-09 | M    | P2  | Tilbakenavigasjon havner alltid et forutsigbart sted, aldri utenfor appen midt i en flyt                        |
| POL-10 | M    | P2  | Lange verdier (tittel, kategorinavn, stedsnavn) brytes eller trunkeres pent, aldri overlapp                     |

---

## 12. Akseptansetest og release

### 12.1 Kritiske brukerreiser (must-pass)

Alle kjøres på staging, på web + iOS + Android, før release til produksjon.

| #   | Reise                                                              | Dekkende caser                   |
| --- | ------------------------------------------------------------------ | -------------------------------- |
| J1  | Anonym søker → finner annonse → registrerer seg → kontakter selger | SRCH-13, DET-01, AUTH-05, MSG-05 |
| J2  | Publiser generisk salgsannonse ende-til-ende                       | CRE-34, CRE-30, CRE-33           |
| J3  | Publiser kjøretøyannonse manuelt og via regnr-oppslag              | VEH-07, VEH-11, CRE-34           |
| J4  | Publiser kjøpsønske med kriterier og varsling                      | WTB-03, WTB-08                   |
| J5  | Avbryt → utkast → tvangsavslutt → gjenopprett → publiser           | CRE-35, CRE-36, CRE-11           |
| J6  | Promoter annonse og betal med Vipps (test)                         | PAY-12, PAY-03, PAY-08           |
| J7  | Samtale mellom to brukere, inkl. blokkering                        | MSG-01, MSG-03                   |
| J8  | Marker som solgt, anmeld motpart, republiser                       | MY-02, MY-03, MY-06              |
| J9  | Moderator deaktiverer rapportert annonse; eier ser årsak           | ADM-04, DET-08                   |
| J10 | Rediger publisert annonse, inkl. kategoribytte                     | CRE-20, CRE-23                   |

**Godkjent** når ingen S0/S1 finnes, ingen data går tapt, og hver publisering
oppretter høyst én annonse.

### 12.2 Manuell QA-sesjon

Roller, enheter og detaljerte a11y-steg for annonseopprettelse er allerede
beskrevet i `docs/plans/ANNONSEOPPRETTELSE-MANUELL-QA.md` — det dokumentet er den
operasjonelle sjekklisten for J2–J5 og skal ikke dupliseres her. Utvid samme
mal når nye flyter når release-modenhet.

### 12.3 Røyktest etter deploy (produksjon, maks 10 min)

```
1. Forsiden laster, ingen konsollfeil.
2. Søk gir treff; en annonsedetalj åpner med bilder.
3. Innlogging fungerer.
4. /ny-annonse åpner og steg 1 rendres (ikke publiser).
5. Meldinger-siden laster med korrekt ulest-teller.
6. /sitemap.xml svarer 200 med gyldig XML.
7. Vipps-status: getPromotionPricing svarer (ingen kjøp).
8. Sjekk error_log for nye feil siste 15 min.
```

Feil i steg 1–5 → vurder rollback umiddelbart.

## 13. Metrikker og rapportering

Følges opp av testleder, rapporteres per release:

| Metrikk                                             | Kilde                   | Mål                        |
| --------------------------------------------------- | ----------------------- | -------------------------- |
| Linjedekning (statements)                           | `bun run test:coverage` | Ratchet, se § 9            |
| Antall udekkede tabeller i RLS-matrisen             | DB-01                   | 0                          |
| Åpne S0/S1                                          | Defektlogg              | 0 ved release              |
| Defektlekkasje (feil funnet i prod / totalt funnet) | Defektlogg              | < 10 %                     |
| Flaky-rate i E2E                                    | CI-historikk            | < 2 %                      |
| CI-kjøretid `verify`                                | CI                      | < 10 min                   |
| Bundle største JS-fil                               | `check:bundle`          | Under budsjett, trend flat |
| Andel P0-caser i § 11 som er automatisert           | Denne katalogen         | > 90 %                     |

Testrapport-mal per release:

```
Release: <sha/tag>   Dato: <dato>
Kjørt: verify / rls / native-android / e2e / manuell J1–J10
Resultat: <antall passert / feilet / hoppet over>
Nye defekter: S0:_ S1:_ S2:_ S3:_
Aksepterte kjente feil: <ID-er + begrunnelse>
Ikke testet: <eksplisitt liste>
Anbefaling: release / release med forbehold / ikke release
```

## 14. Prioritert gap-backlog

Nåtilstand målt mot denne strategien. Rekkefølgen er anbefalt
gjennomføringsrekkefølge for agenter.

| #   | Gap                                                                         | Caser                          | Innsats |
| --- | --------------------------------------------------------------------------- | ------------------------------ | ------- |
| 1   | Ingen mekanisme som fanger tabeller uten RLS-case                           | DB-01, DB-02                   | S       |
| 2   | Serverfunksjoner mangler systematisk autorisasjons-/valideringstest         | ADM-03, SEC-06, SEC-07         | L       |
| 3   | Vipps-flyten har unit-tester på signatur, men ikke på idempotens/avstemming | PAY-03, PAY-05, PAY-07, PAY-08 | M       |
| 4   | Ingen automatisert IDOR-/hemmelighetssonde                                  | SEC-02, SEC-08                 | M       |
| 5   | Ingen målte Web Vitals; kun bundle-budsjett                                 | PERF-02, PERF-03               | M       |
| 6   | A11y dekket av én semantisk E2E-spec; mangler feltnivå-assertions           | A11Y-02, A11Y-03, A11Y-04      | M       |
| 7   | Dekningsterskel på 9 % gir svakt regresjonsvern                             | § 9 ratchet                    | L       |
| 8   | E2E kjører ikke på PR mot `staging`, kun mot `main`                         | COMP-01                        | S       |
| 9   | Ingen testdekning av varselutsending og dedupe                              | NOTIF-03, NOTIF-06, NOTIF-07   | M       |
| 10  | Polish-sjekklisten er ikke knyttet til PR-malen                             | § 11.17                        | S       |

## 15. Oppgavemal for tildeling til AI-agent

Testleder tildeler arbeid med denne malen. Alt en agent trenger skal stå i
malen eller være peket på med presis referanse.

```
OPPGAVE: <kort tittel>
Playbook: PB-<n>            (§ 10)
Caser: <TC-ID-er>           (§ 11)
Risiko: R<n>                (§ 6)
Filer i scope: <stier>
Utenfor scope: <stier/temaer>
Kommandoer som skal kjøres og limes inn: <kommandoer>
Ferdig når:
  - alle caser er implementert eller eksplisitt avvist med begrunnelse
  - kommandoene er kjørt og utdata limt inn
  - G4-verifikasjon (test feiler uten fiksen) er utført og beskrevet
  - defekter er rapportert i § 9-malen
Rapportformat: playbookens rapportlinje + liste over usikkerheter
```

### 15.1 Etablerte agenter i repoet

Malen over fylles og delegeres automatisk av slash-kommandoen
`/testoppgave <TC-ID | område>`. Den slår opp casene i § 11, velger nivå (§ 3)
og playbook (§ 10), og starter riktig agent:

| Agent           | Definert i                        | Bruk                                                          | Playbooks                    |
| --------------- | --------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| `test-author`   | `.claude/agents/test-author.md`   | Skrive/utvide automatiserte tester og regresjonsvern          | PB-1, PB-2, PB-3, PB-4, PB-8 |
| `test-explorer` | `.claude/agents/test-explorer.md` | Finne ukjente feil, ytelse, tilgjengelighet, sikkerhetssonder | PB-5, PB-6, PB-7             |

Begge kjører `model: sonnet` med `effort: low`. Det er et bevisst krav, ikke
en kostnadsbesparelse: klarer ikke en enkel agent oppgaven, er oppgaven for
dårlig spesifisert (§ 16). `test-explorer` har ikke skrivetilgang til kode —
den rapporterer, og `test-author` implementerer regresjonsvernet for funnene. Endres playbookene
eller katalogen, skal agentfilene oppdateres i samme PR.

**Avslutningskrav for enhver agentleveranse** (jf. `CLAUDE.md`): avslutt med
en kort seksjon som lister det du er minst sikker på eller ikke har
verifisert. Er alt verifisert, si det i én linje.

---

## 16. Utførbarhet: alle oppgaver skal kunne kjøres av en enkel agent

Målet er at **enhver oppgave i § 11 kan utføres av Sonnet med `effort: low`**.
Det stiller krav til oppgaven, ikke bare til agenten. En oppgave som krever
design, avveining eller tolkning er ikke klar til tildeling — det er
testleders arbeid som gjenstår, ikke agentens.

### 16.1 Utførbarhetskontrakt

En oppgave er klar til tildeling først når alle seks punktene er oppfylt:

| #   | Krav                                                            | Kontroll                              |
| --- | --------------------------------------------------------------- | ------------------------------------- |
| 1   | Nivået er slått opp i tabellen i § 3, ikke vurdert              | Nivå og kommando står i oppgaven      |
| 2   | Filstien(e) som skal endres er navngitt                         | Ingen «finn ut hvor det hører hjemme» |
| 3   | Forventet resultat er observerbart uten å lese implementasjonen | Kan skrives som en assert             |
| 4   | Testdata er gitt eller følger datamatrisen i PB-1               | Ingen «velg passende verdier»         |
| 5   | Kommandoene som skal kjøres står ordrett i oppgaven             | Kopierbart                            |
| 6   | «Utenfor scope» er eksplisitt                                   | Agenten vet hvor den skal stoppe      |

Mangler ett punkt: testleder fyller det ut. Agenten skal **ikke** gjette seg
til det manglende punktet.

### 16.2 Forbudte handlinger for testagenter

Uansett hvor fornuftig det virker underveis:

- Ikke endre produksjonskode (unntak: `data-testid` etter konvensjonen i
  `CLAUDE.md`, og kun når `getByRole`/`getByLabel` er dokumentert tvetydig).
- Ikke installer avhengigheter eller innfør nye testrammeverk, hjelpere,
  fabrikker eller mock-lag. Gjenbruk mønsteret i nabotestene.
- Ikke refaktorer koden du tester, og ikke rydd urelaterte filer.
- Ikke svekk en assert, `skip`-marker eller slett en test for å få grønt.
- Ikke utvid scope til «mens jeg først er her».
- Ikke rapporter ferdig uten å lime inn faktisk kommandoutdata.
- Ikke rør `supabase/migrations/`, `.env*`, `secrets/` eller CI-filer.

### 16.3 Eskalering: stopp fremfor å gjette

Er noe uklart, motstridende eller ikke dekket av playbooken — **stopp**. Ikke
improviser. Skriv dette og avslutt:

```
BLOKKERT
Oppgave: <TC-ID / tittel>
Kom til: <siste steg som ble fullført>
Hindring: <hva som mangler eller er motstridende, i én setning>
Trenger: <det ene svaret som løser blokkeringen>
Alternativer jeg ser: <maks to, eller "ingen">
Gjort så langt: <filer endret, kommandoer kjørt med utdata>
```

En blokkert oppgave rapportert riktig er et godt resultat. En gjettet
løsning som ser riktig ut er det verste utfallet — den koster mer å oppdage
enn å skrive på nytt.

Typiske gyldige blokkeringer: forventet resultat i § 11 stemmer ikke med
faktisk atferd (er det en produktfeil eller en feil i katalogen?), ingen rad
i nivåtabellen passer, testen krever data eller tilgang agenten ikke har,
eller to dokumenter sier ulike ting.

### 16.4 Oppgavestørrelse

- **Én oppgave = én til tre TC-ID-er i samme fil.** Flere ID-er på tvers av
  filer deles opp av testleder.
- Krever oppgaven mer enn ~10 verktøysteg, er den for stor.
- Oppgaver som spenner over flere testnivåer deles alltid, ett nivå per
  oppgave.

### 16.5 Når `effort: low` ikke holder

Hev til `effort: medium` eller `model: opus` i agentens frontmatter kun for:

- R1-områder der forventet atferd må utledes fra flere migrasjoner eller fra
  samspill mellom moduler (§ 11.12 RLS-matrisen, § 11.9 Vipps-avstemming).
- Første gang et helt nytt testmønster etableres — deretter kan low
  gjenbruke mønsteret.

Hev aldri effort som erstatning for en dårlig spesifisert oppgave. Fiks
oppgaven først (§ 16.1); hvis den fortsatt feiler, hev effort.

---

## 17. Sporbarhet og planlagt kjøring

### 17.1 Sporbarhet uten egen køfil

ISTQB krever sporbarhet mellom testcaser og tester. Kaupet løser det uten et
eget statusdokument som kan drive ut av synk: **en case regnes som dekket når
TC-ID-en står i en testfil**. Verktøyet som utleder statusen, og kommandoene
for å hente neste udekkede case, er beskrevet i § 17.6.

Caser på nivå `M` (manuell) og `Prosess` telles ikke med — de kjøres etter
§ 12 og playbook PB-5/PB-7.

### 17.2 Hva som egner seg for planlagt kjøring

Ikke alt i katalogen skal kjøres på intervall. Skill mellom to typer arbeid:

| Type                                                            | Eksempel                                                                                 | Planlagt?                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| **Nedbrenning** — engangsarbeid som forsvinner når det er gjort | Skrive test for CRE-11                                                                   | Ja, som kø: «ta neste udekkede case»    |
| **Overvåking** — resultatet endrer seg over tid                 | Ytelsessveip, a11y-sveip, eksplorativt charter mot staging, `bun audit`, flaky-deteksjon | Ja, ekte gjentakelse                    |
| **Portvakt** — skal blokkere en endring                         | Dekningssjekk, lint, typecheck                                                           | Nei — hører hjemme i CI, ikke på klokke |

Å schedulere «skriv test for CRE-11» ukentlig er meningsløst: når den er
skrevet, er den skrevet. Nedbrenning schedules som _kø_, ikke som _case_.

### 17.3 Forutsetninger før en planlagt agent settes i drift

| #   | Forutsetning                                                                                      | Status                                                                                       |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Maskinlesbar status per case, så agenten ikke gjør samme case om igjen                            | Dekket av § 17.1                                                                             |
| 2   | Definert utkanal: agenten pusher til egen branch og åpner PR — aldri direkte til `staging`/`main` | Må settes i oppgaveprompten                                                                  |
| 3   | Oppgaven oppfyller utførbarhetskontrakten (§ 16.1) uten menneske til stede                        | Gjelder skjerpet: ingen kan svare på et spørsmål midt på natten                              |
| 4   | `BLOKKERT` er et gyldig og forventet utfall (§ 16.3)                                              | Agenten skal stoppe, ikke gjette                                                             |
| 5   | Miljøtilgang som oppgaven krever                                                                  | RLS-caser krever Docker + `supabase start`; eksplorative charter krever staging og nettleser |
| 6   | Et sted resultatet havner der noen ser det                                                        | PR, eller en rapportfil i repoet                                                             |

Forutsetning 2 og 6 er de som oftest glemmes. En planlagt agent uten utkanal
gjør arbeid ingen ser; en med skrivetilgang til `staging` er en
produksjonsrisiko.

### 17.4 Anbefalt kadens

| Jobb                                               | Agent           | Kadens              | Utkanal                 |
| -------------------------------------------------- | --------------- | ------------------- | ----------------------- |
| Nedbrenning: neste udekkede P0-case                | `test-author`   | Daglig på hverdager | PR per case             |
| Eksplorativt charter mot staging, roterende område | `test-explorer` | Ukentlig            | Rapportfil + defekter   |
| Ytelsessveip (§ 11.14) mot staging                 | `test-explorer` | Ukentlig            | Rapportfil med tall     |
| A11y-sveip (§ 11.15), roterende flate              | `test-explorer` | Hver 14. dag        | Rapportfil              |
| Katalogrevisjon: nye moduler uten caser            | testleder       | Månedlig            | PR mot dette dokumentet |

Rotasjonen skal være deterministisk (f.eks. område etter ukenummer), ikke
«velg et interessant område» — det er nettopp den typen skjønn § 16 fjerner.

### 17.5 Etablerte planlagte jobber

Kjører lokalt via appens scheduled-tasks (`~/.claude/scheduled-tasks/`), og
bare når Claude-appen er åpen. En forfalt jobb kjører ved neste oppstart.

| Jobb-ID                       | Kadens          | Agent           | Leverer                                    |
| ----------------------------- | --------------- | --------------- | ------------------------------------------ |
| `kaupet-test-nedbrenning`     | Hverdager 07:12 | `test-author`   | Commit på `test/auto-<TC-ID>`, ingen push  |
| `kaupet-eksplorativt-charter` | Mandag 08:23    | `test-explorer` | `test-results/charter-uke<NN>-<område>.md` |
| `kaupet-ytelsessveip`         | Onsdag 08:17    | `test-explorer` | `test-results/ytelse-<dato>.md`            |
| `kaupet-a11y-sveip`           | Den 1. og 15.   | `test-explorer` | `test-results/a11y-<dato>-<flate>.md`      |

Felles vakter i alle fire promptene:

- **Skitten-tre-vakt:** nedbrenningsjobben avbryter hvis `git status
--porcelain` ikke er tom, eller hvis branchen ikke er `staging`/`main`.
  Den skal aldri stashe eller commite brukerens arbeid.
- **Ingen utgående handlinger:** aldri push, PR, merge eller deploy.
  Resultatet blir stående lokalt til et menneske ser på det.
- **Aldri produksjon:** all kjøring mot lokal dev eller `staging.kaupet.no`.
  Vipps kun i testmodus.
- **Deterministisk rotasjon:** område velges av ukenummer/dato, ikke av
  agentens vurdering, og rotasjonsgrunnlaget skrives i rapporten.
- **`BLOKKERT` er et gyldig utfall:** ingen kan svare på et spørsmål kl. 07,
  så agenten skal stoppe fremfor å gjette (§ 16.3).

`test-results/` er gitignorert. Rapporter som fortjener å overleve, løftes
inn i repoet av et menneske.

### 17.6 Røn Agents — tavle, kjøring og oppfølging

Verktøystøtten bor i et eget repo, ikke i Kaupet:
**[github.com/sprudlevann/ron_agents](https://github.com/sprudlevann/ron_agents)**

Det er en macOS-app rundt en lokal Node-server som følger flere prosjekter.
Registrer Kaupet én gang:

```bash
npm run project:add -- /Users/<deg>/Documents/GitHub/Kaupet
npm run app && open "build/Røn Agents.app"
```

Appen oppdager oppsettet selv: testkatalogen (dette dokumentet), agentene i
`.claude/agents/`, testrøttene `src/` og `e2e/`, rapportmappen `test-results/`
og instruksjonsfilene `CLAUDE.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`.

Hva den gir:

| Flate       | Innhold                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sidepanel   | Alle agenter med modell, effort og skrivetilgang, hvilke instruksjonsfiler de leser, og live aktivitet mens en jobb kjører   |
| Oversikt    | Nøkkeltall, planlagte jobber med «Kjør nå» og sist-kjørt-status, brancher fra nedbrenningen, rapporter, neste udekkede caser |
| Logg        | Hele forløpet for hver kjøring: agentens resonnement og hvert verktøykall, med kostnad og antall turer                       |
| Aksjonskort | Tiltak jobbene har funnet — `DEF-`-blokker fra rapportene og kjøringer som endte blokkert                                    |

**Sporbarhet.** En case i § 11 regnes som dekket når TC-ID-en står i en
testfil, i testnavnet eller som kommentar over `describe`:

```ts
// Dekker AUTH-03 (docs/TESTSTRATEGI.md § 11.1)
describe("safeReturnTo", () => {
```

Ingen egen statusfil som kan drive ut av synk. `npm run coverage -- --next`
gir neste udekkede case (P0 først) — det er inngangen for nedbrenningsjobben,
og kilden til metrikken «Andel P0-caser automatisert» i § 13.

**Defektrapporter må følge § 9-malen** for å bli plukket opp som aksjonskort.
Det er den eneste grunnen malen er obligatorisk for agentene.

Jobbene kjøres headless med `claude -p` i Kaupet-katalogen. Serveren blokkerer
`git push`, `gh`, `wrangler` og `supabase db push`, binder kun til loopback og
krever at `claude`-CLI er innlogget.
