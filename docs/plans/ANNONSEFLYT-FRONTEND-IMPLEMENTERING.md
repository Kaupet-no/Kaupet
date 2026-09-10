# Implementeringsplan — annonseflyt med mindre friksjon

**Status:** Klar for implementering
**Målgruppe:** Kodeagent som skal utføre én avgrenset fase om gangen
**Beslutningsgrunnlag:** `docs/decisions/2026-09-06-annonseflyt-friksjonsreduksjon.md`

## Mål

Forbedre eksisterende annonse-wizard uten en ny composer-, kapittel- eller
workspace-arkitektur. Tiltakene skal redusere valg, skriving og avbrudd for
sluttbrukeren, samtidig som Kaupets minimalistiske uttrykk beholdes.

Sluttresultatet skal:

- la brukeren komme raskt i gang med tittel
- bruke tittel til å foreslå kategori, med manuell fallback
- gjøre bilder enkle å legge til, men aldri obligatoriske
- utsette valgfrie felt som ikke kreves for publisering
- skille publiseringskrav fra valgfrie forbedringer
- bruke konsistent navigasjon på web og native
- bevare gjestedraft, auth-handoff, kjøretøyoppslag og dynamiske kategoriflyter

## Allerede gjort — ikke gjenta

- Femkapittel-/workspace-omskrivingen er fjernet fra arbeidskopien.
- Arkiv: `wip/ny-annonseflyt-arkiv`, commit `18f789e6`.
- Eksisterende staging-wizard er gjeninnført.
- `src/routes/ny-annonse.tsx` og `src/routes/ny-ok-annonse.tsx` er offentlige.
- Gjestedraft og auth-handoff er implementert.
- Fotoassistert kategoriforslag finnes bare som flagget backend. Ikke aktiver det.
- Analytics-baseline er bakoverkompatibel.
- Nåværende state er verifisert med typecheck, lint og full unit-suite.

Ikke hent tilbake `sell-composer.tsx`, `want-composer.tsx`,
`composer-chapters.ts`, `ListingComposerWorkspace` eller
`RollingListingWorkspace`. Ikke rediger `src/routeTree.gen.ts` manuelt.

## Arbeidsregel

Utfør fasene sekvensielt. Hver fase skal være grønn før neste startes. Ved
uventet feil: rett produksjonskoden. Ikke svekk tester, slett assertions eller
oppdater visual snapshots blindt for å få grønt resultat.

---

## Fase 1 — Baseline og eksisterende mønstre

### Les før endring

- `AGENTS.md`
- `docs/UI-GUIDE.md`
- `docs/ARCHITECTURE.md`
- `src/routes/README.md`
- `docs/TESTSTRATEGI.md`, særlig testnivå og playbook i § 3 og § 10

### Les implementasjonen

- `src/components/intent-title-landing.tsx`
- `src/components/new-listing-dialog.tsx`
- `src/routes/index.tsx`
- `src/routes/ny-annonse.tsx`
- `src/routes/ny-ok-annonse.tsx`
- `src/features/listing-creation/category-flows.ts`
- `src/features/listing-creation/use-listing-steps.ts`
- `src/features/listing-creation/listing-composer-shell.tsx`
- `src/features/listing-creation/native-composer-deck.tsx`
- `src/features/listing-creation/use-composer-history.ts`
- `src/features/listing-creation/field-groups/registry.ts`
- `src/features/listing-creation/field-groups/types.ts`
- `src/features/listing-creation/field-groups/category-confirm/index.tsx`
- `src/features/listing-creation/field-groups/review-publish/index.tsx`
- eksisterende bilde-, pris- og delivery/location-field groups
- `src/features/listing-creation/use-listing-title-hints.ts`
- `src/features/listing-creation/use-title-based-listing-hints.ts`

Gjenbruk disse mønstrene. Ikke opprett en parallell stegmodell eller ny global
state-container.

### Observer baseline

Start `bun run dev`. Kjør minst:

- desktop 1440×900
- mobilweb 375×812
- smal mobil 320×700
- tablet 820×1180

Kontroller `/`, `/ny-annonse?type=sell`, `/ny-annonse?type=free` og
`/ny-ok-annonse`. Noter første input, klikk før første tekstinput, antall steg,
publiseringskrav, optional-felt og forskjeller mellom salg/kjøpsønske.

Ingen kode eller snapshots endres i denne fasen.

---

## Fase 2 — Tittel som raskeste inngang

### Filer

- `src/components/intent-title-landing.tsx`
- `src/components/intent-title-landing.test.tsx`
- eventuelt eksisterende kallsteder i `src/routes/index.tsx` og
  `src/components/new-listing-dialog.tsx`

### Endring

Behold eksisterende intensjonsvalg, men gjør inngangen til ett tydelig spørsmål
og ett tittel-felt:

- overskrift: `Hva vil du selge?`, tilpasset valgt intensjon
- input-label: `Tittel`
- hjelpetekst med reelt eksempel, ikke bare placeholder
- primærhandling: `Fortsett`

Krav:

- trim tittel før navigasjon
- respekter eksisterende minstelengde
- Enter skal sende skjemaet
- fokus går til tittel etter valgt intensjon
- ingen AI-terminologi
- ingen ny modal eller state-maskin

Behold eksisterende ruter og søkeparametere:

```ts
navigate({ to: "/ny-annonse", search: { type: "sell", title } });
navigate({ to: "/ny-annonse", search: { type: "free", title } });
navigate({ to: "/ny-ok-annonse", search: { title } });
```

Direkte `/ny-annonse?type=sell` uten tittel skal fortsatt starte med manuell
kategori. Ikke tving alle innganger gjennom landingen.

### Tester

Test sell/free/buy, trimming, Enter, tom tittel og for kort tittel.

```bash
bun run test -- src/components/intent-title-landing.test.tsx
```

Forventet: testfil grønn; ingen snapshots endret.

---

## Fase 3 — Kategoribekreftelse før bilder ved tittelbasert inngang

### Filer og symboler

- `src/routes/ny-annonse.tsx`: `fromLanding`, `categoryConfirmed`, sideoppsett
- `src/features/listing-creation/category-flows.ts`:
  `effectiveFlowForCategory`, landing-transformasjon og `resolveWizardPages`
- `src/features/listing-creation/category-flows.test.ts`
- `src/features/listing-creation/field-groups/category-confirm/index.tsx`
- nærmeste eksisterende category-confirm-komponenttest

### Ny rekkefølge

For `/ny-annonse?type=sell&title=...`:

1. kategoriforslag eller manuell kategori
2. bilder og tittel
3. obligatoriske kategoriattributter
4. pris og tilstand
5. levering og sted
6. review

Direkte inngang uten tittel beholder `category-select` først.

### CategoryConfirm-atferd

Ikke opprett `ListingCategoryPreflight`.

Tilstander:

- loading: `Finner passende kategori …` + aktiv `Velg kategori selv`
- forslag: maksimalt tre kategorier + `Velg en annen kategori`
- null/feil: `Vi fant ingen sikker kategori` + `Velg kategori`

Krav:

- loading bruker `role="status"` og `aria-live="polite"`
- aldri blokkerende helsidespinner
- aldri automatisk aksept eller auto-advance
- brukeren velger eksplisitt
- manuell kategori vinner over sent AI-svar
- rå provider-/nettverksfeil vises ikke
- aksept setter kategori én gang og fjerner category-confirm fra resten
- tittel beholdes ved kategoribytte
- eksisterende `AlertDialog` brukes bare når kategoriavhengige data vil slettes

### Tester

- title-entry starter category-confirm før photos
- direct entry starter category-select
- aksept fjerner confirm-steget
- fallback er tilgjengelig under loading
- null-resultat gir manuell velger
- manuelt valg kan ikke overskrives av sent forslag
- tittel overlever kategoriendring

```bash
bun run test -- \
  src/features/listing-creation/category-flows.test.ts \
  src/features/listing-creation/field-groups/category-confirm/index.test.tsx
```

---

## Fase 4 — Mindre friksjon i bildesteget

### Filer

- eksisterende photos field group under
  `src/features/listing-creation/field-groups/`
- `src/components/image-uploader.tsx`
- `src/features/listing-creation/no-image-dialog.tsx`
- `src/routes/ny-annonse.tsx`
- eksisterende testsøsken

### Endring

Bildesteget skal ha én dropzone/velger, kort forklaring, eksisterende sortering,
primær `Neste` og sekundær `Fortsett uten bilder`.

Foreslått copy:

```text
Legg til bilder
Gode bilder gjør det enklere å vurdere annonsen.

[Velg bilder]

Fortsett uten bilder
```

Ikke endre bildeformat-, komprimerings-, JXL- eller upload-kontrakter.

Første bildehopp i én wizard-økt kan bruke eksisterende `NoImageDialog`. Etter
bekreftelse skal dialogen ikke vises igjen i samme økt. Ikke persister dette på
tvers av nye annonser. Review beholder `Legg til bilder` som optional forbedring.

### Tilgjengelighet

- filvelger har tilgjengelig navn
- drag-and-drop er aldri eneste metode
- status bruker `role="status"`
- sletting og rekkefølge kan brukes uten drag
- fokus beholdes etter bildeoperasjon
- feil knyttes til riktig bilde/uploader

### Verifisering

Kjør hele relevante testmoduler. Browser-test: legg til, slett, hopp over, gå
tilbake og hopp over igjen. Dialogen skal bare vises første gang i økten.

---

## Fase 5 — Flytt optional-felt ut av hovedløypen

### Filer og kontrakt

- `src/features/listing-creation/field-groups/registry.ts`
- `src/features/listing-creation/field-groups/types.ts`
- `src/features/listing-creation/category-flows.ts`
- `src/features/listing-creation/field-groups/review-publish/index.tsx`
- `src/features/listing-creation/composer-review.tsx`
- tilhørende registry-, flow- og review-tester

Bruk eksisterende klassifisering:

- `requiredToPublish`
- `recommendedForTrust`
- `optionalEnhancement`

Ikke lag et nytt kravsystem.

### Sekvensregler

Hovedflyten inneholder `requiredToPublish`, tekniske forutsetninger for senere
required-steg og eksplisitt sentrale felt som bilder. `optionalEnhancement`
skal normalt ikke få eget obligatorisk steg. `recommendedForTrust` vurderes per
kategori og kan vises på review.

Beslutningen skal ligge i registry/category behavior, ikke som nye spredte
`isVehicle`-sjekker i ruten.

Kontroller alltid Zod, `category_filters.required`, `validateExtra`,
serverfunksjonens schema og databaseconstraints før et felt flyttes.

### Review

Vis to nivåer:

```text
Dette må fylles ut
- Pris
- Postnummer

Gjør annonsen bedre
- Legg til bilder
- Oppgi merke
```

Optional-rader skal ikke se ut som feil. Hver rad skal hoppe til eksisterende
field group. Etter redigering returneres brukeren til review.

### Tester

- required-felt forblir i hovedflyt
- optional-felt blokkerer ikke publisering
- required-felt blokkerer
- optional-felt vises som forbedring på review
- redigering hopper riktig og returnerer til review
- kjøretøykrav er uendret

Kjør hele registry-, category-flow- og review-testmodulene.

---

## Fase 6 — Konsistent navigasjon og progresjon

### Filer

- `src/features/listing-creation/use-listing-steps.ts`
- `src/features/listing-creation/step-indicator.tsx`
- `src/features/listing-creation/native-composer-deck.tsx`
- `src/features/listing-creation/use-composer-history.ts`
- `src/routes/ny-annonse.tsx`
- `src/routes/ny-ok-annonse.tsx`
- eksisterende testsøsken

### Krav

- samme Next/Back/review-logikk for salg og kjøpsønske
- samme progresjonsformat
- `NativeComposerDeck` på begge native-flyter
- web bruker samme rekkefølge uten swipe
- system-/browser-back går ett steg tilbake når mulig
- åpent overlay lukkes før wizard-navigasjon
- første steg bruker eksisterende exit/discard-mønster
- siste steg har én primær publiseringshandling

Behold enkel progresjon:

```text
Steg 2 av 5
Pris og tilstand
```

Ikke lag klikkbar kapittelrail. Ved dynamisk endring skal aktivt steg beholdes
via field-group key fremfor gammel indeks der det er mulig.

CTA-er:

- web next: `Neste: <navn>`
- native next: `Fortsett`
- innlogget salg: `Publiser annonse`
- gjest: `Logg inn og publiser`
- kjøpsønske: `Publiser kjøpsønske`
- bildehopp: `Fortsett uten bilder`

Kjør fullmodul-testene for steps, indicator, deck, history og shell.

---

## Fase 7 — Visuell forenkling i eksisterende shell

### Filer

- `src/features/listing-creation/listing-composer-shell.tsx`
- `src/styles.css`
- eventuelle nærliggende komponenttester

Endre `docs/UI-GUIDE.md` bare dersom det etableres en reelt gjenbrukbar ny
konvensjon.

### Mobil

- én kolonne
- fast footer respekterer safe area
- tastatur/footer skjuler ikke aktivt felt
- ett hovedfokus per skjerm
- ingen desktop-sidepaneler

### Desktop

- begrenset hovedkolonne
- eksisterende review-preview kan ligge i aside
- ingen permanent navigasjonsrail
- ingen tre konkurrerende kolonner
- én visuelt dominant CTA

### Craft-regler

- semantiske tokens, ingen hardkodede farger
- ingen gradient eller glow
- ingen `transition: all`
- 4/8-spacing
- typografi og whitespace bærer hierarkiet
- border eller subtil elevation; ikke begge uten grunn
- hover/focus-visible/disabled/loading/empty/error
- kort funksjonell motion med `prefers-reduced-motion`
- unngå kort-i-kort-i-kort

Fjern doble stegoverskrifter, gjentatt breadcrumb, duplisert hjelpetekst og
identiske status-/feillister dersom brukeren ikke mister informasjon eller
kontroll.

### Browser-verifisering

- lys og mørk
- 200 % zoom
- reduced motion
- keyboard-only
- lange kategori- og tittelfelt
- loading, empty, error og validation
- offline draft-save-feil
- viewporter fra fase 1

Visual snapshots må gjennomgås visuelt. Ikke bruk snapshot-oppdatering som
korrekthetsbevis.

---

## Fase 8 — Mål effekten uten PII

### Filer

- `src/lib/product-analytics-schema.ts`
- `src/lib/product-analytics-schema.test.ts`
- `src/lib/product-analytics.ts`
- `src/routes/ny-annonse.tsx`
- `src/routes/ny-ok-annonse.tsx`
- `scripts/weekly-funnel.ts`
- `src/lib/weekly-funnel.test.ts`

Behold eventnavn:

- `listing_creation_started`
- `listing_creation_step_completed`
- `listing_published`

Tillat bakoverkompatible, optional properties: `kind`, `step`, `stepNumber`,
`action`, `reason`, `layout`, `duration_bucket`.

Ikke logg tittel, beskrivelse, registreringsnummer, postnummer, fritekst,
bildeinnhold, e-post eller user ID.

Mål minst viewed/completed/validation_failed per steg, draft_restored,
auth_started, auth_resumed, publish_started, publish_failed og published.

Legg test for eksisterende payload med `stepNumber` og event uten nye
properties. Ingen eldre kallsteder skal avvises.

```bash
bun run test -- \
  src/lib/product-analytics-schema.test.ts \
  src/lib/weekly-funnel.test.ts
```

---

## Fase 9 — Sluttverifisering

### Statisk

```bash
bunx tsc --noEmit
bun run lint
```

Forvent exit 0 uten warnings.

### Tester

```bash
bun run test -- <alle berørte testfiler>
bun run test
```

Alle eksisterende testsøsken skal kjøres. Ikke bare ny happy-path-test.

Hvis `e2e/draft-auth-handoff.spec.ts` mangler, opprett den etter eksisterende
Playwright-konvensjoner. Testen skal verifisere lokal draft-flush før auth,
at `returnTo` inneholder `resume=auth-publish`, og at samme draft kan
gjenopprettes etter retur. Bruk eksisterende testkonto-/auth-fixture dersom
repoet har en; ikke hardkod ekte credentials.

### E2E

```bash
bun run test:e2e:playwright -- \
  e2e/publish-listing.spec.ts \
  e2e/publish-vehicle-listing.spec.ts \
  e2e/publish-want-listing.spec.ts \
  e2e/draft-auth-handoff.spec.ts
```

Bruk `bun run test:e2e` dersom repoets runner støtter filargumenter i aktuell
konfigurasjon.

### Browser-reiser

1. Enkel salg: title-entry, kategori, uten bilder, bare required, review,
   publisering.
2. Gjestedraft: fyll ut, auth, retur til review med tekst/kategori/attributter/
   bilder bevart, publiser.
3. Kjøretøy: gyldig oppslag og manuell variant uten skilt; frem/tilbake.
4. Kjøpsønske: tittel, kategori, minimumskrav, gjeste-auth, publisering.
5. Gis bort: ingen prisfriksjon eller skjulte prisfeil.

### Regresjonssøk

Bruk agentens innebygde grep-verktøy. Følgende skal gi null produksjonstreff:

- `composer-chapters`
- `ListingComposerWorkspace`
- `RollingListingWorkspace`
- `_authenticated/ny-annonse`
- `_authenticated/ny-ok-annonse`

---

## Risikoer og edge cases

### Dynamiske steg

Kategoribytte kan endre stegantall. Behold aktiv field-group key fremfor rå
indeks. Ikke send brukeren bakover uventet.

### Gjestedraft

Håndter utilgjengelig/full localStorage, IndexedDB-feil, draft >7 dager, gammel
versjon, sen auth-retur, lukket fane og to faner. Ikke slett lokal React-state
før brukeren faktisk forlater siden.

### Kategoriforslag

Håndter timeout, null forslag, skjult kategori, parent uten leaf, sent svar og
tittelendring. Manuelt valg vinner alltid.

### Required vs optional

UI-label er ikke kilde til sannhet. Kontroller Zod, category-filter,
`validateExtra`, serverschema og databaseconstraint.

### Native

Kontroller keyboard/safe-area, edge swipe, Android back, overlay-history,
avslått kamera/lokasjon og offline/resume.

### Minimalisme

Ikke fjern labels, feilmeldinger, required-markering, fremdrift, lagringsstatus,
manuell fallback eller back/undo.

### Analytics

Nye felter må være optional. Streng ny kontrakt kan ellers stille forkaste
produksjonsevents fra eldre kallsteder.

## Anbefalt commitrekkefølge

1. `feat(listing-creation): start med tittelbasert kategoribekreftelse`
2. `refactor(listing-creation): utsett valgfrie felt til gjennomgang`
3. `feat(listing-creation): forenkle bildehopp og forbedringsforslag`
4. `fix(listing-creation): ensrett navigasjon på web og native`
5. `feat(analytics): mål friksjon i annonseopprettelsen`

Ingen `Co-Authored-By`.

## Ferdigkriterier

- eksisterende staging-wizard er fortsatt kjernen
- ingen kapittel-/workspace-modell er introdusert
- title-entry krever færre kategoriklikk
- manuell kategori er alltid tilgjengelig
- bildehopp gir ikke gjentatt dialog
- optional-felt blokkerer ikke; required-felt blokkerer
- salg og kjøpsønske har konsistent navigasjon
- gjestedraft overlever ekte auth-retur
- desktop, mobilweb og native-lignende viewporter er manuelt verifisert
- typecheck, lint, full unit-suite og relevante E2E-er er grønne
- ingen test eller snapshot er svekket for å oppnå grønt resultat
