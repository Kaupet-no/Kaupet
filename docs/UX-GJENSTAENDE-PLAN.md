# UX: gjenstående aktiviteter

Konsoliderer `DRAWER-CONSOLIDATION-PLAN.md` og `UX-PLANER-OPPSUMMERING.md`
(som selv erstattet `NATIVE-UI-UX-PLAN.md`, `SOK-UX-PLAN.md`,
`UX-AUDIT-PLAN.md`) til ett dokument. Alt som var ferdig i de foregående
planene er fjernet herfra — dette lister kun det som gjenstår. Detaljert
historikk: git-historikk på `staging`, commits 2026-08-05 til 2026-08-10.

Sist oppdatert: 2026-08-11.

## A. Drawer-konsolidering — fullført, med ett bevisst unntak

`NativeSheet` (`src/components/ui/native-sheet.tsx`) er innført og migrert i
`messages-button.tsx`, `notifications-bell.tsx`, `filter-sections.tsx`
(`TermGroupSheet`), `attribute-filter-chips.tsx`, `meg.tsx`, `app-landing.tsx`
og `result-list.tsx` (kart-sheet, begge instanser — tittel "Kart" er synlig,
`h-[88vh] p-4` via `className`). `NativeSheet.title` er utvidet fra `string`
til `React.ReactNode` for å dekke `app-landing.tsx`s tittel-med-tilbakeknapp.

- `src/components/category-picker.tsx:432` — **bevisst ikke migrert.**
  Komponenten har en tredje gren `ResponsiveOverlay` ikke støtter: `Popover`
  på desktop når `trigger` er satt (inline-dropdown i skjemaer), `Dialog` når
  ikke. Mobil-headeren har i tillegg en alltid-synlig breadcrumb + egen
  tilbakeknapp, ikke bare en tittel-streng. Å presse dette inn i `NativeSheet`
  krever å utvide primitiven med Popover-støtte for ett eneste kallsted —
  det er spekulativ fleksibilitet, ikke konsolidering. Stående unntak,
  sammen med `advanced-search-sheet.tsx` (side-panel, ikke bunn-drawer).

Verifisering per fil: åpne/lukk i emulator, sjekk at Android tilbake-knapp og
iOS kant-sveip lukker den, sjekk nettbrett-viewport (sentrert dialog, ikke
fullbredde bunn-skuff).

## B. Simulator-/enhetsverifisering — delvis gjort (iOS)

Kjørt på ekte iOS-simulator (iPhone 17, iOS 26.5) 2026-08-11.
`capacitor.config.ts` ble midlertidig pekt mot lokal dev-server
(`http://localhost:8081`) i stedet for produksjon for å kunne verifisere med
testkontoen — reversert igjen etter økten, ikke committet.

1. **Splash ved kaldstart — verifisert, fungerer.** Forsvinner korrekt til
   onboarding, ikke låst fast. Offline-kaldstart ikke testet separat.
2. Rotasjonslås og pinch/sveip i bildevisning — **ikke testet** (rakk ikke).
3. iOS-kantsveip mot Embla-karuseller / zoomet panorering — **ikke testet.**
4. Dynamic Type / Android-skalering — **ikke testet.**
5. Android nettbrett + `useFormFactor()` — **ikke testet** (ingen
   Android-emulator satt opp i denne økten, kun iOS).
6. Notch/safe-area, tap-highlight — **ikke testet.**

**Bonus-funn i samme økt** (ting fra fase 1/3 som var markert "ikke
verifisert i browser" fordi de er `native`-gatet — bekreftet fungerende på
ekte enhet):

- `app-landing.tsx`s "Alle kategorier"-`NativeSheet` (fase 1) — åpner/lukker
  korrekt, draghåndtak og tittel vises.
- Ad-picker-sheeten i `app-bottom-nav.tsx` ("+"-knappen, fase 3 punkt 2) —
  åpner korrekt med begge valgene ("selger/gir bort" / "ønsker å kjøpe").
- Pull-to-refresh (fase 3 punkt 3) — gest sendt (dra ned 280pt, over
  64px-terskelen koden krever), men **ikke visuelt bekreftet**: verktøyet
  kan ikke skjermbilde midt i en pågående touch-gest, kun før/etter, så
  selve refresh-indikatoren ble ikke fanget på bildet.

**Ikke testbart på iOS i det hele tatt:** onboarding-tilbake-fiksen (E,
punkt 1 — se der) bruker `App.addListener("backButton", ...)`, som er en
**Android-only** Capacitor-event. Krever en Android-emulator for faktisk
verifisering.

**Praktiske friksjonspunkter fra økten** (til info for neste gjennomgang):
skjermkoordinat-beregning fra skjermbilder til punkt-koordinater i dette
simulator-verktøyet var upresist og krevde mye prøving; tekst-injeksjon
(`text`-handlingen) mapper konsekvent `@` til `"` (tastaturlayout-bug) — måtte
løses ved at brukeren åpnet simulatorens virtuelle skjermtastatur
(Cmd+K) og klikket `@` selv med musen.

## C. Innloggede flater er aldri sett kjøre

Berører annonseveiviserens skjemaoppsett, ad-picker-sheeten, pull-to-refresh
på de nye rutene, søkepanelets lagre-flyt og nettbrettets meldingsoppsett.
Løses av én tydelig merket testbruker mot **staging**-prosjektet (via
`.env.staging.local`, som allerede finnes i repoet), ikke av mer
kodegjennomgang. Opprinnelig plan foreslo en lokal Supabase-stack
(`supabase start`) for å unngå å røre et delt prosjekt i det hele tatt — men
Docker kjører ikke lokalt her, og staging er allerede et adskilt,
delt-men-ikke-produksjon-prosjekt beregnet nettopp for denne typen
verifisering. Én klart merket testkonto der er et rimeligere valg enn å
stable opp en Docker-stack for en engangs manuell gjennomgang.

## D. Kjent teknisk gjeld

- **Native e2e-dekning for søkepanelet — skrevet 2026-08-11.**
  [e2e/search-panel.spec.ts](../e2e/search-panel.spec.ts): åpner panelet over
  `/annonser` (via dev-only `?forcenative`, se `src/lib/native.ts`), sjekker
  at "Vis X treff"-knappen dukker opp og lukker panelet med den. Kjørt og
  bekreftet grønn lokalt (`npx playwright test e2e/search-panel.spec.ts`).

  **Bifunn:** knappen matches ikke av `getByRole('button', {name: ...})` —
  måtte bruke en tekst-locator i stedet. Rotårsak: Radix Dialogs
  `hideOthers()` (kalt av vaul/`@radix-ui/react-dialog` når panelet åpnes)
  setter `aria-hidden="true"` på alle søsken til `Drawer.Content`, og
  "Vis X treff"/"Lagre"-baren er bevisst plassert som nettopp en slik søsken
  (se "Egen flate, ikke inni Drawer.Content"-kommentaren i
  `search-panel.tsx` — vauls transform på Content ville ellers dratt en
  fastpinnet bunnbar med seg av skjermen). Netto: **skjermleser-brukere kan
  ikke nå disse knappene mens panelet er åpent**, selv om de er fullt
  klikkbare med mus/touch. Reell a11y-bug, men risikabel å fikse blindt
  (layout-kommentaren er der av en grunn) — flagget som egen spawnet
  oppgave (`task_3d6f46e9`) i stedet for å forsøke en fiks inni denne økten.

- **Resultattelling i søkepanelet — fikset 2026-08-11.** Filterendringer gikk
  allerede rett til URL/query (ingen "draft"-steg), men
  `useInfiniteQuery` i
  [use-listings-query.ts](../src/features/listing-search/use-listings-query.ts)
  manglet `placeholderData: keepPreviousData` — hver filterendring er en ny
  `queryKey`, så telleren blanket momentant til den nye siden var hentet i
  stedet for å vise forrige antall til det nye var klart. Lagt til
  `placeholderData: keepPreviousData` (standard React Query-mønster).
  Typecheck rent, testsuiten grønn. **Ikke visuelt verifisert** — treff-
  telleren vises kun i `AttributeFilterChips` (web) og søkepanelet (native),
  og en pålitelig visuell reproduksjon av selve blink-fiksen (et
  tidsvindu-problem) lot seg ikke fange med verktøyene tilgjengelig i denne
  økten. Fiksen er en veldokumentert, standard React Query-løsning for
  nøyaktig denne symptombeskrivelsen.
- Aktiv samtale markeres ikke i nettbrettets meldingsliste — **fikset
  2026-08-11.** Lagt til `data-[status=active]:bg-accent/10` på
  samtale-`Link`-en i
  [meldinger.index.tsx](../src/routes/_authenticated/meldinger.index.tsx),
  samme mønster som allerede brukt i `admin/route.tsx`s navigasjonsfaner
  (TanStack Router setter `data-status="active"` automatisk). `InboxPage`
  gjenbrukes uendret som nettbrettets venstre spalte i `meldinger.$id.tsx`,
  så ingen egen plumbing trengtes — `Link`s aktive tilstand følger den
  faktiske URL-en uansett hvor komponenten er montert. **Ikke visuelt
  verifisert** — krever en ekte samtale å teste mot (se punkt 5 i fase 3).
- ~~`useSheetDrag` (håndrullet) og `vaul` (bibliotek) lever side om side for
  bunn-sheet-drag~~ — **stale, allerede løst.** [sheet.tsx:117](../src/components/ui/sheet.tsx)
  sin egen kommentar bekrefter det håndrullede dra-oppsettet ble erstattet av
  `vaul` i "fase 14", før dette punktet ble skrevet inn i planen. Ingen
  `useSheetDrag` finnes i kodebasen (bekreftet med grep 2026-08-11).

## E. Ikke-leverte tiltak

- **Tilbake-trykk under onboarding avslutter appen** i stedet for å navigere
  tilbake i onboarding-kortene — **kode fikset 2026-08-11.** Rotårsak:
  den globale Android-tilbakeknapp-lytteren i
  [native-offline.ts:46](../src/lib/native-offline.ts) kjenner kun til
  browser-historikk, mens onboardingens kort-karusell (lokal
  `currentIndex`-state i
  [onboarding-flow.tsx](../src/components/onboarding-flow.tsx)) bevisst ikke
  pusher historikk (`historyBack={false}`) — trykket falt derfor alltid
  gjennom til `App.exitApp()`. Løst med en liten "back override"-mekanisme
  (`setBackOverride` i `native-offline.ts`) som onboarding registrerer mens
  montert: naviger til forrige kort hvis `currentIndex > 0`, ellers la
  default (exit) skje — samme oppførsel som å trykke tilbake på rot-siden.
  Typecheck rent. **Ikke verifisert på enhet** — `App.addListener("backButton", ...)`
  er Android-only i Capacitor og fyres aldri i iOS-simulatoren som var
  tilgjengelig i denne økten. Krever Android-emulator for faktisk
  bekreftelse.
- **Håndrullet `pb-8`** i `messages-button.tsx`, `notifications-bell.tsx` og
  `meg.tsx` overstyrer safe-area-primitiven i stedet for å stole på den.
  Triviell, naturlig å ta sammen med punkt C (alle bak innlogging).
- **Bundlet web-bygg i appen** (for raskere kaldstart / offline-støtte) —
  bevisst holdt utenfor: krever egen arkitekturbeslutning (ADR), ikke tatt.

## F. Anbefalt, men aldri egen fase i noen av planene

- **Gradvis `jsx-a11y`-opprydding.** `eslint-plugin-jsx-a11y` er installert
  men kjører i praksis kun med én regel aktivert
  (`label-has-associated-control`). Aktiver `recommended`-settet gradvis som
  `"warn"`, tell brudd per regel som utgangspunkt.
- **Re-prompt-strategi for push-varsler** for brukere som hoppet over
  onboarding-priming (i dag: kun ett engangsforsøk, kun på native).
- **Frakoblet-indikator i meldingstråden** ved tapt Realtime-forbindelse.

## Ikke anbefalt

Ingen av de foregående planene anbefalte omskriving av annonseveiviseren,
meldingskjernen eller `ResponsiveOverlay`/`FullscreenOverlay`-arkitekturen —
alle tre ble vurdert som riktig bygget. Videre arbeid bør utvide disse
primitivene, ikke erstatte dem.

## Anbefalt implementeringsplan

Rekkefølgen følger giring (delte primitiver og enkeltbiter først) og
avhengighet (B og C er blokkert på hverandre delvis; E1 og F kan tas
når som helst, uavhengig av resten). Fem faser, hver avsluttes med en commit
og verifisering før neste starter — ikke bland faser i samme commit, siden
punkt B og C spesifikt krever ekte enhets-/backend-verifisering og ikke skal
skjules bak en kodeendring i samme diff.

### Fase 1 — Ferdigstill drawer-konsolidering (A) — fullført

`app-landing.tsx` og `result-list.tsx` (begge kart-sheet-instanser) migrert
til `NativeSheet`. `category-picker.tsx` bevisst latt urørt — se begrunnelse
i seksjon A. Typecheck rent (`bunx tsc --noEmit`), `bun run test` grønt
(244/244). Verifisert i browser-preview: kart-sheeten i `result-list.tsx`
åpner som fullbredde bunn-drawer med synlig "Kart"-tittel på mobil-viewport
(375px), og som sentrert `Dialog` på nettbrett-viewport (768px) — samme
`NativeSheet`-instans, `ResponsiveOverlay`s formatfaktor-switching bekreftet
virkende. `app-landing.tsx` er ikke verifisert i browser: `useIsNative()`
sjekker faktisk Capacitor-runtime uten dev-override, så den renderes ikke i
vanlig nettleser-preview — dekkes av fase 4 (simulator).

Ikke gjort: Android tilbake-knapp / iOS kant-sveip-lukking (krever ekte
enhet/emulator, ikke browser-preview) — flyttet til fase 4.

### Fase 2 — Testbruker mot staging (forutsetning for C)

Ingen ny infrastruktur — gjenbruker eksisterende `.env.staging.local`.

1. Opprett én tydelig merket testbruker i staging (f.eks.
   `e2e-test@kaupet.no` eller lignende gjenkjennelig adresse/navn) via vanlig
   signup-flyt mot staging, ikke produksjon.
2. Bruk `.env.staging.local` til å peke browser-preview mot staging-URL-en
   under fase 3-verifiseringen.
3. Noter kontoen kort i denne fila (uten passord) så neste person vet den
   finnes og ikke oppretter en duplikat.

**Status:** Opprettet — `e2e_test@kaupet.no` på staging (2026-08-11).

Ikke gjort: lokal Docker-basert Supabase-stack (`supabase start`) — vurdert
og forkastet, se begrunnelse i seksjon C. Fortsatt relevant for
`test:rls`-jobben spesifikt (se `CLAUDE.md`), som er et annet formål enn
manuell UI-verifisering.

### Fase 3 — Innloggede flater (C), verifiseres mot testbrukeren fra fase 2

Kjør hver flate manuelt i browser-preview eller simulator, ikke bare
kodegjennomgang — det var nettopp mangelen på dette som skapte punkt C.

1. Annonseveiviserens skjemaoppsett (`ny-annonse`-flyten) — **delvis
   verifisert.** Skjemaflyten gjennom alle 4 steg (kategori-drilldown,
   bildeopplasting m/"fortsett uten bilde", validering, utkast-autolagring,
   postnummer→geokoding→kart) fungerer. Selve publish-kallet er ikke
   fullført ende-til-ende siden det gates av Cloudflare Turnstile, som
   krever en ekte bruker (ikke noe jeg skal løse automatisk).

   **Bug funnet og fikset underveis:** Steg 4s knapperad ("Tilbake" +
   "Avbryt" + "Forhåndsvis annonse" + "Publiser annonse") manglet
   `flex-wrap`, så på 375px mobilbredde tvang knapperaden hele siden til å
   bli 558px bred — brukeren måtte scrolle horisontalt for å nå
   "Publiser annonse"-knappen.

   Første iterasjon la bare til `flex-wrap` — korrekt for å fjerne
   overflowen, men lot enkeltknapper bryte fritt (`Forhåndsvis annonse` og
   `Publiser annonse` kunne havne på hver sin linje). Presisert til: disse to
   skal alltid stå sammen; når det ikke er plass, brytes de som ett par til
   egen linje under `Tilbake`/`Avbryt`. Løst i
   [review-publish/index.tsx:124](../src/features/listing-creation/field-groups/review-publish/index.tsx)
   ved å la `PublishActions` rendre `Avbryt` som eget flex-item (kan bryte
   opp til `Tilbake`s linje) og gruppere `Forhåndsvis annonse` +
   Turnstile + `Publiser annonse` i en indre non-wrap `div` (ett udelelig
   flex-item i forelderens rad) — komponenten returnerer nå et Fragment i
   stedet for sin egen wrappende `div`, slik at alle fire elementene flater
   ut i samme flex-wrap-rad som `ny-annonse.tsx` sin footer
   ([ny-annonse.tsx:1042](../src/routes/_authenticated/ny-annonse.tsx))
   allerede setter opp.

   Verifisert lokalt (innlogget som `e2e_test@kaupet.no`), både 375px og
   desktop-bredde: på 375px står `Tilbake`+`Avbryt` på linje 1,
   `Forhåndsvis annonse`+`Publiser annonse` sammen på linje 2, ingen
   horisontal overflow (`window.innerWidth` forble 375). På desktop-bredde
   står alle fire på én linje. Ikke verifisert på staging selv (krever
   push+deploy).

2. Ad-picker-sheet — **flyttet til fase 4.** `AppBottomNav`
   (`src/components/app-bottom-nav.tsx`) som eier den, rendres kun når
   `isNative()` er sann (samme mønster som `app-landing.tsx` i fase 1) —
   ikke nåbar i browser-preview i det hele tatt, krever simulator.
3. Pull-to-refresh på de nye rutene — **flyttet til fase 4.**
   `usePullToRefresh` er kalt med `enabled: native` i `meldinger.index.tsx`,
   `favoritter.tsx`, `varsler.tsx` og `mine-annonser.index.tsx` — hooken
   lytter på ekte `TouchEvent`, og er uansett avslått i vanlig
   nettleser-visning. Krever simulator, ikke bare touch-emulering.
4. Søkepanelets lagre-flyt ("Mine søk") — **verifisert, fungerer.** Lagre
   søk fra `/annonser`-filterraden, "Mine søk"-siden viser det lagrede
   søket, "Kjør søk" navigerer tilbake med filtrene gjenopprettet,
   "Flere valg"-menyen (Rediger filtre / Endre navn / Slett søk) åpner og
   sletting med bekreftelsesdialog fungerer. Testsøket ble ryddet opp
   (slettet) etter verifisering.
5. Nettbrettets meldingsoppsett — **delvis verifisert.** Tomtilstanden
   (`Ingen samtaler enda`) rendrer korrekt på 768px nettbrett-viewport, ingen
   layoutfeil. Selve det tablet-spesifikke to-kolonne-oppsettet
   (samtaleliste + tråd side om side, nevnt i D: "aktiv samtale markeres
   ikke") er **ikke verifisert** — testkontoen har ingen samtaler, og å lage
   en ekte samtale ville krevd å sende en testmelding til en reell selger,
   som ikke er greit å gjøre for verifiseringsformål. Krever enten en andre
   testbruker å konversere med, eller manuell sjekk av noen med en ekte
   samtale.

**E, punkt 2 — gjort:** Håndrullet `pb-8` i `messages-button.tsx`,
`notifications-bell.tsx` og `meg.tsx` erstattet med `pb-safe`. `.pb-safe`
er definert utenfor Tailwinds `@layer`-blokk (se kommentar i
[styles.css:170](../src/styles.css)), så den vinner alltid over `p-0`
uansett rekkefølge i `className` — ingen `twMerge`-konflikt å bekymre seg
for. Typecheck rent, 244/244 tester grønne. **Ikke visuelt verifisert** —
alle tre er `if (native)`-gatede `NativeSheet`-instanser, samme begrensning
som `app-landing.tsx` i fase 1; krever simulator (fase 4).

Output: enten bekreftet fungerende, eller konkrete bugs funnet og fikset —
først da kan punktene streykes fra "aldri sett kjøre".

### Fase 4 — Simulator-/enhetsverifisering (B)

Kjør i prioritert rekkefølge fra seksjon B over, på ekte iOS-simulator og
Android-emulator (ikke kun browser-preview — dette er nettopp det som
mangler). For hvert punkt: reproduser, fiks om nødvendig, verifiser på nytt.

1. Splash ved kaldstart, inkl. offline.
2. Rotasjonslås + pinch/sveip i bildevisning.
3. iOS-kantsveip mot Embla-karuseller / zoomet panorering.
4. Dynamic Type (iOS) og Android-skalering.
5. Android nettbrett + `useFormFactor()` live ved rotasjon/Split View.
6. Safe area / tap-highlight-polish.

### Fase 5 — Enkeltstående tiltak (E, resten av D, F)

Uavhengige av alt over, kan interleaves eller taes i restetid:

1. **E1 — onboarding-tilbakeknapp**: naviger tilbake i onboarding-kortene i
   stedet for å avslutte appen. Isolert komponent, ingen avhengighet til
   resten av planen — kan tas først om noen vil ha en rask, trygg leveranse.
2. **D — teknisk gjeld**, i denne rekkefølgen:
   - Native e2e for søkepanelet (skriv testen nå som `vaul`-animasjonene kan
     håndteres — sjekk om verifiseringsverktøyet er oppdatert siden sist,
     ellers finn en annen observérbar tilstand enn animasjonen selv, f.eks.
     DOM-attributt).
   - Live resultattelling i søkepanelet ved filterjustering.
   - Marker aktiv samtale i nettbrettets meldingsliste.
   - Rydd `useSheetDrag` vs. `vaul`-duplikasjonen (~45 linjer, reversibelt —
     lavest prioritet i denne fasen siden den ikke har brukerkonsekvens).
3. **F — anbefalte men aldri planlagte tiltak**:
   - Aktiver `jsx-a11y` `recommended` gradvis som `"warn"`, tell brudd per
     regel, ta én regel om gangen som egen liten PR.
   - Re-prompt-strategi for push-varsler.
   - Frakoblet-indikator i meldingstråden ved tapt Realtime.
4. **Bundlet web-bygg** (nevnt i D) er bevisst utelatt fra denne planen — det
   krever en egen ADR før noe kodearbeid starter, ikke en implementeringsfase
   her.

### Ikke i denne planen

`advanced-search-sheet.tsx` som `NativeSheet`-kandidat, og omskriving av
annonseveiviseren/meldingskjernen/`ResponsiveOverlay` — se "Ikke anbefalt"
over.
