# Søk-UX: analyse, tiltaksplan og implementasjonsplan

Status: Fase 1–4 gjennomført og committet. Se seksjon 7 for oppsummering,
nye funn underveis og anbefalt neste steg (inkl. simulator-verifisering,
som ikke er gjort ennå).
Sist oppdatert: 2026-08-07.

## 1. Bakgrunn

Native-appen (Capacitor-wrapper rundt samme TanStack Start-app som web)
oppleves å henge etter web på søk-UX. Dette dokumentet er en full analyse av
søkeflyten — forside, `/annonser`, avansert søk/flere filtre, lagrede søk —
og en konkret plan for å lukke gapet.

Arkitektonisk kontekst: det finnes ingen egen native-kodebase. Samme
TanStack-ruter rendrer betinget forskjellige undertrær via `useIsNative()`
(`src/hooks/use-is-native.ts`), og `capacitor.config.ts` peker appen mot den
_live_ `kaupet.no`-siden i en WebView (`server.url`), ikke en bundlet build.
"Skriv native-kode" betyr i praksis: flere `isNative`-grenede
komponenter i samme repo, ikke en ny plattform å vedlikeholde separat.

## 2. Analyse per overflate

### 2.1 Forside (`src/routes/index.tsx`)

Ett søkefelt (`Hva leter du etter?`) + kategori-rutenett, likt på web og
native. Skriving trigger live kategoriforslag via
`use-search-synonym-matches` ("Begrens søket til …"). `useIsNative()` brukes
kun for kompakt hero-padding. **Ingen native-svakhet funnet her** — samme
mentale modell, samme kvalitet på begge plattformer.

### 2.2 `/annonser` (`src/routes/annonser.tsx`, `annonser_.filter.tsx`)

Web og native har **allerede** separate, gjennomtenkte implementasjoner:

| Overflate    | Web                                  | Native                                                                                                   |
| ------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Søkefelt     | Inline `SearchBar`                   | `NativeSearchOverlay` — fullskjerm, søkehistorikk (`localStorage`), kategoriforslag, haptikk, fokus-trap |
| Kvikkfiltre  | `AttributeFilterChips` (kort-layout) | `NativeFilterChips` — chips som åpner bunn-sheets (pris/tilstand/sted), haptikk                          |
| Flere filter | Egen route via `moreFilterHref`      | `NativeAdvancedSearch` — fullskjerm-overlay på stedet                                                    |

Native-komponentene har fokus-trap, `pt-safe`/`pb-safe`, haptisk feedback og
bruker samme datalag som web (`resolve-text-to-filters.ts`,
`category-filters.ts`). Dette er **ikke** der gapet brukeren merker
sannsynligvis ligger — kvaliteten her er høy og til dels mer moderne enn web
(overlay på stedet vs. web sin separate side).

### 2.3 Avansert søk (`native-advanced-search.tsx` vs. `advanced-search-sheet.tsx`)

To separate implementasjoner av samme konsept, som deler datamodell
(`AdvancedSearchValue`, `term-groups.ts`) men ikke UI-tre:

- Web: `advanced-search-sheet.tsx` — side-skuff (`SheetContent side="right"`,
  skrivebordsmønster: skyves inn fra høyre, `sm:max-w-md`).
- Native: `native-advanced-search.tsx` — fullskjerm-overlay
  (`createPortal`, `slide-in-from-bottom`, haptikk, egen tilbake-knapp).

Begge er velbygde for sin kontekst. Vedlikeholdsrisiko: en endring i
filterlogikk må gjøres to steder (term-grupper, kategori-velger,
pris/tilstand-felter er separat kodet i begge).

### 2.4 Lagrede søk / "Mine søk" (`src/routes/_authenticated/mine-sok.tsx`) — **hovedgapet**

Dette er den eneste søk-relaterte siden uten reell native-tilpasning:

- **Ingen native-layout.** `useIsNative()` brukes kun til å skjule sidetittel
  (fordi `NativePageHeader` allerede viser den). Resten — listerader,
  knapperad, meny — er identisk med web.
- **Musorienterte mønstre på touch-flate:** `DropdownMenu` med lite
  3-punkts-ikon for «Rediger filtre / Endre navn / Slett» (linje 263–288).
  Lite trykkmål, ekstra steg for vanlige handlinger, ingen swipe-to-delete
  eller bunn-sheet slik resten av native-flyten bruker.
- **Redigering åpner web-komponenten, ikke den native:** linje 339 bruker
  `AdvancedSearchSheet` — en side-skuff som skyves inn fra **høyre**
  (`SheetContent side="right"`, bekreftet i koden), et rendyrket
  skrivebordsmønster — i stedet for `NativeAdvancedSearch` (fullskjerm,
  bunn-inn). Midt i en ellers native-tilpasset søkeflyt hopper brukeren
  plutselig inn i en desktop-skuff-animasjon. Dette er trolig den mest
  synlige enkeltårsaken til at native føles "bak" web.
- Tett knapperad (`Kjør søk`, varsel-bjelle, 3-punkts-meny) side ved side er
  ikke tommel-optimalisert.

### 2.5 Sekundære observasjoner

- Ingen native e2e-dekning for søk/avansert søk/lagrede søk
  (`e2e/browse-search.spec.ts` dekker kun web happy-path). Regresjoner i
  native-flyten fanges ikke automatisk.
- Web sitt "flere filter" som egen route (i stedet for overlay) er isolert
  sett svakere enn native sitt mønster — ikke et argument for å gjøre native
  mer web-likt.

## 3. Tiltaksplan (prioritert)

| #   | Tiltak                                                                                                                                                                                                                                                                                     | Omfang  | Prioritet | Hvorfor                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------- | ------------------------------------------------------------------- |
| 1   | Bytt `AdvancedSearchSheet` → `NativeAdvancedSearch` i redigeringsflyten i `mine-sok.tsx` (linje 339), betinget på `useIsNative()`                                                                                                                                                          | Liten   | Høy       | Fjerner den mest synlige plattform-inkonsistensen                   |
| 2   | Native-tilpasset listerad i `mine-sok.tsx`: swipe-to-delete for "Slett" (ny liten komponent), synlige knapper for "Rediger filtre"/"Endre navn" i stedet for `DropdownMenu`                                                                                                                | Middels | Høy       | Touch-ergonomi, konsistens med resten av native-flyten              |
| 3   | Vurder plassering av `PushEnablePrompt`/varsel-toggling for native (systemvarsel-tillatelse er en native-spesifikk brukerreise)                                                                                                                                                            | Liten   | Middels   | Native har en ekstra permission-dimensjon web ikke har              |
| 4   | Minimal native test-/manuell dekning for lagrede søk (opprett, rediger, varsle, slett)                                                                                                                                                                                                     | Liten   | Middels   | Eneste søkeflyt uten noen automatisert sjekk i dag                  |
| 5   | (Valgfritt, lavere prioritet) Vurder om `advanced-search-sheet.tsx` og `native-advanced-search.tsx` sin felteditering (term-grupper, pris, tilstand) kan dele mer presentasjonslogikk for å redusere dobbelt vedlikehold — kun hvis de to filene begynner å drifte fra hverandre i praksis | Stor    | Lav       | Ikke et akutt UX-problem i dag, kun en fremtidig vedlikeholdsrisiko |

**Ikke anbefalt:** full rewrite av native-søk, eller full konsolidering til
delt UI. Mønsteret appen har (delt datalag, plattform-spesifikk presentasjon
der interaksjonsmodellen faktisk skiller seg) er riktig for `/annonser` og
avansert søk-overlayen. Problemet er at `mine-sok.tsx` aldri fikk samme
behandling — det er fullføring av et etablert mønster, ikke en ny strategi.

## 4. Implementasjonsplan

### Fase 1 — Rediger-flyt for lagret søk (tiltak 1)

**Fil:** `src/routes/_authenticated/mine-sok.tsx`

- Importer `NativeAdvancedSearch` fra `@/components/native-advanced-search`.
- Rundt linje 338–359: grener på `native` (variabelen finnes allerede,
  `const native = useIsNative()`) og render `NativeAdvancedSearch` i stedet
  for `AdvancedSearchSheet` når `native === true`.
- `NativeAdvancedSearch` sin `onApply`-signatur tar `AdvancedSearchValue`
  direkte (se `native-advanced-search.tsx` linje 46) — samme som
  `AdvancedSearchSheet`s `onApply`, så `updateSavedSearch`-kallet i
  `onApply`-callbacken kan gjenbrukes uendret.
- `NativeAdvancedSearch` har ikke `applyLabel`/`hideSaveAction`-props som
  `AdvancedSearchSheet` bruker for å tilpasse knappetekst i
  redigeringskontekst (se linje 345–346 i dagens kode: `applyLabel="Lagre
endringer"`, `hideSaveAction`). Sjekk om disse trengs i native-varianten
  eller om "Bruk søk" + synlig "Lagre"-knapp er akseptabelt i
  redigeringskontekst — juster `NativeAdvancedSearch` med tilsvarende
  valgfrie props hvis ikke.

### Fase 2 — Listerad-interaksjon (tiltak 2): swipe-to-delete

**Fil:** `src/routes/_authenticated/mine-sok.tsx` (+ ev. ny liten komponent)

Avklart: kategori-velgerens "swipe" (`CategoryChipRow` / `ScrollArrowRow`,
brukt på `/annonser`) er ikke gjenbrukbar — det er en horisontal
_scroll_-rad (native `overflow-x-auto`-panning + piltaster for mus), ikke en
swipe-to-reveal-komponent, og det finnes ingen eksisterende
swipe-to-delete-primitiv i appen eller blant installerte avhengigheter
(`@dnd-kit/*` er drag-to-reorder, ikke swipe-reveal; `embla-carousel-*` er
en karusell). Beslutning: bygg dette som en liten, dedikert komponent —
ikke trekk inn et nytt bibliotek for én liste.

**Design (iOS Mail-mønster: dra rad til venstre, avslør "Slett"):**

- Ny liten komponent, f.eks. `src/components/swipe-to-delete-row.tsx`:
  wrapper rundt hver listerad som følger samme pointer-event-mønster
  `ScrollArrowRow` allerede bruker for dra-med-mus (`onPointerDown/Move/Up`,
  terskel før den "griper" bevegelsen — se `dragMoved`-logikken i
  `src/components/scroll-arrow-row.tsx` linje 62–91 som direkte forbilde for
  hvordan man unngår at et vanlig trykk blir tolket som drag).
  - Horisontal drag av selve rad-innholdet (`translateX`), begrenset til
    venstre (positiv drag mot høyre snapper tilbake til 0).
  - Ved slipp: snapper til åpen (avslører en fast bredde, f.eks. 88px, med
    rød "Slett"-knapp) hvis draget passerte en terskel (f.eks. 40 % av
    avsløringsbredden), ellers snapper tilbake til lukket.
  - Trykk på "Slett"-knappen i den avslørte sonen kaller `setDeleteId(s.id)`
    — samme `AlertDialog`-bekreftelse som i dag (linje 298–311), swipe
    _åpner_ handlingen, det skal ikke slette direkte uten bekreftelse siden
    dette er en irreversibel handling (varslene knyttet til søket slettes
    også).
  - Kun aktiv på native (`useIsNative()`) — desktop beholder eksisterende
    knapperad/`DropdownMenu`.
- "Rediger filtre" og "Endre navn" beholdes som synlige knapper i selve
  raden (ikke bak swipe) — swipe er kun for slett, i tråd med det vanligste
  mønsteret (destruktiv handling bak swipe, ikke-destruktive handlinger
  forblir ett trykk unna). Dette forenkler også `DropdownMenu`-fjerningen:
  den kan byttes ut med to synlige, større ikon-knapper (rediger, endre navn)
  - swipe for slett, i stedet for en bunn-sheet.
- Haptikk: `hapticImpact("light")` når draget passerer terskelen (samme
  bruk som ellers i native-UI-et), `hapticImpact("medium")` ved bekreftet
  slett.

### Fase 3 — Varsel-plassering (tiltak 3)

**Filer:** `src/routes/_authenticated/mine-sok.tsx`,
`src/components/push-enable-prompt.tsx`, `src/hooks/use-push-status.ts`

- Kartlegg dagens flyt: `toggleNotify` (linje 108–122) viser i dag ulike
  `toast.message`-varianter avhengig av `push.supported` /
  `push.permission` / `push.savedSearchesActive`. Vurder om disse bør
  erstattes med en direkte native permission-prompt (system-dialog) i stedet
  for en toast som ber brukeren finne knappen selv.
- Lavt omfang — kan gjøres som en liten oppfølging etter fase 1–2, ikke en
  blokkerende avhengighet.

### Fase 4 — Testdekning (tiltak 4)

- Vurder om et Playwright-native-spor er realistisk (appen kjører som
  WebView mot live site — samme browser-context-teknikk som
  `e2e/browse-search.spec.ts` kan trolig gjenbrukes med en
  native-viewport/`useIsNative`-emulering), eller om manuell sjekkliste i
  iOS-simulator er tilstrekkelig for dette omfanget.
- Minimum: én manuell verifiseringsrunde i simulator etter fase 1–2 (se
  seksjon 5) før merge.

## 5. Verifisering

- Kjør appen i iOS-simulator
  (`mcp__Claude_Code_iOS_Simulator__control`, evt. Capacitor-bygg) og test
  full flyt: forside → søk → `/annonser` → kvikkfiltre → "Mer" → avansert
  søk → lagre søk → "Mine søk" → rediger filtre → varsle → slett.
- Bekreft at "Rediger filtre" i "Mine søk" nå åpner samme fullskjerm-mønster
  som `/annonser` sin "Mer"-knapp (ikke lenger en side-skuff).
- Sammenlign visuelt mot web (desktop nettleser) for samme flyt.
- `bun run test:e2e` for å sikre web-happy-path fortsatt består.
- `bunx tsc --noEmit` etter kodeendringer (kjøres uansett som pre-push-hook).

## 6. Åpne spørsmål før oppstart

- Er native permission-prompt for push (fase 3) i scope nå, eller egen sak?
  → Besvart i fase 3 (se seksjon 7): oppgaven viste seg å være noe annet enn
  antatt — ikke en plasseringsvurdering, men en reell manglende gren.

## 7. Oppsummering etter gjennomføring (2026-08-07)

Alle fire faser er implementert og committet på `staging`, én commit per
fase:

1. `fiks: bruk NativeAdvancedSearch ved redigering av lagret søk på native`
2. `legg til swipe-to-delete for lagrede søk på native`
3. `fiks: usePushStatus manglet native FCM-gren — push var alltid "ikke støttet" i appen`
4. `legg til testdekning for SwipeToDeleteRow`

### Hva som faktisk ble gjort

- **Fase 1:** `NativeAdvancedSearch` fikk `applyLabel`/`hideSaveAction`-props
  (speiler `AdvancedSearchSheet`s kontrakt). `mine-sok.tsx` grener nå på
  `native` og bruker native-overlayen i redigeringsflyten, med en delt
  `applyEditedSearch`-funksjon for begge grenene.
- **Fase 2:** Ny komponent `src/components/swipe-to-delete-row.tsx` —
  pointer-basert, ingen ny avhengighet, mønsteret bekreftet i seksjon 2.5/3.
  `DropdownMenu` er fjernet på native til fordel for synlige knapper
  (rediger/endre navn) + swipe for slett. Sletting går fortsatt via
  eksisterende `AlertDialog`-bekreftelse.
- **Fase 3 — endret scope, se "Nytt funn" under.**
- **Fase 4:** e2e var ikke kjørbart i dette miljøet (se under). Erstattet
  med en komponenttest for `SwipeToDeleteRow` (terskel/snap/klikk-svelging).

### Nytt funn: fase 3 var et reelt korrekthetsbug, ikke en plasseringsvurdering

Den opprinnelige planen for fase 3 antok at oppgaven var å _vurdere
plassering_ av push-varsel-UI for native. Under kartlegging viste det seg å
være noe annet: `usePushStatus` (`src/hooks/use-push-status.ts`) — hooket
delt av `PushEnablePrompt` og "Mine søk" sin varsel-toggle — sjekket **kun**
Web Push-API-et (`serviceWorker`/`PushManager`), som ikke er tilgjengelig i
Capacitor-WebViewen. Appen har en fullt fungerende, separat native
FCM-push-implementasjon (`src/lib/native-push.ts`, med `subscribeNative`,
`getNativePermissionState`, osv.), og profilsidens `NotificationsSection`
bruker allerede riktig gren mot den — men det mønsteret var aldri kopiert
inn i det delte `usePushStatus`-hooket.

Konsekvens før fiksen: "varsle meg"-toggelen på et lagret søk viste alltid
"push støttes ikke i denne nettleseren" på native, uansett faktisk
permission-status — en reell, brukervendt funksjonsfeil, ikke bare en
tekst-/plasseringssak. Fikset ved å speile samme `isNativeApp`-gren i
`usePushStatus`, og oppdatere tekstene i `mine-sok.tsx`/`push-enable-prompt.tsx`
som antok nettleser-kontekst ("i denne nettleseren" → enhetsriktig tekst).

### Nytt funn: e2e-dekning krever infrastruktur som ikke er tilgjengelig her

`e2e/global-setup.ts` krever `SUPABASE_URL` og `SUPABASE_SERVICE_ROLE_KEY`
for å opprette en bekreftet testbruker — ikke satt i dette miljøet, så
ingen e2e-test (verken eksisterende eller ny) kunne kjøres eller
verifiseres her. I tillegg finnes det ennå ikke noe etablert mønster i
`e2e/`-oppsettet for å emulere native (`useIsNative()` styres av
`Capacitor.isNativePlatform()`, som i praksis sjekker
`window.androidBridge` / `window.webkit.messageHandlers.bridge` — trolig
mulig å spoofe via `page.addInitScript`, men ikke prøvd/verifisert her).

Fase 4 ble derfor levert som en komponenttest i stedet for e2e — se
`src/components/swipe-to-delete-row.test.tsx`. Verdt å nevne: testen fanget
en reell feil under utvikling (en for vid `act()`-wrapping rundt
pointer-hendelsene skjulte at draget aldri ble registrert), noe som styrker
at denne typen fokusert test er nyttig uavhengig av e2e-spørsmålet.

### Anbefalt neste steg

1. **Simulator-verifisering (ikke gjort ennå).** Kjør hele flyten i
   iOS-simulator per seksjon 5 — forside → søk → `/annonser` → kvikkfiltre →
   "Mer" → avansert søk → lagre søk → "Mine søk" → rediger filtre → swipe
   for å slette → varsle. Dette er det eneste gjenstående
   verifiseringssteget fra planen som ikke er utført, siden ingen av
   endringene var observerbare i nettleser-forhåndsvisning (native-grenen
   krever ekte Capacitor-runtime).
2. **Push-varsling: verifiser native-grenen i praksis.** Fase 3-fiksen er
   typecheck/lint-grønn, men uverifisert mot en ekte enhet — bekreft i
   simulator at "Slå på varsler" på et lagret søk faktisk trigger
   FCM-registrering (`subscribeNative`) og at status reflekteres riktig
   etter appstart (`autoRestoreNativePush` i `__root.tsx`).
3. **Native e2e-emulering, hvis native-regresjoner blir et tilbakevendende
   problem.** Undersøk `page.addInitScript` for å spoofe
   `window.androidBridge` før navigasjon, som et eget, avgrenset stykke
   arbeid — ikke gjort her fordi det uansett ikke kunne verifiseres uten
   Supabase-tilgang.
4. **Tiltak 5 fra tiltaksplanen (lav prioritet, ikke startet):** vurder
   delt presentasjonslogikk mellom `advanced-search-sheet.tsx` og
   `native-advanced-search.tsx` kun hvis de to faktisk begynner å drifte
   fra hverandre i praksis — ingen indikasjon på at dette haster ennå.
