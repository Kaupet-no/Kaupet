# Native-app: UI/UX-revisjon for mobil og nettbrett

Status: **Alle faser (0–11) implementert** 2026-08-10. Analyse gjennomført
2026-08-10. Alle fire åpne spørsmål er besvart 2026-08-10 (se seksjon 8) og
innarbeidet i tiltaksliste og faser. Neste steg: **simulator-/enhetsrunde** —
ingen ny kodefase gjenstår i planen.
Avhengigheten fase 6 → fase 8 er **bortfalt** — sidenivå-zoom var allerede av
på native før fase 6, se funn 10.10. Fase 2, 3, 5, 6, 7, 8, 9, 10 og 11 er
ikke endelig ferdige før de er reverifisert i simulator (safe-area-verdier med
notch, iOS-kantsveip, Android-tilbakeknapp, rotasjonslås, pinch/sveip på ekte
touch, dra-for-å-lukke på ekte touch, Dynamic Type, detent-draging i
søkepanelet, iPad-rotasjon/Split View, Android nettbrett, splash-timing) —
se seksjon 7.

Åpne tiltak som **ikke** er levert: 23 (bundlet web-bygg — egen ADR, se fase
11), 29 (tilbake under onboarding) og 30 (`pb-8` i tre bunn-sheets).

**Sluttvurdering gjennomført 2026-08-10 — se seksjon 11.** Konklusjon: alle
faser er levert i tråd med planen, og alle avvik er dokumenterte og begrunnede.
Restansene er samlet i 11.2.

Sist oppdatert: 2026-08-10.

**Dette dokumentet er levende.** Det er både funnrapport og statusdokument
for implementeringsarbeidet. Etter hver fase fylles seksjon 9
(«Fremdriftslogg») ut med hva som faktisk ble gjort, hva som ble pensjonert,
og hva som ble utelatt bevisst. Nye funn som dukker opp underveis skrives inn
i seksjon 10 («Funn oppdaget underveis») og prioriteres inn i tiltakslisten —
de skal ikke bare nevnes i en commit-melding. Statuslinjen over oppdateres
til å peke på neste fase. Samme mønster som
[`SOK-UX-PLAN.md`](./SOK-UX-PLAN.md) og [`UX-AUDIT-PLAN.md`](./UX-AUDIT-PLAN.md).

---

## 1. Omfang, metode og forhold til tidligere revisjoner

### 1.1 Hva denne revisjonen dekker

Kaupets native-app slik den oppleves på **telefon og nettbrett** (iOS og
Android): plattformtilpasning, navigasjonsmodell, trykkflater, safe areas,
orientering, gester, skjemaer, bildevisning og oppstart. Fokus er
**appflaten**, ikke forretningslogikken bak.

Dette er _ikke_ en ny gjennomgang av flytene som allerede er revidert:

- [`SOK-UX-PLAN.md`](./SOK-UX-PLAN.md) (søk, avansert søk, lagrede søk —
  analysert 2026-08-05, fire faser implementert).
- [`UX-AUDIT-PLAN.md`](./UX-AUDIT-PLAN.md) (kjerneflyter sett fra sluttbruker
  — åtte faser implementert 2026-08-09).

Funn som allerede er lukket der er ikke gjentatt. Der denne revisjonen
finner at et tidligere tiltak **traff for smalt**, står det eksplisitt
(f.eks. touch-target-hevingen i `UX-AUDIT-PLAN.md` fase 2, som løftet
`button-variants.ts` men ikke de tre andre stedene appen definerer sine egne
størrelser — se funn 3.1.1).

**Nytt i denne revisjonen:** nettbrett er behandlet som et førsteklasses
format for første gang. Ingen tidligere plan har vurdert appen over 430px
bredde i native-modus.

### 1.2 Metode — og hvordan native-grenene faktisk ble verifisert

Tidligere planer har konsekvent måttet notere at «`useIsNative()`-grener ikke
er observerbare i nettleser-forhåndsvisning». Denne revisjonen omgikk det med
en **midlertidig, lokal patch** i `isNative()` som lot en `?forcenative`-
søkeparameter slå på native-grenen i dev. Patchen ble reversert etter
måling (arbeidstreet er rent), men muligheten viste seg så nyttig at den er
foreslått gjort permanent og dev-gatet som **fase 0** — den er
forutsetningen for at resten av planen kan verifiseres i det hele tatt.

Med den på plass ble følgende faktisk **målt live** i nettleser mot lokal
dev-server, i native-modus:

| Viewport    | Simulerer                     |
| ----------- | ----------------------------- |
| 375 × 812   | iPhone (portrett), lys + mørk |
| 844 × 390   | iPhone (landskap)             |
| 820 × 1180  | iPad 11" (portrett)           |
| 1024 × 1366 | iPad Pro 12,9" (portrett)     |

I tillegg: kildegjennomgang av `capacitor.config.ts`, `ios/App/`,
`android/app/src/main/`, hele `src/components/ui/`, alle
`useIsNative()`-grener, og `src/styles.css`.

**Målinger merket «målt» under er hentet med `getBoundingClientRect()` i
levende DOM**, ikke anslått fra klassenavn.

### 1.3 Kjente begrensninger i verifiseringen

- **Innloggede flater er kun kodegjennomgått** (meldinger, «Mine annonser»,
  annonseveiviseren, «Meg»). Å opprette en testbruker ville truffet et delt
  Supabase-prosjekt, og ble ikke gjort. Funn om disse flatene er derfor
  kodenivå, ikke observert.
- **Ingen simulator-/enhetsverifisering.** Alt som avhenger av ekte
  WKWebView/Android WebView-oppførsel (tastatur, haptikk, statuslinje,
  faktiske safe-area-verdier, gester) er utledet fra kode og
  plattformdokumentasjon.
- **iPad-multitasking (Split View / Slide Over ned til 320pt bredde) er ikke
  testet**, kun konstatert som aktivert (se 2.2).

---

## 2. Plattformgrunnlaget

### 2.1 Appen er en fjernlastet webapp i en WebView

`capacitor.config.ts` peker `server.url` på `https://kaupet.no`.
`capacitor-shell/` inneholder kun en tom `index.html` og en `offline.html`.
Konsekvenser som preger hele UX-en:

- **Kaldstart er nettverksbundet.** Splash vises fast i 2000 ms
  (`launchShowDuration: 2000`), deretter `native-boot`-overlayet, deretter må
  hele SPA-en lastes ned fra kaupet.no før noe kan males. Det finnes ingen
  bundlet applikasjonskode å falle tilbake på.
- **Ingen frakoblet bruk overhodet.** `offline.html` dekker kun
  «kunne ikke nå kaupet.no ved oppstart». Mister brukeren dekning midt i en
  økt får de en toast (`native-offline.ts`) og en app som ikke kan navigere.
- Til gjengjeld: deploy treffer appen umiddelbart, uten app-store-runde.
  Det er en reell fordel og grunnen arkitekturen ble valgt — den utfordres
  ikke her, men konsekvensene bør være et bevisst valg (se fase 9).

### 2.2 Enheter og orientering — hva appen faktisk lover i dag

| Innstilling                             | Verdi                              | Konsekvens                                                                                         |
| --------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `TARGETED_DEVICE_FAMILY`                | `1,2`                              | Appen er en **ekte iPad-app**, ikke en iPhone-app i skaleringsmodus                                |
| `UISupportedInterfaceOrientations`      | Portrait + LandscapeLeft/Right     | iPhone kan roteres til landskap                                                                    |
| `UISupportedInterfaceOrientations~ipad` | Alle fire                          | iPad kan roteres fritt                                                                             |
| `UIRequiresFullScreen`                  | _ikke satt_                        | **iPad Split View / Slide Over er aktivert** — appen kan kjøre i vinduer helt ned til 320pt bredde |
| `android:configChanges`                 | inkl. `screenSize`, `screenLayout` | Android split-screen/free-form uten restart                                                        |
| `UIRequiredDeviceCapabilities`          | `armv7`                            | Utdatert (32-bit) verdi mot et iOS 15-deployment target — bør ryddes                               |

**Kjernen i tablet-problemet:** appen _lover_ full iPad-støtte i alle fire
orienteringer, inkludert multitasking, men **ingenting i `src/` skiller
mellom telefon og nettbrett**. `useIsNative()` returnerer én boolsk verdi.
Der en flate har web-breakpoints (`md:`, `lg:`) arver nettbrettet
_desktop_-oppsettet; der en flate er native-only arver den _telefon_-
oppsettet. Ingen av delene er designet for nettbrett, og de to blandes på
samme skjerm.

---

## 3. Funn

Rekkefølgen er etter giring: delte primitiver først (én fiks treffer hele
appen), deretter navigasjon, deretter formatspesifikke funn.

### 3.1 Delte primitiver — høyest giring

#### 3.1.1 Lukkeknappen i alle dialoger og sheets er 16 × 16 px (målt)

`src/components/ui/dialog.tsx:47-50` og `src/components/ui/sheet.tsx:64-67`
rendrer begge `<X className="h-4 w-4">` i en `absolute right-4 top-4`-knapp
**uten padding**. Målt i levende DOM på en åpen native-sheet: `16 × 16 px`.

Dette er appens mest brukte lukkeaffordanse — den sitter på hver eneste
`ResponsiveOverlay`, altså alt brukervendt overlay-UI etter
`UX-AUDIT-PLAN.md` fase 2. Den er **under en fjerdedel av arealet**
`UI-GUIDE.md` selv krever («touch-targets skal være minst 44×44px»), og
ligger dessuten i hjørnet der treffsikkerheten er dårligst.

`UX-AUDIT-PLAN.md` fase 2 hevet `button-variants.ts` til `h-11`, men disse
to knappene bruker ikke `Button` — de gikk derfor uendret gjennom den
runden.

#### 3.1.2 Tre andre steder definerer egne, for små størrelser

Samme mønster som 3.1.1 — komponenter som ikke går via `button-variants.ts`:

| Sted                                  | Størrelse i dag | Merknad                                        |
| ------------------------------------- | --------------- | ---------------------------------------------- |
| `favorite-button.tsx:13` (`sm`)       | `size-8` = 32px | På **hvert eneste annonsekort**                |
| `ui/input.tsx:11`, `ui/select.tsx:27` | `h-9` = 36px    | Alle skjemafelt i appen, inkl. hele veiviseren |
| `native-search-overlay.tsx:227-233`   | 40px (målt)     | Native-only flate, altså aldri sett på web     |

Resultatet er at knapper nå er 44px mens feltene ved siden av dem er 36px —
inkonsistensen ble innført av den forrige fiksen, ikke løst av den.

`ui/input.tsx` og `ui/textarea.tsx` har i tillegg `text-base md:text-sm`:
på **nettbrett (≥768px) faller skriftstørrelsen i inndatafelt til 14px**,
som både er unødvendig smått for touch og er under iOS-grensen på 16px der
WKWebView auto-zoomer ved fokus.

#### 3.1.3 Safe area er en egenskap ved kallstedet, ikke ved primitiven

`FullscreenOverlayContent` (`ui/fullscreen-overlay.tsx:22`) er
`fixed inset-0` **uten noe safe-area-padding i det hele tatt**. Hver
konsument må huske det selv. Telling av de åtte konsumentene:

| Konsument                          | Safe area håndtert?     |
| ---------------------------------- | ----------------------- |
| `fullscreen-location-picker.tsx`   | ✅ (eksplisitt `env()`) |
| `native-search-overlay.tsx`        | ✅ (`pt-safe`)          |
| `native-advanced-search.tsx`       | ✅ (`pt-safe`)          |
| `image-lightbox.tsx`               | ❌                      |
| `map-overlay.tsx`                  | ❌                      |
| `onboarding-flow.tsx`              | ❌                      |
| `preview-draft-view.tsx`           | ❌                      |
| `vehicle-360-capture-launcher.tsx` | ❌                      |

**5 av 8 mangler den.** Konkret betyr det at lukkeknappen i bildegalleriet,
kartoverlayet og 360°-opptaket ligger delvis under statuslinjen/dynamic
island på iPhone.

Samme problem i `ui/sheet.tsx`: `side="bottom"` er `inset-x-0 bottom-0 p-6`
uten `pb-safe` — nederste innholdsrad i **hver eneste native bunn-sheet**
havner i home indicator-sonen.

Dette er ikke åtte separate feil, det er én manglende egenskap ved to
primitiver.

#### 3.1.4 `--safe-left` / `--safe-right` er definert, men brukes null steder

`styles.css:132-133` definerer begge. `grep` over hele `src/` finner ingen
konsument. Det finnes heller ingen `pl-safe`/`pr-safe`-utility tilsvarende
`pt-safe`/`pb-safe`.

Siden landskap **er** aktivert (2.2), betyr det at all fast/klebrig chrome —
`NativePageHeader`, `AppBottomNav`, veiviserens bunnlinje, annonsedetaljens
klebrige CTA — kan havne under notch/dynamic island når en iPhone roteres.

#### 3.1.5 Bunn-sheeten er fortsatt ikke en bunn-sheet

`UX-AUDIT-PLAN.md` fase 2 fjernet `vaul` som ubrukt avhengighet. Etter det
er `Sheet` en CSS-animert slide-in på Radix Dialog: **ingen draghåndtak,
ingen dra-for-å-lukke, ingen velocity-snap**. Kombinert med 3.1.1 er den
eneste måten å lukke en native sheet på et 16px-mål i hjørnet, eller et
trykk på bakteppet. Det er den mest merkbare «dette er en nettside»-
detaljen som er igjen i appen.

### 3.2 Navigasjon og informasjonsarkitektur

#### 3.2.1 iOS har ingen sveip-tilbake

`allowsBackForwardNavigationGestures` forekommer verken i `ios/App/` eller i
Capacitor-poden — den er `false` som standard. iOS-brukere har altså **ingen
kantsveip tilbake** noe sted i appen; de er avhengige av «Tilbake»-knappen i
`NativePageHeader`. Det er den mest innarbeidede navigasjonsgesten på iOS, og
fraværet gjør at appen konsekvent føles som en webview.

Tekniske forbehold som må vurderes ved implementering: gesten kan konkurrere
med horisontale karuseller (Embla i `image-gallery.tsx`/`image-lightbox.tsx`)
og med kategori-chip-radene som starter helt i venstre kant.

#### 3.2.2 Android-tilbakeknappen kjenner ikke til åpne overlays

`native-offline.ts:46-56` kobler `backButton` til `window.history.back()`
(eller `App.exitApp()`). Radix-overlays registrerer **ingen historikk-
oppføring**, så et tilbake-trykk mens en sheet, dialog eller
fullskjermtakeover er åpen **navigerer siden bak overlayet** i stedet for å
lukke overlayet — eller, i onboarding-flyten (som eksplisitt blokkerer
Escape og klikk utenfor), avslutter appen.

**Mønsteret finnes allerede i kodebasen.** `image-lightbox.tsx:43-56` gjør
nøyaktig det riktige: `history.pushState` ved åpning, `popstate` → lukk,
`history.back()` fra lukkeknappen. Det er ett sted som gjør det riktig og
sju som ikke gjør det. Løsningen er å heve dette til primitivene, ikke å
kopiere det åtte ganger.

#### 3.2.3 Bunnavigasjonen har ingen inngang til søk

> **Besluttet 2026-08-10 (se 8.3):** løses ved at fane 1 blir «Søk» i stedet
> for «Hjem», kombinert med et nytt søkepanel — ikke ved en sjette fane eller
> en kontekstavhengig midtknapp. Fase 9.

Fanene er: Hjem · Varsler · **Ny annonse (FAB)** · Meldinger · Meg.

For en markedsplass er søk/bla hovedhandlingen, og den har ingen egen fane —
den nås kun via søkefeltet på forsiden, eller ved å komme tilbake til
forsiden først. Samtidig er «Ny annonse» (selge, som en langt mindre andel
av øktene handler om) løftet til den mest fremtredende plassen i hele appen.
Favoritter, «Mine annonser» og lagrede søk ligger alle bak «Meg».

Dette er en IA-vurdering, ikke en feil — men det er verdt å ta stilling til
bevisst, ikke arve.

#### 3.2.4 `NativePageHeader` bryter på lange titler (verifisert)

`native-page-header.tsx:47`: `<h1 className="flex-1 text-center …">` uten
`truncate`/`line-clamp`. Verifisert på 375px med tittelen «2021 Volvo V90
cross country»: tittelen brytes over to linjer, headeren vokser, og
«Tilbake»-knappen (fast `h-12`) blir vertikalt ute av lodd med tittelen.

I tillegg vises **samme tittel to ganger rett under hverandre** på
annonsedetalj — én gang i headeren og én gang som sidens `<h1>`. På 375px er
det ~120px vertikalt av duplisert innhold over brettet. Native-mønsteret her
er en stor tittel i innholdet som kollapser inn i headeren ved scroll.

### 3.3 Nettbrett

Alle funn i denne seksjonen er nye — ingen tidligere plan har vurdert dette
formatet.

#### 3.3.1 Dialoger blir fullbredde bunn-sheets på iPad (målt)

`ResponsiveOverlay` grener på `useIsNative()` alene. På en iPad i portrett
(1024px) ble en åpen sheet målt til **1009 × 925 px** — altså en
fullbredde-skuff som dekker 68 % av skjermen, for innhold som er designet
for en telefon. Riktig mønster på nettbrett er en sentrert modal.

Dette er en direkte konsekvens av at `UX-AUDIT-PLAN.md` fase 2 bevisst
valgte «native → Sheet» som én-dimensjonal regel. Regelen var riktig for
telefon; den mangler bare den andre aksen.

#### 3.3.2 Annonsedetalj: tekstkollisjon i faktarutenettet (målt)

På 820px legger annonsedetaljen seg i to spalter, slik at **hovedspalten
blir smalere enn på telefon**. Kjøretøy-faktarutenettet
(`grid-cols-2 … @sm:grid-cols-4`) slår da over til fire kolonner ved en
containerbredde der cellene bare blir 88px.

Målt: etiketten «Frist EU-kontroll» er 91px bred i en 88px celle, og
**renner inn i ikonet til nabocellen** som starter på x=344 mens etiketten
slutter på x=350,5. Feilen finnes ikke på telefon (der containeren er under
`@sm` og rutenettet er to kolonner) og ikke på desktop (der spalten er bred
nok) — den er **eksklusiv for nettbrett-bredder**.

#### 3.3.3 Forsiden er en telefonside strukket over 1024px

`app-landing.tsx` har `min-h-[68vh] pt-24` på heroen og `max-w-md` på
søkefeltet, uten noen øvre ramme for øvrig. Verifisert på 1024 × 1366:
søkefeltet er en 448px-boks midt i ~800px vertikal tomhet, og «Populært nå»
er fortsatt en horisontal snap-karusell med `w-[60%] sm:w-[40%]`-kort i
stedet for rutenettet det er plass til. Kategorirutenettet _har_ riktignok
`sm:grid md:grid-cols-3 lg:grid-cols-4`, så deler av siden svarer på bredde
og deler gjør det ikke — på samme skjerm.

#### 3.3.4 Bunnavigasjonen skalerer ikke som konsept

`app-bottom-nav.tsx:47`: `max-w-md` sentrert. På iPad blir det en liten
flytende pille midt nederst på en 1024px skjerm, langt fra begge tomler i
landskap. iPadOS-mønsteret er en sidestilt navigasjon (sidebar/rail) eller
en breddefylt fanelinje.

#### 3.3.5 Flater som er beskyttet av flaks

`meg.tsx` (`max-w-lg`), `meldinger.$id.tsx` (`max-w-2xl`),
`mine-annonser.index.tsx` (`max-w-5xl`), `varsler.tsx`/`mine-sok.tsx`
(`max-w-4xl`), `ny-annonse.tsx` (`max-w-3xl`) har alle web-designede
maksbredder som tilfeldigvis gir et brukbart resultat i native på nettbrett.
Verdt å notere som **ikke** ødelagt — men det er tilfeldig, ikke designet, og
ingen av dem utnytter formatet (f.eks. tospaltet liste + tråd i meldinger).

#### 3.3.6 Multitasking ned til 320pt er aktivert, men ikke vurdert

Uten `UIRequiresFullScreen` kan appen kjøre i Slide Over på 320pt bredde.
Ingen del av layouten er testet under 375px. Dette er ikke verifisert i
denne revisjonen og står som en åpen risiko.

### 3.4 Orientering og landskap

Verifisert på 844 × 390 (iPhone i landskap): den klebrige headeren tar ~76px
og den flytende bunnavigasjonen ~110px av 390px høyde — **~48 % av skjermen
er chrome** før noe innhold vises. Bunnavigasjonen er dimensjonert for
portrett (64px FAB som stikker opp, tekstetiketter under ikonene) og er ikke
tilpasset i det hele tatt.

Kombinert med 3.1.4 (ingen `pl-safe`/`pr-safe`) er landskap på iPhone i dag
en orientering appen tillater, men ikke støtter. Det bør enten lukkes (én
linje i `Info.plist`) eller designes. Nettbrett må uansett beholde alle
orienteringer.

### 3.5 Innhold, bilder og gester

#### 3.5.1 Bildegalleriet mangler zoom og dra-for-å-lukke

`image-lightbox.tsx` viser bilder som `object-contain` i en Embla-karusell.
Det finnes **ingen pinch- eller dobbelttrykk-zoom på selve bildet**, og ingen
sveip-ned-for-å-lukke. På en bruktmarkedsplass er «zoom inn på rustflekken»
en kjernehandling, ikke pynt.

Nyanse verdt å ha med: `viewport`-metaen i `__root.tsx` setter verken
`maximum-scale` eller `user-scalable=no`, så WKWebView tillater
**sidenivå**-pinch-zoom. Brukeren _kan_ altså zoome, men da zoomes hele
appen inkludert chrome — ikke bildet i en zoombar visning. Det er en
tilgjengelighetsfordel som ikke må ødelegges av en fiks her.

#### 3.5.2 Kategorilisten i native søkeoverlay er kuttet på åtte

`native-search-overlay.tsx:225`: `.slice(0, 8)` uten «se alle»-utgang.
Verifisert: Kunst, Barn og baby, Båt og Annet vises i chip-raden på
`/annonser`, men er **ikke nåbare** fra søkeoverlayet. På nettbrett er det
ekstra påfallende, siden listen ender midt på en nesten tom skjerm.

#### 3.5.3 Pull-to-refresh finnes ett sted

`usePullToRefresh` brukes kun i `annonser.tsx`. Meldinger, varsler,
favoritter, «Mine annonser» og forsiden har ingen — brukeren lærer en gest
som så ikke virker fire skjermer av fem.

### 3.6 Native polish som mangler i CSS

Ingen av følgende finnes i `styles.css` eller noe sted i `src/`:

- `-webkit-tap-highlight-color` — Android viser standard grå/blå
  trykkrektangler over appens egne aktiv-tilstander.
- `user-select` / `-webkit-touch-callout` på chrome — langtrykk på
  navigasjonsetiketter, kortoverskrifter og knapper gir tekstmarkering og
  iOS-kopimeny, som umiddelbart avslører WebView-en.
- `overscroll-behavior` — bounce/glow forplanter seg fra indre lister til
  dokumentet.

Dette er tre linjer CSS som gir uforholdsmessig stor opplevd gevinst.

### 3.7 Tilgjengelighet på native

- **Dynamic Type / OS-tekststørrelse har ingen effekt.** WKWebView og
  Android WebView respekterer ikke systemets tekstskala for en webapp uten at
  appen selv gjør noe. Appen bruker `rem` gjennomgående, så
  skaleringspunktet finnes — det er bare ingen som setter det. En bruker som
  har skrudd opp tekststørrelsen på telefonen sin får nøyaktig samme app.
- `eslint-plugin-jsx-a11y` er fortsatt kun aktivert med én regel — allerede
  registrert som anbefalt neste steg i `UX-AUDIT-PLAN.md` seksjon 9, ikke
  duplisert som eget tiltak her.
- Ett konkret funn: lokasjonsknappen på native forside
  (`app-landing.tsx`) leses uten tilgjengelig navn i
  tilgjengelighetstreet — verifisert live (`button [ref_2]` uten navn).

### 3.8 Oppstart og opplevd ytelse

- Fast `launchShowDuration: 2000` betyr at appen **alltid** venter minst to
  sekunder, også når WebView-en er varm og innholdet kunne vært klart før.
  `launchAutoHide: false` + eksplisitt skjuling ved første maling ville gitt
  en raskere app uten annen kostnad.
- Ingen listevirtualisering noe sted; `result-list.tsx` bruker
  `IntersectionObserver`-basert inkrementell lasting, som er riktig valg for
  størrelsesorden her. **Ikke** et problem å løse nå — notert så det ikke
  utredes på nytt.

---

## 4. Tiltaksplan (prioritert)

| #   | Tiltak                                                                                                        | Omfang   | Prioritet   | Funn             |
| --- | ------------------------------------------------------------------------------------------------------------- | -------- | ----------- | ---------------- |
| 1   | Dev-gatet `?forcenative`-overstyring i `isNative()`                                                           | Triviell | **Kritisk** | 1.2              |
| 2   | Lukkeknapp i `Dialog`/`Sheet` → 44px trykkflate                                                               | Triviell | **Kritisk** | 3.1.1            |
| 3   | `input`/`textarea`/`SelectTrigger` → `h-11`; fjern `md:text-sm` i inndatafelt                                 | Liten    | Høy         | 3.1.2            |
| 4   | `FavoriteButton sm` og radene i native søkeoverlay → ≥44px                                                    | Liten    | Høy         | 3.1.2            |
| 5   | Safe area inn i `FullscreenOverlayContent` og `Sheet side="bottom"`                                           | Liten    | Høy         | 3.1.3            |
| 6   | `pl-safe`/`pr-safe`-utilities + bruk på all fast/klebrig chrome                                               | Liten    | Høy         | 3.1.4            |
| 7   | `useOverlayHistory` — hev `image-lightbox`-mønsteret til primitivene                                          | Middels  | Høy         | 3.2.2            |
| 8   | Slå på `allowsBackForwardNavigationGestures` på iOS                                                           | Liten    | Høy         | 3.2.1            |
| 9   | `NativePageHeader`: `line-clamp-1` + fjern duplisert tittel på detaljsider                                    | Liten    | Middels     | 3.2.4            |
| 10  | `useFormFactor()` (phone/tablet) + `ResponsiveOverlay` → sentrert dialog på nettbrett                         | Middels  | **Høy**     | 3.3.1            |
| 11  | Fiks faktarutenettets container-breakpoint (`@sm` → `@md`)                                                    | Triviell | Høy         | 3.3.2            |
| 12  | ✅ Nettbrettoppsett: forside, bunnavigasjon → sidenavigasjon, rutenett (fase 10)                              | Stor     | **Høy**     | 3.3.3–3.3.4, 8.1 |
| 13  | Orienteringsstyring via plugin: portrett-lås på telefon, fri på nettbrett                                     | Middels  | Høy         | 3.4, 8.2         |
| 14  | Pinch-/dobbelttrykk-zoom + sveip-ned-for-å-lukke + landskap i fullskjermbilde                                 | Middels  | Høy         | 3.5.1, 8.2, 8.4  |
| 15  | Fjern `.slice(0, 8)` / legg til «alle kategorier» i søkeoverlayet                                             | Triviell | Middels     | 3.5.2            |
| 16  | Native-CSS-polish (tap-highlight, user-select, overscroll)                                                    | Triviell | Middels     | 3.6              |
| 17  | Draghåndtak + dra-for-å-lukke på bunn-sheet                                                                   | Middels  | Middels     | 3.1.5            |
| 18  | Pull-to-refresh på meldinger, varsler, favoritter, «Mine annonser»                                            | Liten    | Middels     | 3.5.3            |
| 19  | Dynamic Type-støtte                                                                                           | Middels  | **Høy**     | 3.7, 8.4         |
| 20  | Tilgjengelig navn på lokasjonsknappen på native forside                                                       | Triviell | Middels     | 3.7              |
| 21  | ✅ Splash: `launchAutoHide: false` + skjul ved første maling; ryddet `UIRequiredDeviceCapabilities` (fase 11) | Liten    | Lav         | 3.8, 2.2         |
| 22  | ✅ Nettbrettoppsett for meldinger (liste + tråd side om side) (fase 10)                                       | Stor     | Middels     | 3.3.5, 8.1       |
| 23  | ⏸️ Beslutning: bundle web-bygget i appen for kaldstart/offline — **ikke tatt**, egen ADR                      | Stor     | Lav         | 2.1              |
| 24  | ✅ **Søkepanel med detents** — erstattet begge de native søkeflatene (fase 9)                                 | Stor     | **Høy**     | 8.3              |
| 25  | ✅ Bunnavigasjon: «Hjem» → «Søk» som fane 1, FAB forblir «Ny annonse» (fase 9)                                | Liten    | Høy         | 3.2.3, 8.3       |
| 26  | ✅ Kompakt søkesammendrag-pille erstatter søkelinje + chip-rad (fase 9)                                       | Middels  | Høy         | 8.3              |
| 27  | ~~Slå av sidenivå-zoom på native~~ — **utgår**, Capacitor gjør det allerede (10.10)                           | —        | —           | 8.4, 10.10       |
| 28  | ✅ Løftet «fjern lokasjon»-krysset ut av chip-knappen på forsiden + 44px (fase 9)                             | Liten    | Middels     | 10.2             |
| 29  | Tilbake-trykk under onboarding: kortnavigasjon i stedet for å avslutte appen                                  | Liten    | Middels     | 10.6             |
| 30  | Fjern håndrullet `pb-8` i de tre gjenværende bunn-sheetene                                                    | Triviell | Lav         | 10.13            |

**Status i tabellen over:** ✅ ble kun ført på rader der leveransen avvek fra
den opprinnelige plasseringen eller omfanget. **Alle rader uten markør er også
levert** — de eneste ikke-leverte tiltakene er 23, 29 og 30, og 27 utgikk.
Verifisert mot kode 2026-08-10, se 11.1.

**Ikke anbefalt:** omskriving av annonseveiviseren, meldingskjernen eller
`FullscreenOverlay`/`ResponsiveOverlay`-arkitekturen. Alle tre er riktig
bygget — planen utvider primitivene med én akse (formatfaktor) og én
egenskap (safe area/historikk), den erstatter dem ikke.

**~~Merk avhengigheten tiltak 27 → 19~~ — bortfalt 2026-08-10 (fase 6).**
Premisset var at sidenivå-zoom er brukerens eneste måte å forstørre tekst på i
dag. Det stemte ikke: Capacitor slår av zoom i WebView-en som standard på begge
plattformer, så den var aldri tilgjengelig på native (funn 10.10). Tiltak 19
(Dynamic Type) er fortsatt **Høy** — det er reelt eneste forstørrelsesmekanisme
— men det blokkerer ikke fase 6, og fase 6 gjør ingenting verre.

---

## 5. Implementeringsplan

Fasene er kuttet i PR-størrelser og sortert slik at delte primitiver er på
plass før flatene som skal bruke dem.

### Fase 0 — Verifiserbarhet (tiltak 1)

**Filer:** `src/lib/native.ts`.

Legg tilbake overstyringen som ble brukt i denne revisjonen, permanent og
dev-gatet:

```ts
if (import.meta.env.DEV && typeof window !== "undefined") {
  if (window.location.search.includes("forcenative")) return true;
}
```

Kravet er at den er umulig å treffe i produksjon (`import.meta.env.DEV`
strippes i bygget). Dokumenter den i `UI-GUIDE.md` under «Native
(Capacitor)», slik at den faktisk blir brukt.

**Hvorfor først:** hver eneste fase under trenger den for å kunne verifiseres
i nettleser. Uten den gjentar vi «kun kodenivå»-forbeholdet fra alle
tidligere planer.

**Testpåvirkning:** åpner for at Playwright kan dekke native-grener
(`page.goto("/?forcenative=1")`). Legg **ikke** til slike spec-er i denne
fasen — først når det finnes en gren verdt å dekke (fase 1 og 3 er gode
kandidater).

### Fase 1 — Trykkflater i delte primitiver (tiltak 2, 3, 4)

**Filer:** `src/components/ui/dialog.tsx`, `ui/sheet.tsx`, `ui/input.tsx`,
`ui/textarea.tsx`, `ui/select.tsx`, `src/components/favorite-button.tsx`,
`src/components/native-search-overlay.tsx`.

1. Lukkeknappene: behold `h-4 w-4`-ikonet, gi knappen `flex size-11
items-center justify-center` (ikonet skal _ikke_ vokse — det er
   trykkflaten som skal). Sjekk at `absolute right-4 top-4` fortsatt sitter
   riktig når knappen blir 44px, særlig i `DialogContent`s `p-6`.
2. `input`/`textarea`/`SelectTrigger`: `h-9` → `h-11`. Fjern `md:text-sm` fra
   `input.tsx` og `textarea.tsx` — 16px skal gjelde uansett bredde i native.
   **Verifiser tette skjemaoppsett i veiviseren** (`field-groups/**`) etter
   endringen; det er der flest felt står tett.
3. `favorite-button.tsx`: `sm`-varianten fra `size-8` til 44px trykkflate.
   Merk at knappen ligger som overlegg på annonsekortenes bilde — hvis 44px
   visuelt blir for dominerende, bruk en 32px visuell sirkel med en
   `before:absolute before:-inset-1.5`-utvidet trykkflate i stedet for å
   forstørre selve sirkelen.
4. `native-search-overlay.tsx`: `py-2.5` → høyde ≥44px på kategoriradene.
5. Ta samtidig tiltak 15 (`.slice(0, 8)`) og 20 (aria-label) — begge er
   énlinjers i filer denne fasen allerede rører.

**Testpåvirkning:** én komponenttest som asserter at `DialogContent`s
lukkeknapp har ≥44px klasser er lav verdi (klassesjekk, ikke atferd) —
hopp over. Verifiser i stedet live på 375px med fase 0-overstyringen, og
kjør `bun run test` for regresjon i eksisterende skjematester.

### Fase 2 — Safe area som egenskap ved primitivene (tiltak 5, 6)

**Filer:** `src/components/ui/fullscreen-overlay.tsx`, `ui/sheet.tsx`,
`src/styles.css`, + de fem konsumentene fra 3.1.3.

1. `FullscreenOverlayContent`: safe-area-padding på alle fire kanter som
   **standard**, med en eksplisitt opt-out for flater som med vilje skal gå
   helt ut i kanten (bildegalleriets bilder, kartet, kameraopptaket) — der
   skal _chromet_ pads, ikke medieinnholdet. Konkret: pad
   `FullscreenOverlayContent` selv, og la de fem konsumentene fjerne/justere
   sin egen håndtering.
2. `sheet.tsx`: `side="bottom"` får `pb-[max(1.5rem,env(safe-area-inset-bottom))]`.
   `app-bottom-nav.tsx`s ad-picker har i dag `pb-8` som håndrullet
   kompensasjon — den skal fjernes når primitiven dekker det (pensjonering).
3. `styles.css`: legg til `.pl-safe`/`.pr-safe` etter samme mønster som
   `.pt-safe`/`.pb-safe`, og bruk dem i `NativePageHeader`, `AppBottomNav`,
   veiviserens faste bunnlinje (`ny-annonse.tsx:1037`) og annonsedetaljens
   klebrige CTA (`listing-detail-view.tsx:1091`).
4. **Pensjonering:** `--safe-left`/`--safe-right` i `styles.css:132-133` skal
   enten brukes av de nye utilitiene eller slettes — de skal ikke bli stående
   ubrukt etter denne fasen.

**Testpåvirkning:** ingen automatiserbar. Verifiseres visuelt med
fase 0-overstyringen (safe-area-verdiene er 0 i nettleser, så _fraværet_ av
regresjon er det som kan bekreftes der) og må reverifiseres i simulator på en
enhet med notch før fasen regnes som ferdig.

### Fase 3 — Navigasjonsgester (tiltak 7, 8, 9)

**Filer:** ny `src/hooks/use-overlay-history.ts`,
`src/components/ui/fullscreen-overlay.tsx`, `ui/responsive-overlay.tsx`,
`src/components/listing-detail/image-lightbox.tsx` (forenkles),
`src/components/native-page-header.tsx`, `ios/App/App/AppDelegate.swift` (el.
tilsvarende), `src/components/listing-detail/listing-detail-view.tsx`.

1. **`useOverlayHistory(open, onClose)`** — trekk ut nøyaktig logikken som
   allerede står i `image-lightbox.tsx:43-56` (pushState ved åpning, popstate
   → lukk, rydd opp ved unmount). Kall den fra `FullscreenOverlayContent` og
   `ResponsiveOverlayContent` slik at **alle** overlays lukkes av
   Android-tilbake og iOS-sveip. `image-lightbox.tsx` bytter til hooken og
   sletter sin lokale kopi (pensjonering).
   Kritisk detalj som må verifiseres, ikke antas: onboarding-flyten blokkerer
   bevisst Escape og klikk utenfor. Avklar om tilbake skal kunne lukke den —
   trolig ikke, så hooken trenger en `enabled`-flagg.
2. **iOS sveip-tilbake:** sett `allowsBackForwardNavigationGestures = true`
   på WKWebView-en. Test eksplisitt mot Embla-karusellene og
   kategori-chip-radene i venstre kant; hvis konflikten er reell, begrens
   gesten eller løs det med `touch-action` på de aktuelle radene.
3. **`NativePageHeader`:** `line-clamp-1` på `<h1>`. Fjern den dupliserte
   `<h1>` i annonsedetaljens innhold når headeren viser samme tittel, eller
   — bedre, men større — la headertittelen tone inn ved scroll og la
   innholdstittelen være den primære. Velg det minste som løser dubletten.

**Testpåvirkning:** `useOverlayHistory` er ren, testbar logikk — legg til én
vitest som verifiserer at `popstate` kaller `onClose` og at historikken ryddes
ved unmount. iOS-gesten kan kun verifiseres i simulator.

### Fase 4 — Formatfaktor: nettbrett som eget format (tiltak 10, 11)

**Besluttet 2026-08-10 (8.1): full nettbrettstøtte, iPad og Android.** Fase 4
etablerer bare akselen og fikser de to konkrete feilene; selve
nettbrettoppsettene ligger i fase 10.

**Filer:** ny `src/hooks/use-form-factor.ts`,
`src/components/ui/responsive-overlay.tsx`,
`src/components/listing-detail/vehicle/*` (faktarutenettet).

1. **`useFormFactor(): "phone" | "tablet" | "web"`** — én hook, bygget på
   `useIsNative()` + en breddegrense (768px er riktig linje: den matcher
   Tailwinds `md` og iPadOS' egen kompakt/regulær-grense). Den skal **ikke**
   spres som `isTablet`-boolske sjekker rundt i koden; samme disiplin som
   `CategoryBehavior` (se `CLAUDE.md`) — kall den der oppsettet faktisk
   forgrener, ikke som en generell flagg-variabel.
2. `ResponsiveOverlay`: `phone` → `Sheet side="bottom"`, `tablet` og `web` →
   `Dialog`. Dette er hele fiksen for 3.3.1, og den treffer samtlige
   migrerte dialoger på én gang.
   **Verifiser `e2e/publish-listing.spec.ts`** (asserter på
   `PublishedListingDialog`s heading) — innholdet er uendret, men kjør den.
3. Faktarutenettet: hev container-breakpointet fra `@sm` til `@md` slik at
   fire kolonner først slår inn når cellene faktisk har plass. Sjekk samtidig
   de andre `@sm:`-rutenettene i `listing-detail/` for samme feil — dette er
   trolig ikke det eneste stedet.

**Testpåvirkning:** utvid `responsive-overlay.test.tsx` (finnes allerede fra
`UX-AUDIT-PLAN.md` fase 2) med en tredje sak: native + tablet-bredde →
`Dialog`. Det er en ren enhetstest av grenlogikken og bør skrives.

### Fase 5 — Orientering: portrett-lås med unntak (tiltak 13)

**Besluttet 2026-08-10 (8.2):** telefon låses til portrett, **unntatt** når et
bilde vises i fullskjerm. Nettbrett beholder alle fire orienteringer.

**Viktig teknisk konsekvens som endrer den opprinnelige planen:** unntaket
kan **ikke** løses ved å fjerne landskap fra `Info.plist`. iOS tillater bare
orienteringer som er deklarert i plisten — fjernes de, er landskap i
bildevisningen umulig. Riktig løsning er derfor motsatt: **behold**
landskap i plisten og styr låsen i kjøretid.

**Filer:** `ios/App/App/Info.plist` (uendret for orienteringer),
`android/app/src/main/AndroidManifest.xml`, ny
`src/lib/orientation.ts`, `src/lib/native-setup.ts`, `package.json`.

1. Ta inn `@capacitor/screen-orientation` (offisiell Capacitor-plugin).
   **Verifiser ved implementering** at den faktisk krever at ønskede
   orienteringer står i `Info.plist` — planen forutsetter det, og hele
   unntaksmekanismen henger på at forutsetningen stemmer.
2. Ved oppstart (`setupNative()`): `lock("portrait")` **kun når
   `useFormFactor()` sier `phone`**. Nettbrett låses aldri.
3. `ImageLightbox`: `unlock()` ved åpning, `lock("portrait")` ved lukking —
   igjen kun på telefon. Ryddes også ved unmount, ikke bare ved eksplisitt
   lukk, ellers kan appen bli stående ulåst.
4. Android: ikke sett `android:screenOrientation` i manifestet — la pluginen
   styre, slik at telefon/nettbrett kan behandles ulikt i samme APK.
   Manifestets `configChanges` har allerede `orientation|screenSize`, så
   rotasjon skjer uten restart.
5. `pl-safe`/`pr-safe` fra fase 2 må være på plass før dette — bildevisningen
   i landskap er nettopp der notch-innrykket får betydning.

**Testpåvirkning:** ikke automatiserbart. Simulator-verifisering er
obligatorisk: roter i appen (skal ikke skje), åpne fullskjermbilde og roter
(skal skje), lukk (skal snappe tilbake til portrett), og gjenta på nettbrett
(skal rotere fritt overalt).

### Fase 6 — Bildevisning og zoom-policy (tiltak 14, 27)

**Besluttet 2026-08-10 (8.4):** appen skal ikke føles som en nettside i en
wrapper. Sidenivå-zoom slås av på native; zoom finnes kun i fullskjermbilde.

**Filer:** `src/components/listing-detail/image-lightbox.tsx`,
`src/routes/__root.tsx` (viewport-meta), `src/lib/native-setup.ts`.

1. **Slå av sidenivå-zoom, kun på native.** Viewport-metaen i `__root.tsx`
   er statisk og deles med kaupet.no — den skal **ikke** endres globalt.
   Sett i stedet `user-scalable=no, maximum-scale=1` dynamisk fra
   `setupNative()` (som allerede kjører kun på native), slik at web beholder
   zoom uendret. Verifiser at Android WebView faktisk respekterer det;
   trengs `setSupportZoom(false)` i tillegg, hører det hjemme her.
2. Pinch- og dobbelttrykk-zoom på det aktive bildet, med panorering når
   zoomet. **Ikke ta inn et nytt bibliotek** før det er bekreftet at en
   pointer-basert transform ikke holder — Embla er allerede der og håndterer
   sveip mellom bilder; det som mangler er zoom _innenfor_ ett bilde. Merk at
   når sidenivå-zoom er av, må denne implementeres som en egen transform —
   den kan ikke lene seg på nettleserens egen pinch.
3. Sveip ned for å lukke, og samspill med landskap-unlock fra fase 5.
4. **Konsekvens som må håndteres, ikke ignoreres:** når zoom fjernes, er
   Dynamic Type (fase 8) brukerens eneste gjenværende måte å forstørre tekst
   på. Fase 8 er derfor ikke lenger valgfri, og bør leveres i samme runde
   eller før denne. Slippes fase 6 alene, er appen midlertidig dårligere
   tilgjengelig enn i dag.

**Testpåvirkning:** gestlogikk er vanskelig å enhetsteste meningsfullt.
Verifiser manuelt på enhet; noter i fremdriftsloggen at det ikke er
automatisert.

**Oppdatert etter implementering:** punkt 1 og 4 utgikk, se funn 10.10 og
fremdriftsloggen for fase 6.

### Fase 7 — Native polish og gestkonsistens (tiltak 16, 17, 18)

**Filer:** `src/styles.css`, `src/components/ui/sheet.tsx`,
`src/hooks/use-pull-to-refresh.ts` + de fire rutene.

1. CSS-polish (3.6) — tre regler, gated på native der det er nødvendig
   (tekstmarkering skal fortsatt virke i meldinger, annonsebeskrivelser og
   andre steder brukeren rimeligvis vil kopiere tekst; det er ikke en
   global av-bryter).
2. Draghåndtak + dra-for-å-lukke på bunn-sheet. **Vurder eksplisitt om
   `vaul` skal tilbake** — den ble fjernet i `UX-AUDIT-PLAN.md` fase 2 fordi
   den var ubrukt, ikke fordi den var feil verktøy. Hvis en håndrullet
   dra-gest blir mer enn ~40 linjer, er biblioteket det late valget.
3. `usePullToRefresh` på de fire manglende rutene. Hooken finnes og er
   gjenbrukbar som den er.

**Oppdatert etter implementering:** punkt 2 ble gjort her, ikke utsatt til
etter fase 9 — `vaul` ble vurdert og valgt bort fordi gesten uten detents er
~45 linjer. Se fremdriftsloggen for fase 7.

### Fase 8 — Dynamic Type (tiltak 19) — ~~påkrevd før eller sammen med fase 6~~, se 10.10 — implementert 2026-08-10

**Avklares under implementering:** hvilken mekanisme.

Undersøk i denne rekkefølgen (stopp ved første som holder):
`-webkit-text-size-adjust`; `font: -apple-system-body` som rot-skala på iOS;
lesing av systemets tekstskala fra native og setting av `html { font-size }`.
Appen bruker `rem` gjennomgående, så når rotstørrelsen først skalerer,
følger hele typografien med — det er derfor dette er billigere enn det ser
ut.

Verifiser at ingenting brekker ved 200 % (WCAG 1.4.4), særlig i veiviseren
og bunnavigasjonen — som etter fase 9 også må romme et søkepanel.

**Oppdatert etter implementering:** svaret er `font: -apple-system-body` (målt,
ikke satt direkte) på iOS, og **ingenting** på Android, som allerede skalerer
via `textZoom`. Se funn 10.12 og fremdriftsloggen for fase 8.

### Fase 9 — Søkepanel og navigasjonsomlegging (tiltak 24, 25, 26) — implementert 2026-08-10

**Besluttet 2026-08-10 (8.3), med én justering fra opprinnelig forslag —
se 8.3 for begrunnelsen.** Kort: søkepanelet bygges som beskrevet, men
midtknappen forblir «Ny annonse»; søk løftes i stedet til fane 1.

Dette er planens største enkeltleveranse og bør deles i minst to PR-er.

**Filer:** ny `src/features/listing-search/search-panel/`,
`src/components/native-search-overlay.tsx` (**erstattes**),
`src/components/native-advanced-search.tsx` (**erstattes**),
`src/components/app-bottom-nav.tsx`, `src/routes/annonser.tsx`,
`src/components/native-filter-chips.tsx`, `src/components/app-landing.tsx`.

**9a — Søkepanelet.**

1. Ett panel med **detents** (delvis høyde ↔ fullskjerm), dratt av brukeren.
   Innhold: fritekstfelt øverst, aktive søkeparametere listet under, og
   resultattelling som oppdateres mens man justerer.
2. **Gjenbruk før nybygg — dette er hele poenget med fasen.** Appen har
   allerede to native søkeflater: `NativeSearchOverlay` (fritekst, historikk,
   kategoriliste) og `NativeAdvancedSearch` (parameterfaner). Panelet skal
   være **sammenslåingen av disse to**, ikke en tredje flate ved siden av.
   Begge slettes i samme fase (se seksjon 6). Søkelogikken selv
   (`resolve-text-to-filters.ts`, `search-schema.ts`, `category-filters.ts`)
   røres ikke.
3. **Her kommer `vaul` tilbake.** Detents med dragegest, velocity-snap og
   riktig scroll-låsing per detent er ikke ~40 linjer — det er nøyaktig
   bruksområdet biblioteket finnes for. Det ble fjernet i
   `UX-AUDIT-PLAN.md` fase 2 fordi det var ubrukt, ikke fordi det var feil
   verktøy. ~~Samme avhengighet dekker da også tiltak 17 (draghåndtak på
   vanlige bunn-sheets), så fase 7 punkt 2 bør gjøres **etter** denne fasen
   og gjenbruke valget herfra.~~ **Utgått:** tiltak 17 ble levert håndrullet i
   fase 7 (~45 linjer, ingen detents). Tas `vaul` inn her, bør `useSheetDrag`
   i `ui/sheet.tsx` erstattes i samme slengen i stedet for å bli stående ved
   siden av.
4. Panelet skal bruke `useOverlayHistory` fra fase 3, slik at Android-tilbake
   og iOS-sveip lukker det.
5. På nettbrett (`useFormFactor() === "tablet"`) skal panelet **ikke** være en
   fullbredde bunn-skuff — samme resonnement som 3.3.1. Avklares konkret i
   fase 10; til da er telefonvarianten akseptabel.

**9b — Navigasjon og resultatside.**

6. Bunnavigasjon: fane 1 blir **«Søk»** og lander på søkeflaten i stedet for
   dagens «Hjem». Midtknappen forblir «Ny annonse», uendret i alle
   tilstander. Ingen sjette fane. Se 8.3 for hvorfor denne varianten ble
   valgt fremfor en kontekstavhengig midtknapp.
7. `/annonser`: dagens søkelinje + full chip-rad erstattes av **én kompakt
   søkesammendrag-pille** (fritekst + «N filtre») som åpner panelet.
   **Fjern ikke all filterindikasjon** — brukeren må fortsatt kunne se hva
   som er aktivt uten å åpne panelet, ellers byttes trangt UI mot skjult
   tilstand. Pillen er sammendraget.
8. Forsidens søkefelt blir en **trigger** for panelet, ikke et eget
   inndatafelt — ett søkeinngangspunkt, ikke to som oppfører seg ulikt.

**Testpåvirkning:** dette er fasen med størst e2e-risiko i hele planen.
`e2e/browse-search.spec.ts` og `e2e/pages/listing-wizard.ts` treffer
søkeflatene direkte. Bruk fase 0-overstyringen til å skrive **native** e2e-
dekning for panelet før de gamle overlayene slettes — dette er første fase
der native-grener faktisk kan dekkes automatisk, og det bør utnyttes her
fremfor senere.

### Fase 10 — Nettbrettoppsett (tiltak 12, 22)

**Besluttet 2026-08-10 (8.1): full støtte, iPad og Android nettbrett.**

**Filer:** `src/components/app-bottom-nav.tsx`,
`src/components/app-landing.tsx`, `src/routes/_authenticated/meldinger.*`,
søkepanelet fra fase 9.

1. **Navigasjon:** på `tablet` erstattes den flytende bunnpillen av en
   sidestilt navigasjon (rail/sidebar) i tråd med iPadOS- og
   Material-mønstre. Samme rutedefinisjoner, annen presentasjon — ikke en
   parallell navigasjonskomponent med egen tilstand.
2. **Forside:** øvre bredderamme på heroen, og «Populært nå» fra
   `w-[60%]`-karusell til rutenett. Kategorirutenettet har allerede
   `md:`/`lg:`-varianter og trenger ingen endring — bare at resten av siden
   slutter å være uenig med det.
3. **Meldinger:** liste + tråd side om side (tiltak 22). Begge finnes
   allerede som egne ruter; dette er et layoutgrep over eksisterende
   komponenter, ikke ny meldingslogikk.
4. **Søkepanelet på nettbrett** (fase 9 punkt 5) konkretiseres her.
5. **Android nettbrett** skal verifiseres eksplisitt, ikke antas dekket av
   iPad-arbeidet — `useFormFactor()` er breddebasert og plattformnøytral, så
   det bør stemme, men det er ikke bekreftet.
6. **Split View / Slide Over ned til 320pt** (3.3.6) verifiseres i denne
   fasen. Dette er første gang appen faktisk er testet under 375px.

### Fase 11 — Oppstart og opprydding (tiltak 21, 23)

- `launchAutoHide: false` + skjul splash ved første maling; rydd
  `UIRequiredDeviceCapabilities`.
- Beslutning om bundlet web-bygg (tiltak 23) — **en arkitekturbeslutning, ikke
  et UX-tiltak.** Skal tas som egen sak med egen ADR, ikke smuglet inn her.

---

## 6. Pensjonering av gammel kode

Brukeren har bedt eksplisitt om at erstattet kode fjernes fortløpende. Dette
er hva hver fase skal rydde vekk — det er en del av fasens
ferdigdefinisjon, ikke en oppfølgingssak:

| Fase | Skal slettes / erstattes                                                                  |
| ---- | ----------------------------------------------------------------------------------------- |
| 2    | ✅ Alle fire `--safe-*`-variablene (alle var døde) — slettet                              |
| 2    | ✅ `pb-8`-kompensasjonen i `app-bottom-nav.tsx`s ad-picker-sheet                          |
| 2    | ✅ Per-konsument safe-area i de tre overlayene som håndterte det manuelt                  |
| 3    | ✅ Den lokale historikk-håndteringen i `image-lightbox.tsx` **og** `map-overlay.tsx`      |
| 3    | ✅ Den dupliserte `<h1>` på annonsedetalj (headertittelen toner inn ved scroll i stedet)  |
| 4    | ✅ Den manuelle `!native ? Dialog : Sheet`-grenen i `app-bottom-nav.tsx`s ad-picker       |
| 5    | _Ingen_ — plisten beholder alle orienteringer med vilje (se fase 5)                       |
| 6    | _Ingen_ — `<img>`-en i lightboxen er erstattet av `ZoomableImage`                         |
| 7    | ✅ Den innebygde pull-to-refresh-spinneren i `annonser.tsx`                               |
| 8    | _Ingen_                                                                                   |
| 9    | ✅ `native-search-overlay.tsx` **hele filen** — erstattet av søkepanelet                  |
| 9    | ✅ `native-filter-chips.tsx` **hele filen** (ikke i planen) — pillen erstatter chip-raden |
| 9    | ⚠️ `native-advanced-search.tsx` — tømt for seksjonene, men beholdt, se funn 10.14         |
| 9    | ✅ Søkelinjen + chip-raden på `/annonser` **og** kategorilandingssidene i native-grenen   |
| 9    | ✅ Forsidens separate søkeinndatafelt (er nå en trigger)                                  |
| 10   | ✅ `max-w-md`-bunnpillen på nettbrett — erstattet av railen (samme komponent, se fase 10) |

Regel for alle faser: hvis en fase innfører en delt primitiv/hook, er fasen
ikke ferdig før **alle** eksisterende kallsteder er migrert og de lokale
kopiene er slettet. Halvmigrerte primitiver er hvordan appen fikk fire
parallelle størrelsesdefinisjoner i utgangspunktet (3.1.2).

---

## 7. Verifisering

- `bunx tsc --noEmit` og `bun run lint` etter hver fase (kjøres uansett som
  hooks).
- `bun run test` for berørte komponenttester.
- `bun run test:e2e` etter fase 1, 4 og **særlig 9** (skjemafelthøyder,
  `ResponsiveOverlay`-grenen og søkeflatene er det e2e faktisk asserter mot).
- **Nettleserverifisering med `?forcenative`** (fase 0) på 375×812, 844×390,
  820×1180 og 1024×1366 for alle layoutendringer. Fra fase 10 også 320×768
  (iPad Slide Over).
- **Simulator/enhet er obligatorisk for:** fase 2 (safe areas — verdiene er 0
  i nettleser), fase 3 (iOS-gest, Android-tilbake), fase 5 (rotasjonslås og
  unntaket i bildevisning), fase 6 (pinch/sveip + at zoom faktisk er av),
  fase 7 (dra-for-å-lukke på ekte touch, langtrykk/tap-highlight),
  fase 8 (Dynamic Type — kan ikke observeres i nettleser i det hele tatt, se
  10.12), fase 10 (Android nettbrett og Split View). Disse
  fasene skal **ikke** merkes ferdige på kodenivå alene — det er nøyaktig
  forbeholdet `UX-AUDIT-PLAN.md` fase 3 og 4 måtte notere, og som denne
  planen forsøker å ikke gjenta.

---

## 8. Besvarte spørsmål og beslutninger

Alle fire spørsmålene ble besvart 2026-08-10. Beslutningene er innarbeidet i
seksjon 4 og 5. Der planens opprinnelige anbefaling ble overstyrt, eller der
beslutningen har en teknisk konsekvens som ikke var åpenbar i spørsmålet, står
det eksplisitt.

### 8.1 iPad-ambisjon → **full nettbrettstøtte, iPad og Android**

Besluttet: alternativ **A**, og utvidet til å gjelde Android nettbrett på lik
linje. Planens opprinnelige anbefaling var B (fiks feilene, ikke optimaliser)
— den er overstyrt.

Konsekvens: tiltak 12 og 22 går fra «Middels/Lav» til «Høy/Middels» og får en
egen fase (fase 10) i stedet for å ligge i samlefasen. Fase 4 er redusert til
å etablere `useFormFactor()`-akselen og fikse de to konkrete feilene, slik at
den fortsatt kan leveres tidlig og billig.

Ett praktisk poeng verdt å ha med: Android har ingen motsvarighet til
`TARGETED_DEVICE_FAMILY` — Android-nettbrett er allerede «støttet» i den
forstand at APK-en installeres og kjører. Arbeidet er derfor rent
layoutarbeid, og `useFormFactor()` er breddebasert og plattformnøytral, så
det samme arbeidet dekker begge. Men **det må verifiseres, ikke antas**
(fase 10 punkt 5).

### 8.2 Orientering → **portrett-lås på telefon, unntatt fullskjermbilde**

Besluttet: telefon låses til portrett; fullskjermvisning av bilde skal kunne
roteres. Nettbrett beholder alle fire orienteringer.

**Viktig teknisk konsekvens som endrer planen:** dette kan ikke løses slik
planen opprinnelig foreslo (fjerne landskap fra `Info.plist`). iOS tillater
kun orienteringer som er deklarert i plisten — fjernes de, blir landskap i
bildevisningen umulig. Riktig løsning er motsatt: **behold** landskap i
plisten og styr låsen i kjøretid via `@capacitor/screen-orientation`. Fase 5
er skrevet om deretter.

Sideeffekt som er verdt å like: dette gjør at telefon og nettbrett kan
behandles ulikt i samme binary, uten separate byggevarianter.

### 8.3 Søkeknapp i bunnavigasjonen → **ja til panelet, nei til kontekstavhengig midtknapp**

Besluttet: bygg søkepanelet med detents, og la det erstatte dagens søkelinje
og filter-chips på `/annonser`. **Én justering fra det opprinnelige forslaget:
midtknappen forblir «Ny annonse»; søk løftes i stedet til fane 1.**

Vurderingen det ble bedt om, i sin helhet:

**Det som er riktig i forslaget, og bør bygges som beskrevet:**

- Søk fortjener en primærplassering. 3.2.3 er et reelt IA-problem.
- Dagens søkelinje + chip-rad på `/annonser` er faktisk dårlig på telefon —
  målt i denne revisjonen: chip-raden renner ut av skjermen, og
  søkefelt + fire chips + sorteringskontroll konkurrerer om ~343px.
- Et dratt panel med detents er riktig native-mønster for «juster søket mitt
  mens jeg ser resultatene endre seg». Det gir noe dagens overlay-modell
  ikke kan: brukeren beholder kontakten med resultatlisten mens de justerer.
- Og det er den beste anledningen til å **slå sammen to eksisterende
  søkeflater til én** (`NativeSearchOverlay` + `NativeAdvancedSearch`), som
  i dag er to ulike interaksjoner for samme oppgave.

**Det jeg vil advare mot — en midtknapp som skifter betydning:**

- Midtknappen er appens mest fremtredende affordanse. At den betyr to ulike
  ting avhengig av hvilken rute man står på, bryter med forutsigbarheten som
  er hele poenget med en fast fanelinje. Brukere bygger muskelminne på
  posisjon, ikke på ikon.
- Regelen «søk når siden ikke har søkelinje» blir i praksis invertert fra
  det brukeren ville gjettet: forsiden _har_ søkefelt, så der forblir knappen
  «Ny annonse»; `/annonser` mister søkelinjen i samme forslag, så der blir
  den «Søk». Tilstanden som styrer knappen er altså usynlig for brukeren.
- Den alvorligste konsekvensen: på skjermene der knappen er «Søk», finnes
  det **ingen inngang til å opprette annonse** fra fanelinjen. Tilbudssiden
  er det som gjør markedsplassen levende, og den bør ikke forsvinne
  situasjonsbetinget.
- Under annonseopprettelse er midtknappen allerede opptatt — den er «Avbryt»
  (`isOnNewAdPage` i `app-bottom-nav.tsx`). Forslaget ville gitt knappen en
  tredje betydning i samme flate.

**Anbefalt variant, som løser det samme uten mode-switching:**

Slå sammen «Hjem» og «Søk» til fane 1. Forsiden _er_ i praksis en
søkelanseringsside allerede (hero-søkefelt + populært) — den har ikke et
selvstendig innhold som forsvarer en egen fane ved siden av søk. Da blir
fanelinjen:

> **Søk** · Varsler · **[Ny annonse]** · Meldinger · Meg

Fem faner, ingen ny plass, ingen skiftende betydninger, søk tilgjengelig fra
hvor som helst med ett trykk, og «Ny annonse» beholder sin faste plass.
Panelet åpnes fra søkeflaten, fra sammendrag-pillen på `/annonser`, og fra
forsidens søkefelt (som blir en trigger). Dette er innarbeidet som fase 9b.

**Én ting jeg vil holde igjen på i forslaget:** at panelet erstatter
filter-chipsene _helt_. Chipsene har én funksjon som panelet ikke dekker —
de viser hva som er aktivt uten at brukeren må åpne noe. Erstattes de med
ingenting, byttes trangt UI mot skjult tilstand, som er den dyrere feilen.
Planen legger derfor inn en kompakt **søkesammendrag-pille** («sofa · 3
filtre») som både viser tilstanden og er inngangen til panelet.

### 8.4 Sidenivå-zoom → **slås av på native, beholdes på web**

Besluttet: appen skal ikke føles som en nettside i en wrapper. Zoom fjernes
app-bredt på native og finnes kun i fullskjermbilde.

**Konsekvens som må håndteres, ikke bare noteres:** sidenivå-zoom er i dag
brukerens eneste måte å forstørre tekst i appen på — Dynamic Type har ingen
effekt (3.7). Fjernes zoomen uten at Dynamic Type virker, blir appen
midlertidig **dårligere** tilgjengelig enn i dag, og bryter mot WCAG 1.4.4 i
en variant som ikke har noen omvei. Fase 8 (Dynamic Type) er derfor hevet til
påkrevd og må leveres før eller sammen med fase 6.

Implementeringsdetalj: viewport-metaen i `__root.tsx` deles med kaupet.no og
skal **ikke** endres globalt — `user-scalable=no` settes fra `setupNative()`,
som allerede kun kjører på native.

---

## 9. Fremdriftslogg

_Fylles ut etter hver fase. Format: hva som faktisk ble gjort, avvik fra
planen med begrunnelse, hva som ble pensjonert, hva som bevisst ikke ble
verifisert._

### Fase 0 — Verifiserbarhet (tiltak 1) — ferdig 2026-08-10

**Gjort:** `isNative()` (`src/lib/native.ts`) returnerer `true` når URL-en
inneholder `forcenative`, gated på `import.meta.env.DEV`. Dokumentert i
`UI-GUIDE.md` under «Native (Capacitor)» med viewport-listen fra seksjon 7.

**Verifisert:** `http://localhost:5181/?forcenative=1` i vanlig nettleser
rendrer native-onboardingen, `AppBottomNav`, `NativePageHeader` og
`NativeSearchOverlay` — altså grener som aldri før har vært observerbare
utenfor simulator. Hele fase 1 under er verifisert gjennom denne.

**Ikke gjort (bevisst):** ingen Playwright-spec-er lagt til, jf. planens eget
punkt om å vente til det finnes en gren verdt å dekke.

### Fase 1 — Trykkflater i delte primitiver (tiltak 2, 3, 4, + 15, 20) — ferdig 2026-08-10

**Gjort:**

1. `ui/dialog.tsx` + `ui/sheet.tsx`: lukkeknappen fra 16×16 til `size-11`
   (44×44, målt). Ikonet er fortsatt `h-4 w-4`. `-mr-3.5 -mt-3.5` gjør at
   **ikonets senter havner nøyaktig der det lå før** (målt: 23,75px fra
   dialogens høyre kant og topp, mot 23,75px før endringen) — utvidelsen
   flytter altså ingenting visuelt, den vokser bare utover mot hjørnet.
2. `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx`: `h-9` → `h-11`, og
   `md:text-sm` fjernet fra input/textarea. Målt på 820px: 44px høyde, 16px
   skrift — nettbrett-nedskaleringen fra 3.1.2 er borte.
3. `favorite-button.tsx` `sm`: sirkelen forblir 32px (den ligger som overlegg
   på kortbildet og ble visuelt dominerende i 44px), trykkflaten utvides
   usynlig med `before:-inset-1.5` → 44px. Verifisert med
   `elementFromPoint` 4px utenfor sirkelen: treffer knappen.
4. `native-search-overlay.tsx`: kategorirader og historikkrader `min-h-11`
   (målt 44), tilbakeknappen `size-10` → `size-11`, og tøm-feltet-krysset fra
   ~24px til 44px (med `pr-11` på inputen så teksten ikke løper under).
5. Tiltak 15: `.slice(0, 8)` fjernet. Verifisert: alle 12 toppkategorier,
   inkludert Kunst, Barn og baby, Båt og Annet, er nå nåbare fra
   søkeoverlayet. Containeren scroller allerede, så ingen «se alle»-utgang
   trengs.
6. Tiltak 20: lokasjonsknappen på native forside har fått eksplisitt
   `aria-label` som inkluderer den synlige teksten (WCAG 2.5.3). Målt:
   `Velg lokasjon: Hvor som helst`, 44px høy.

**Avvik fra planen:** planen foreslo `-mr-2.5`; målingen viste at det flytter
ikonet 4px. `-mr-3.5` er det som faktisk gir optisk paritet. Skeleton-
plassholderne i `profil/profile-section.tsx` og `profil/account-section.tsx`
er hevet fra `h-9` til `h-11` i samme slengen, ellers hopper layouten når
skjemafeltene erstatter dem.

**Verifisert:** `bunx tsc --noEmit` rent, `bun run test` 218/218,
`bun run lint` 0 errors. Live på 375×812 og 820×1180 med `?forcenative`.

**Ikke verifisert (fase 1):** simulator/enhet (ingen fase-1-endring avhenger av ekte
WebView-oppførsel, men 16px-inputgrensen mot WKWebViews auto-zoom er utledet
fra plattformdokumentasjon, ikke observert). Annonseveiviserens tette
skjemaoppsett (`field-groups/**`) er **ikke** sett med de nye 44px-feltene —
den ligger bak innlogging, og planen har allerede notert innloggede flater som
kun kodegjennomgått. Det er den enkeltrisikoen i fase 1 jeg er minst trygg på.

### Fase 2 — Safe area som egenskap ved primitivene (tiltak 5, 6) — kodeferdig 2026-08-10, venter på simulator

**Nye utilities i `styles.css`** (etter samme mønster som `.pt-safe`/`.pb-safe`,
og med samme forbehold: de er ulagede, så de **erstatter** `padding` fra
Tailwind-utilities på samme element — derfor er basisverdien bakt inn der
kallstedet hadde padding fra før):

| Utility               | Verdi                                             | For                                                    |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `.pl-safe`/`.pr-safe` | `env(safe-area-inset-left/right)`, null i basis   | Chrome uten egen horisontal padding (NativePageHeader) |
| `.px-safe`            | `max(1rem, env(...))`                             | Erstatning for `px-4` på faste bunnlinjer              |
| `.p-safe`             | Nøyaktig safe area på alle fire kanter, ingen min | `FullscreenOverlayContent`                             |

`.p-safe` har bevisst **ingen** minimumsverdi (i motsetning til `.pt-safe`s
0,5rem): en fullskjerm-takeover skal ikke få 8px luft rundt seg på enheter uten
notch, den skal bare unngå systemets UI.

**Gjort:**

1. `FullscreenOverlayContent` padrer nå safe area på alle fire kanter som
   standard, med `edgeToEdge`-opt-out. De 8 konsumentene:
   `fullscreen-location-picker`, `native-search-overlay`,
   `native-advanced-search`, `onboarding-flow`, `preview-draft-view` og
   `vehicle-360-capture-launcher` arver standarden (360°-opptaket er et
   `max-w-md`-kortoppsett, ikke fullbleed video, så standarden er riktig der).
   `image-lightbox` og `map-overlay` setter `edgeToEdge` — bakteppet og bildet
   skal dekke hele skjermen; padres containeren, får man en stripe av
   app-bakgrunn langs notchen.
2. `image-lightbox`: toppbaren og miniatyrbildelinjen tar safe area selv
   (`px-safe pt-safe` / `px-safe pb-safe`). `map-overlay` trenger ingenting —
   kortet er allerede trukket 7,5 % inn fra hver kant, godt klar av notch og
   home indicator i begge orienteringer.
3. `sheet.tsx` `side="bottom"`: `pb-[max(1.5rem,env(safe-area-inset-bottom))]`.
4. `pl-safe pr-safe` på `NativePageHeader`; `px-safe` på annonsedetaljens
   klebrige CTA og veiviserens faste bunnlinje.

**Pensjonert:**

- `--safe-top`/`--safe-bottom`/`--safe-left`/`--safe-right` i `styles.css` —
  **alle fire** var døde (`grep` fant null `var(--safe-*)` i `src/`), ikke bare
  de to horisontale. Kodebasen bruker `env()` direkte overalt, så variablene er
  slettet i stedet for tatt i bruk.
- `pb-8`-kompensasjonen i `app-bottom-nav.tsx`s ad-picker-sheet.
- Per-konsument safe-area i `fullscreen-location-picker` (inline `style`),
  `native-search-overlay` (`pt-safe`) og `native-advanced-search` (`pt-safe` +
  to `pb-safe`).

**Avvik fra planen:** `AppBottomNav` fikk **ikke** `pl-safe`/`pr-safe`, selv om
planen listet den. Pillen er `mx-auto max-w-md` (448px sentrert); i landskap på
iPhone står den ~198px fra hver kant mens notchen er ~47px. Utilityen ville
vært en no-op og samtidig overskrevet `px-3`. Utelatt bevisst.

**Verifisert live** med `?forcenative` på 375×812:

- Med safe-area = 0 (nettleser) er **alt pikselidentisk med før**: `px-safe`
  gir 16px (= `px-4`), sheetens `pb` gir 24px (= `p-6`), `p-safe` og
  `pl-safe`/`pr-safe` gir 0. Det er den delen som faktisk _kan_ bekreftes i
  nettleser, og den er bekreftet.
- Med en **simulert notch** (midlertidig injisert CSS som overstyrte
  utilitiene med 44/47/34px) ble det bekreftet at paddingen lander riktig
  sted: søkeoverlayet trekkes inn på alle fire kanter, mens bildegalleriets
  bakteppe måler fortsatt fulle 375×812 og kun chromet flyttes (lukkeknappen
  målt til nøyaktig 47px fra høyre kant, miniatyrbildene løftet 34px).

`bunx tsc --noEmit` rent, `bun run test` 218/218, `bun run lint` 0 errors.

**Ikke verifisert:** ekte `env(safe-area-inset-*)`-verdier. Nettleseren
rapporterer 0, så den simulerte notchen beviser at _layouten reagerer riktig_,
ikke at iOS/Android faktisk leverer de verdiene vi tror. Fase 2 skal derfor
**ikke** regnes som ferdig før den er sett i simulator på en enhet med notch,
jf. seksjon 7. Ad-picker-sheeten (der `pb-8` ble fjernet) ligger bak
innlogging og er ikke sett åpen — kun `SheetContent`-regelen er målt isolert.

### Fase 3 — Navigasjonsgester (tiltak 7, 8, 9) — kodeferdig 2026-08-10, venter på simulator

**Gjort:**

1. **`useOverlayHistory(enabled, onClose)`** (`src/hooks/use-overlay-history.ts`)
   kalles fra `FullscreenOverlay` og `ResponsiveOverlay` — altså fra
   **rot**-komponentene, ikke fra `*Content`, siden det er der `open` og
   `onOpenChange` finnes. Alle 13 kallsteder for de to primitivene arver den
   uten endring. `historyBack={false}` på `FullscreenOverlay` er opt-out-en, og
   onboardingen er eneste bruker av den (den blokkerer bevisst Escape og klikk
   utenfor, jf. planens punkt 1).
2. **iOS sveip-tilbake:** `allowsBackForwardNavigationGestures = true` settes i
   `AppDelegate.applicationDidBecomeActive`. Capacitor 8 eksponerer den
   **ikke** i `capacitor.config.ts` (sjekket `@capacitor/cli`s
   `declarations.d.ts` — `ios` har `zoomEnabled` og `allowsLinkPreview`, men
   ingen back/forward-gest), så native kode er eneste vei. Den settes ikke i
   `didFinishLaunching` fordi WebView-en ikke finnes ennå der; kallet er
   idempotent og tåler å kjøre ved hver aktivering.
3. **`NativePageHeader`:** `line-clamp-1` på `<h1>`, og ny `titleFadesIn`-
   egenskap brukt av annonsedetaljen. Dubletten er løst med planens «bedre,
   men større»-variant i stedet for den minste, fordi den ikke var større:
   `useScrollFadeOpacity` fantes allerede (brukt av `app-hero-logo.tsx`) og
   kunne gjenbrukes invertert. Headertittelen er `opacity: 0` (og
   `aria-hidden`) i toppen der innholdets `<h1>` er synlig, og toner inn når
   den er scrollet vekk.

**Avvik fra planen:** hooken er ikke en ren «pushState ved åpning, back ved
lukking»-uttrekking slik planen beskrev — se funn 10.5. Den teller åpne
overlays på modulnivå og utsetter opprydningen én tick, ellers lekker et
lazy-lastet overlay en historikk-oppføring.

**Pensjonert:** den lokale historikk-håndteringen i `image-lightbox.tsx` og —
ikke nevnt i planen, men samme kopi — `map-overlay.tsx`. Begge kaller nå
`onClose()` direkte i stedet for `history.back()`; oppryddingen av
historikk-oppføringen skjer i hooken.

**Verifisert live** med `?forcenative` på 375×812 (målt i DOM, ikke antatt):

- `ResponsiveOverlay` (Kaupet-kode-dialogen): åpning pusher nøyaktig én
  oppføring (`history.state = {overlay:true}`), Escape lukker og popper den
  tilbake til ruterens egen tilstand — ingen lekket oppføring.
- `ImageLightbox` (`FullscreenOverlay`, lazy-lastet): `history.back()` lukker
  galleriet og lar brukeren stå igjen på `/59186707`, `history.length` uendret.
- Onboarding: ingen oppføring pushes (`historyBack={false}` bekreftet i DOM).
- Navigasjon mens et overlay er åpent (Del annonse → lenke til `/`): landet på
  `/` og ble stående — guarden mot å kalle `history.back()` når toppen av
  stacken er ruterens tilstand virker.
- `NativePageHeader`: tittelfeltet 24px (én linje, med ellipse) mot to linjer
  før; tittelen skjult ved scroll 0 og synlig etter scroll.

`bunx tsc --noEmit` rent, `bun run test` 222/222 (fire nye for hooken),
`bun run lint` 0 errors, `bun run test:e2e` 3/3 — den siste kjørt fordi
`ResponsiveOverlay` nå pusher historikk **også på web**, og
`publish-listing.spec.ts` går gjennom `PublishedListingDialog`.

**Ikke verifisert:**

- **iOS-kantsveipen** — kun kodenivå. Den kan ikke observeres i nettleser i det
  hele tatt, og konflikten planen advarte mot (Embla-karusellene i
  `image-gallery`/`image-lightbox`, og kategori-chip-radene som starter i
  venstre kant) er **ikke** testet. Dette er den enkeltrisikoen i fase 3 jeg er
  minst trygg på.
- **Android-tilbakeknappen** — hele historikk-mekanismen er verifisert via
  `history.back()` i nettleser, som er det `native-offline.ts` faktisk kaller,
  men selve `backButton`-koblingen er ikke sett kjøre på enhet.
- Innloggede overlays (annonseveiviserens dialoger, meldingsflatene) er som før
  kun kodegjennomgått.

### Fase 4 — Formatfaktor: nettbrett som eget format (tiltak 10, 11) — ferdig 2026-08-10

**Gjort:**

1. **`useFormFactor(): "phone" | "tablet" | "web"`**
   (`src/hooks/use-form-factor.ts`) — `isNative()` + `matchMedia("(min-width:
768px)")`. Returnerer `"web"` på SSR og første render, av samme grunn som
   `useIsNative()`. Den lytter på `change` slik at iPad-rotasjon og Split View
   flytter appen mellom formatene uten reload.
2. `ResponsiveOverlay` **og** `ResponsiveOverlayContent` grener nå på
   `useFormFactor() === "phone"` i stedet for `useIsNative()`. Målt live på
   820×1180 med `?forcenative` (Del annonse-dialogen): **426 × 568 px sentrert**
   (`left: 190` av 820 — symmetrisk), ingen `rounded-t-2xl`. Før fasen var
   samme overlay en fullbredde bunn-skuff. På 375×812 er den fortsatt en
   375px-bred bunn-sheet med `rounded-t-2xl` — telefonoppførselen er uendret.
3. Faktarutenettet: `@sm:grid-cols-4` → `@md:grid-cols-4` i
   `vehicle/vehicle-info-grid.tsx` **og** `boat/boat-info-grid.tsx` (samme
   kopi, ikke nevnt i planen — jf. lærdommen i 10.4). Målt på 820px:
   containeren er 432px, og rutenettet er nå `191,1px × 2` i stedet for fire
   88px-celler. Kollisjonen i 3.3.2 er borte fordi kolonnene aldri blir
   trangere enn ~190px.
   De øvrige `@sm:`-rutenettene i `listing-detail/` er gjennomgått og lar
   stå: `listing-detail-view.tsx:897` (`@sm:grid-cols-3`) og
   equipment-listene (`@sm:grid-cols-2`) gir ≥120px celler med kort
   etikettinnhold — ingen av dem har feilen.

**Pensjonert:** den manuelle `!native ? <Dialog> : <Sheet>`-grenen i
`app-bottom-nav.tsx`s «Ny annonse»-velger — nå én `ResponsiveOverlay`.
Samtidig falt `pb-8` ut av `ResponsiveOverlayContent`s sheet-variant: den var
den siste rest-kompensasjonen for home indicator, og `side="bottom"` i
`sheet.tsx` har dekket den siden fase 2.

**Avvik fra planen:** ingen i sak. Planen nevnte bare kjøretøy-rutenettet;
båt-varianten er identisk og er fikset i samme slengen.

**Verifisert:** `bunx tsc --noEmit` rent, `bun run test` 223/223 (én ny sak i
`responsive-overlay.test.tsx`: native + nettbrettbredde → sentrert `Dialog`,
ikke sheet), `bun run lint` 0 errors, `bun run test:e2e` 3/3 (kjørt fordi
`publish-listing.spec.ts` asserter mot `PublishedListingDialog`, som er en
`ResponsiveOverlay`).

**Ikke verifisert:**

- **At formatbyttet faktisk skjer ved rotasjon/Split View.**
  `matchMedia`-lytteren kunne ikke bekreftes i nettleserverktøyet: en
  viewport-endring der oppdaterer `mq.matches` korrekt, men dispatcher aldri
  `change`-hendelsen (målt: 0 treff på en lytter armet før en 820→375-endring).
  Grenlogikken er bekreftet ved reload på begge bredder; selve
  _overgangen_ må ses på enhet. Dette er den enkeltrisikoen i fase 4 jeg er
  minst trygg på — og den treffer nettopp iPad-rotasjon, som fase 10 bygger på.
- Ad-picker-sheeten ligger fortsatt bak innlogging og er ikke sett åpen etter
  omskrivingen — kun kodegjennomgått. Innholdet (`AdPickerOptions`) er
  uendret; det som er byttet er hvilken primitiv som pakker det.
- Nettbrett-nedslaget på **innloggede** overlays (veiviserens dialoger,
  meldingsflatene) er som før kun kodegjennomgått.

### Fase 5 — Orientering: portrett-lås med unntak (tiltak 13) — kodeferdig 2026-08-10, venter på simulator

**Gjort:**

1. `@capacitor/screen-orientation@8.0.1` tatt inn, `bunx cap sync` kjørt — begge
   plattformprosjektene ser pluginen (11 plugins for iOS, samme for Android).
2. Ny `src/lib/orientation.ts` med `lockPortraitOnPhone()` og
   `unlockOrientation()`. Låsen kalles fra `setupNative()` ved oppstart, altså
   kun på native.
3. `ImageLightbox`: `unlockOrientation()` ved mount, `lockPortraitOnPhone()` ved
   **unmount** (ikke i lukkeknappen), slik at låsen kommer tilbake uansett
   hvilken vei galleriet forsvinner — X, tilbake-gest eller navigasjon.
4. `Info.plist` og `AndroidManifest.xml` er **uendret**, som planen forutsatte:
   plisten har allerede landskap på iPhone og alle fire på iPad, og manifestet
   setter ikke `android:screenOrientation`.

**Planens forutsetning er verifisert, ikke antatt:** pluginens
`ScreenOrientation.swift` lagrer `capViewController.supportedOrientations`
(som Capacitor initialiserer fra `UISupportedInterfaceOrientations`) og
_gjenoppretter_ nøyaktig den listen i `unlock()`. Fjernes landskap fra plisten,
gir `unlock()` altså fortsatt bare portrett — hele unntaksmekanismen henger på
at plisten beholder landskap, slik 8.2 slo fast.

**Avvik fra planen:** telefon/nettbrett-skillet i `orientation.ts` bruker
**korteste** skjermside mot 768px, ikke `useFormFactor()`s `min-width`. To
grunner: `setupNative()` og opprydningen i lightboxen er ikke React-kontekst, og
— viktigere — en telefon i landskap er 844px bred og ville blitt lest som
nettbrett av breddegrensen, nøyaktig i den tilstanden der vi skal låse tilbake
til portrett. Se funn 10.9.

**Pensjonert:** ingen, jf. seksjon 6 (plisten beholder alle orienteringer med
vilje).

**Verifisert:** `bunx tsc --noEmit` rent, `bun run test` 229/229 (seks nye i
`src/lib/orientation.test.ts`: låser på telefon, ikke på nettbrett, telefon i
landskap leses som telefon, `unlock` er no-op uten forutgående lås, og alt er
no-op på web), `bun run lint` 0 errors.

**Ikke verifisert:** **selve rotasjonsatferden — hele fasen.** Pluginen er en
no-op i nettleser (dynamisk import feiler og fanges), så `?forcenative`-
verktøyet kan ikke vise noe her; det er bare grenlogikken som er dekket av
enhetstestene. Simulator-verifiseringen fra planen står i sin helhet igjen:
roter i appen (skal ikke skje), åpne fullskjermbilde og roter (skal skje), lukk
(skal snappe tilbake), og gjenta på iPad (skal rotere fritt overalt). I tillegg
er ikke `requestGeometryUpdate`-veien (iOS 16+) vs. `lockLegacy` under iOS 16
prøvd — deployment target er iOS 15, så den gamle grenen finnes i praksis.

### Fase 6 — Bildevisning og zoom-policy (tiltak 14, 27) — kodeferdig 2026-08-10, venter på simulator

**Gjort:**

1. **Tiltak 27 utgikk — ingen kode skrevet.** Planen skulle sette
   `user-scalable=no` fra `setupNative()`. Kildegjennomgang av Capacitor 8 viste
   at zoom allerede er av: `zoomEnabled` er `false` som standard, og på iOS
   settes da `scrollView.delegate` til Capacitors egen handler som slår av
   `pinchGestureRecognizer` (`WebViewDelegationHandler.swift:338`), mens Android
   får `setBuiltInZoomControls(false)` (`Bridge.java:612`). Se funn 10.10.
   Konfigen er **ikke** endret heller — å skrive `zoomEnabled: false` er å
   konfigurere en verdi som allerede er standardverdien.
2. **Ny `src/components/listing-detail/zoomable-image.tsx`** — pinch-,
   dobbelttrykk- og panoreringszoom (1×–4×) på det aktive bildet, med
   sveip-ned-for-å-lukke når bildet ikke er zoomet. Ingen nytt bibliotek:
   rene `touch`-hendelser og én CSS-transform, slik planen ba om at ble
   forsøkt først. `ImageLightbox` bytter ut sin `<img>` med komponenten.
3. **Embla og zoom deler ikke gest.** Karusellen får
   `watchDrag: () => !zoomedRef.current`, altså dra-gesten slås av mens bildet
   er zoomet. Ref, ikke state — `reInit` ville hoppet karusellen tilbake til
   start. I tillegg settes `touch-action: none` på bildet mens det er zoomet.
4. **Trykk på bildet lukker ikke lenger galleriet på touch.** Det måtte det
   ikke: ett trykk lukket før, og da er dobbelttrykk-zoom uoppnåelig. Med mus
   (web) er oppførselen uendret — klikk på bildet lukker fortsatt. Skillet går
   på om et `touchstart` har vært innom komponenten, ikke på `useIsNative()`,
   så en touch-laptop på web oppfører seg som en telefon.

**Avvik fra planen:** planens punkt 4 (Dynamic Type som forutsetning) falt bort
sammen med tiltak 27, se 10.10. Punkt 3s «samspill med landskap-unlock fra fase
5» krevde ingen kode — `unlockOrientation()` ligger allerede i lightboxens
mount/unmount fra fase 5, og zoomtilstanden er lokal per bilde.

**Pensjonert:** ingen. `<img>`-en i lightboxen er erstattet av `ZoomableImage`,
som er den samme `<img>` med en transform rundt.

**Bonusfiks (fase 5-rest):** `orientation.ts` returnerte pluginobjektet fra en
async-funksjon. Capacitors web-proxy har en `then` som kaster `UNIMPLEMENTED`,
så auto-await-en ga en ufanget promise-rejection i dev-konsollen ved hver lås.
Importen er flyttet inn i hver funksjon; konsollen er ren for `ScreenOrientation`
etterpå (målt).

**Verifisert live** med `?forcenative` på 375×812, med syntetiske
`TouchEvent`-er mot ekte DOM (målt, ikke antatt):

- Dobbelttrykk i senter → `scale(2.5)`, og `touch-action` går fra `auto` til
  `none`. Nytt dobbelttrykk nullstiller.
- Pinch 200px → 400px avstand → `scale(2)`; pinch tilbake til 20px → klampes til
  `scale(1)` og transformen nullstilles.
- Panorering 900px ned-til-venstre ved `scale(2)` klampes til nøyaktig
  `translate3d(-187,5px, 338px)` — som er `(s-1)·bredde/2` og `(s-1)·høyde/2` for
  en 375×676-container.
- Sveip ned: bildet følger fingeren (`translate3d(0, 200px, 0)`) med fallende
  opasitet (0,73 ved 80px, 0,33 ved 200px), og galleriet lukkes ved slipp forbi
  120px.
- **Embla-grensen:** horisontal sveip mens bildet er zoomet lot telleren stå på
  `1 / 9`; samme sveip uzoomet flyttet den til `2 / 9`. `watchDrag` virker.
- Web (uten `?forcenative`, mus): klikk på bildet lukker fortsatt galleriet.

`bunx tsc --noEmit` rent, `bun run test` 234/234 (fem nye i
`zoomable-image.test.ts` for de to rene funksjonene `clampToBounds` og
`scaleAround`), `bun run lint` 0 errors.

**Ikke verifisert:**

- **Ekte multitouch på enhet.** Alt over er syntetiske `TouchEvent`-er. At
  WKWebView/Android WebView leverer de samme hendelsessekvensene — særlig
  overgangen to fingre → én finger midt i en pinch, og at `touch-action: none`
  faktisk stopper systemets egne gester — er ikke sett. Dette er den
  enkeltrisikoen i fase 6 jeg er minst trygg på.
- **Samspillet med iOS-kantsveipen fra fase 3.** En zoomet panorering som
  starter nær venstre kant kan tenkes å trigge tilbake-gesten. Ikke testbart i
  nettleser, og ikke prøvd.
- **At sidenivå-zoom faktisk er av på enhet.** Konklusjonen i punkt 1 er lest ut
  av Capacitors kildekode, ikke observert i simulator. Den bør bekreftes med et
  pinch-forsøk utenfor bildevisningen, siden hele bortfallet av
  fase 8-avhengigheten hviler på den.
- Gestlogikken er ikke e2e-dekket; Playwright-touchemulering ble ikke tatt inn
  for dette.

### Fase 7 — Native polish og gestkonsistens (tiltak 16, 17, 18) — kodeferdig 2026-08-10, venter på simulator

**Gjort:**

1. **CSS-polish (tiltak 16).** Ny `.native`-klasse settes på `<html>` fra
   `setupNative()` — altså kun i Capacitor-WebView-en (og under
   `?forcenative`), aldri på kaupet.no. Tre regler i `styles.css`:
   `-webkit-tap-highlight-color: transparent` og `overscroll-behavior: none` på
   roten, og `user-select: none` + `-webkit-touch-callout: none` på en
   **liste over interaktive elementer** (`button, a, [role="button"],
[role="tab"], label, nav, header, summary`), ikke globalt. Brødtekst,
   annonsebeskrivelser og meldinger er dermed fortsatt markerbare, slik planens
   punkt 1 krevde. Kortoverskrifter ligger inne i `<a>` og dekkes den veien.
2. **Draghåndtak + dra-for-å-lukke (tiltak 17).** `useSheetDrag` i
   `ui/sheet.tsx`, aktiv kun for `side="bottom"`. **`vaul` ble vurdert og valgt
   bort** (jf. planens eksplisitte bestilling): uten detents er gesten ~45
   linjer, og biblioteket ble fjernet som ubrukt i `UX-AUDIT-PLAN.md` fase 2.
   Trenger søkepanelet i fase 9 detents, er det der `vaul` eventuelt kommer
   tilbake — og da kan denne hooken erstattes.
   Tre detaljer som ikke var åpenbare i planen:
   - **Lukkingen går via en Escape-hendelse**, ikke en egen callback.
     `SheetContent` har ingen tilgang til `onOpenChange` (den ligger på `Root`),
     og Escape-veien gir gratis at sheets som bevisst blokkerer lukking med
     `onEscapeKeyDown` også blokkerer dra-gesten. Riktig oppførsel, mindre kode.
   - **Gesten starter ikke** hvis en scrollbar forelder under fingeren har
     `scrollTop > 0` — ellers ville dra-for-å-lukke stjålet scrollingen i de
     høye sheetene (`h-[80vh]`, `max-h-[85vh]`).
   - **Håndtaket er absolutt plassert** (`absolute left-1/2 top-2`), fordi
     bunn-sheetene spenner fra `p-0` til `p-6` — et håndtak i flyten ville
     flyttet innholdet ulikt i hver av dem.
     Terskel: 96px dratt, eller >0,5 px/ms sluppet.
3. **Pull-to-refresh (tiltak 18)** på `favoritter`, `varsler`,
   `meldinger.index` og `mine-annonser.index`. Hooken er brukt som den er.
   Spinner-markupen er trukket ut av `annonser.tsx` til
   `components/pull-to-refresh-indicator.tsx` — den var i ferd med å bli
   kopiert fem steder.

**Avvik fra planen:** planen (fase 9 punkt 3) anbefalte å utsette punkt 2 til
etter fase 9 og gjenbruke `vaul`-valget derfra. Det er overstyrt: håndrullet
gest uten detents er liten nok til å stå på egne ben, og den gir gevinsten nå
i stedet for etter planens største leveranse. Beslutningen er reversibel —
hooken er ~45 linjer i én fil.

**Pensjonert:** den innebygde spinner-markupen i `annonser.tsx`.

**Verifisert live** med `?forcenative` på 375×812 (målt i DOM):

- `.native` på `<html>`; `webkitTapHighlightColor: rgba(0,0,0,0)`;
  `overscroll-behavior: none`. `user-select` er `none` på en `<button>` og
  fortsatt `auto` på en `<p>` — skillet virker.
- Draghåndtaket måler 40 × 4 px, sentrert, 9px fra sheetens overkant.
- Dra-gest med syntetiske `TouchEvent`-er: bildet følger fingeren
  (`translate3d(0, 60px, 0)` → `40px`), et kort drag (40px) fjerner transformen
  og lar sheeten stå åpen, og et drag på 160px setter `data-state="closed"`.
- Pull-to-refresh på `/annonser` etter uttrekkingen: 200px dratt gir 48px
  indikatorhøyde og full opasitet, uendret fra før.

`bunx tsc --noEmit` rent, `bun run test` 237/237, `bun run lint` 0 errors,
`bun run test:e2e` 3/3.

**Ikke verifisert:**

- **Ekte touch.** Alt over er syntetiske hendelser. Særlig samspillet mellom
  dra-gesten og scrolling i en høy sheet (fingeren starter i toppen, drar ned,
  scroller så opp igjen) er ikke prøvd på enhet. Dette er den enkeltrisikoen i
  fase 7 jeg er minst trygg på.
- **Om exit-animasjonen faktisk overstyrer den inline-satte transformen** når
  en dratt sheet lukkes. CSS-animasjoner slår inline `style` i kaskaden, så
  slide-ut skal spille fra 0 uansett hvor langt brukeren dro — men det kunne
  ikke observeres, se 10.11.
- **`-webkit-touch-callout` og tap-highlight** er satt, men effekten (ingen
  kopimeny ved langtrykk, ingen grå rektangler på Android) kan bare ses på
  enhet.
- Innloggede flater (de fire nye pull-to-refresh-rutene) er **ikke** sett
  kjøre — gesten er verifisert på `/annonser`, som bruker nøyaktig samme hook
  og komponent, men de fire rutenes egne `resetQueries`-nøkler er kun
  kodegjennomgått.

### Fase 8 — Dynamic Type (tiltak 19) — kodeferdig 2026-08-10, venter på simulator

**Mekanisme valgt (planens «stopp ved første som holder»):** planens tre
kandidater ble gjennomgått i rekkefølge, og svaret er **ulikt per plattform**
— noe planen ikke forutså (se 10.12).

- **`-webkit-text-size-adjust` — forkastet.** Den styrer WebKits egen
  autosizing av smale tekstkolonner, ikke Dynamic Type. Å sette den ville ikke
  koblet noe til brukerens innstilling.
- **`font: -apple-system-body` — valgt for iOS.** Den systemdefinerte fonten
  _er_ Dynamic Type: 17px ved standard, og den vokser/krymper med brukerens
  valg. `src/lib/text-scale.ts` måler den på et skjult element, deler på 17 og
  setter `html { font-size }` til `16px × skala`. Appen bruker `rem`
  gjennomgående, så resten følger med.
  Den settes **ikke** som `:root { font: -apple-system-body }` direkte: det
  ville også byttet font-family til systemfonten og flyttet baseline fra 16 til
  17px (hele appen 6 % større ved standardinnstilling). Måling + eksplisitt
  `font-size` holder typografien uendret ved skala 1.
- **Native opplesning av tekstskalaen — ikke nødvendig.** Den ville krevd en
  egen plugin, og dekker ikke noe de to over ikke dekker.
- **Android er en bevisst no-op.** Android WebView skalerer allerede all tekst
  etter systemets fontskala (`textZoom` avledes fra `Configuration.fontScale`).
  Gjør vi noe der, ganges skalaen med seg selv. Se 10.12.

**Detaljer:**

- Skalaen er klampet til **0,8–2,0**. Taket er WCAG 1.4.4s 200 %; iOS' største
  tilgjengelighetsstørrelser går til ~3,1×, men layouten er ikke verifisert
  over 200 %. Merket med en `ponytail:`-kommentar i filen.
- Måler `CSS.supports("font", "-apple-system-body")` først og returnerer `null`
  ellers. Uten den guarden ville enhver ikke-Apple-nettleser målt 16px mot
  basis 17 og krympet appen 6 % — «ignorert deklarasjon» lest som et
  brukervalg.
- Dynamic Type endres i Innstillinger, altså mens appen er i bakgrunnen. Ingen
  `resize` fyrer av det, så vi måler på nytt på `appStateChange` (isActive)
  fra `@capacitor/app`, som allerede er en avhengighet.

**Pensjonert:** ingen.

**Verifisert:** `bunx tsc --noEmit` rent, `bun run test` 237/237 (tre nye i
`src/lib/text-scale.test.ts`: klampingen, at en ukjent systemfont gir `null`
i stedet for 0,94, og at 34px leses som skala 2), `bun run lint` 0 errors.
Live med `?forcenative`: `CSS.supports(...)` er `false` i Chrome, og
rot-`font-size` står uendret på 16px — altså at guarden gjør jobben sin.

**Ikke verifisert:** **hele mekanismen på enhet.** Chrome kjenner ikke
`-apple-system-body`, så `?forcenative`-verktøyet kan per definisjon ikke vise
noe her — det kan bare bekrefte at ingenting skjer på web. Simulator-
verifiseringen står i sin helhet igjen: sett tekststørrelse til største
ikke-tilgjengelighetsverdi og deretter til en tilgjengelighetsverdi i iOS-
innstillingene, og sjekk at (a) appen faktisk skalerer, (b) den skalerer på
nytt ved retur til forgrunn uten omstart, og (c) at ingenting brekker ved
200 %, særlig i veiviseren og bunnavigasjonen. Antakelsen om at Android
allerede dekkes av `textZoom` er lest ut av plattformdokumentasjonen, ikke
observert — den bør bekreftes på en Android-enhet før fase 8 regnes som ferdig.

### Fase 9 — Søkepanel og navigasjonsomlegging (tiltak 24, 25, 26, + 28) — kodeferdig 2026-08-10, venter på simulator

**Gjort — 9a (søkepanelet):**

1. **`src/features/listing-search/search-panel/`** med fire filer:
   `search-panel.tsx` (panelet), `filter-sections.tsx` (parameterfanene),
   `search-summary-pill.tsx` (pillen + `countActiveFilters`) og
   `search-history.ts` (nylige søk, flyttet ut av det slettede overlayet med
   **uendret** localStorage-nøkkel, så brukerens historikk overlever byttet).
2. **`vaul@1.1.2` tatt inn**, slik planen forutsatte, med `snapPoints={[0.6, 1]}`.
   Målt live: `--snap-point-height: 324,8px` på 375×812, altså detenten treffer.
   Bruken er **begrenset til panelet** — se avviket under.
3. **Sammenslåingen er reell, ikke en tredje flate.** Panelet har to modus i én
   komponent: uten `results` er det gamle `NativeSearchOverlay` (fritekst,
   historikk, kategoriliste, `resolveTextToFilters` ved innsending); med
   `results` er det gamle `NativeAdvancedSearch` over en resultatliste.
   Fritekstfeltet er felles og ligger øverst i begge. Søkelogikken selv
   (`resolve-text-to-filters.ts`, `search-schema.ts`, `category-filters.ts`) er
   urørt, jf. planens punkt 2.
4. `useOverlayHistory` fra fase 3 er koblet på. Målt: åpning pusher nøyaktig én
   `{overlay:true}`-oppføring, `history.back()` setter `data-state="closed"` og
   returnerer historikken til ruterens egen tilstand.

**Gjort — 9b (navigasjon og resultatside):**

5. Bunnavigasjonens fane 1 er **«Søk»** (forstørrelsesglass-ikon, `k.`-merket
   når man står der). Ruten er fortsatt `/` — forsiden _er_ søkeflaten etter
   punkt 7, jf. begrunnelsen i 8.3 om at den ikke har selvstendig innhold ved
   siden av søk. Midtknappen er uendret «Ny annonse».
6. `/annonser` **og kategorilandingssidene** viser nå én `SearchSummaryPill`
   («volvo · 1 filter») i stedet for søkelinje + chip-rad. `ActiveFilters`-raden
   under står igjen, så aktive kriterier er fortsatt synlige _og_ fjernbare uten
   å åpne panelet — planens advarsel mot å bytte trangt UI mot skjult tilstand.
7. Forsidens søkefelt er en **trigger** for panelet, ikke et inndatafelt.
   Den roterende eksempelteksten er beholdt.
8. **Tiltak 28 (funn 10.2) tatt med her**, som planen foreslo: «fjern
   lokasjon»-krysset på forsiden er flyttet ut av chip-knappen til en
   søsken-`<button>` med 44px trykkflate. Den ugyldige nestingen av et
   interaktivt element i et annet er dermed borte.

**Avvik fra planen:**

- **`native-advanced-search.tsx` er ikke slettet.** Planen (seksjon 6) sa «hele
  filen». Den brukes også av `mine-sok.tsx` til å redigere et _lagret_ søk, som
  ikke har noen resultatflate å legge et panel over — se funn 10.14. Filen er i
  stedet tømt for seksjonene (som nå bor i `filter-sections.tsx` og deles med
  panelet) og krympet fra 484 til ~155 linjer.
- **`native-filter-chips.tsx` er slettet**, som planen ikke nevnte — pillen
  erstatter hele chip-raden, så filen hadde ingen kallsteder igjen.
- **`useSheetDrag` i `ui/sheet.tsx` er ikke erstattet av `vaul`**, slik planens
  fase 9 punkt 3 åpnet for. `Sheet` støtter fire sider og er Radix-Dialog-basert;
  å porte den ville vært en omskriving av ~13 kallsteder for null synlig gevinst
  (dra-for-å-lukke virker allerede). `vaul` er tatt inn kun der detents faktisk
  trengs.
- **Resultattellingen oppdateres ikke live mens man justerer.** Planens 9a
  punkt 1 ba om det. Panelet beholder utkast-modellen fra
  `useAdvancedSearchValue`/`handleApply` (endringer committes ved «Vis N treff»),
  så tellingen i bunnknappen er de _anvendte_ kriterienes. Live telling ville
  krevd enten en navigering per tastetrykk i prisfeltene eller en egen
  telle-query mot utkastet — begge er større enn resten av fasen til sammen.
  Delvis dekket i mellomtiden: `attributeCounts` viser fortsatt treff per
  alternativ inne i panelet. Merket som kjent forenkling.

**Regresjon som ble unngått underveis:** da chip-raden forsvant, ble
kategoriens **primærfiltre** (Merke, Modell, Årsmodell, Kilometerstand)
utilgjengelige — panelets «Mer»-fane rendret `SecondaryCategoryFilters`, som
per navn dropper dem. Løst med en `includePrimary`-opt-in på den komponenten,
brukt kun av panelet. Verifisert live på `/annonser?category=bil`: «Mer»-fanen
lister Merke, Modell, Årsmodell, Kilometerstand, Drivstoff osv.

**Verifisert live** med `?forcenative` på 375×812 (målt i DOM, ikke antatt):

- Forsiden: trykk på søkefeltet åpner panelet på 0,6-detenten med draghåndtak,
  fritekstfelt og hele kategorilisten.
- `/annonser?q=volvo&min=1000`: pillen leser «volvo» + «1 filter», og
  `aria-label` er «Endre søk: volvo, 1 filter».
- Panelet over resultatlisten: fanene Kategori · Pris · Sted · Mer · Søk,
  feltet forhåndsutfylt med «volvo», bunnknappen «Vis 1 treff».
- **Anvendelse ende-til-ende:** Pris → «Fra 50000» → «Vis 1 treff» skrev
  `min=50000` til URL-en, beholdt kategorien, lukket panelet, og pillen
  oppdaterte seg til «1 filter».
- Android-tilbake (`history.back()`): panelet lukkes, brukeren blir stående på
  `/annonser`.

`bunx tsc --noEmit` rent, `bun run test` 242/242 (fem nye for
`countActiveFilters`), `bun run lint` 0 errors, `bun run test:e2e` 3/3 — den
siste kjørt fordi `browse-search.spec.ts` og annonse-wizarden treffer
søkeflatene, og fordi kategorilandingssidenes web-gren ble flyttet i treet.

**Ikke verifisert:**

- **Selve dragingen mellom detents på ekte touch.** Snap-punktet er bekreftet
  regnet ut riktig, men gesten — velocity-snap, at panelet ikke stjeler
  scrollingen i en lang filterliste, og samspillet med iOS-kantsveipen fra
  fase 3 — er ikke prøvd. Dette er den enkeltrisikoen i fase 9 jeg er minst
  trygg på.
- **Native e2e-dekning ble ikke skrevet**, selv om planen eksplisitt anbefalte
  å bruke fase 0-overstyringen til det _før_ de gamle overlayene ble slettet.
  Grunnen er at panelet er `vaul`-drevet, og verktøyet kan ikke observere
  inn-/ut-animasjoner (funn 10.11) — en Playwright-spec ville måttet vente på
  en transform som aldri settes i den kjøringen. Dette er en reell gjeld fra
  denne fasen, ikke en bortprioritering: den bør tas når panelet er sett virke
  på enhet.
- **Innloggede tilstander i panelet** — «Lagre»-knappen og `SaveSearchDialog`
  er kun kodegjennomgått, som alle innloggede flater i denne planen.
- `mine-sok.tsx` sin bruk av den krympede `NativeAdvancedSearch` er
  typesjekket og kodegjennomgått, men ikke sett kjøre (ligger bak innlogging).

### Fase 10 — Nettbrettoppsett (tiltak 12, 22) — kodeferdig 2026-08-10, venter på simulator

**Gjort:**

1. **Sidestilt navigasjon (rail).** `AppBottomNav` grener på
   `useFormFactor() === "tablet"`: samme fem elementer, samme tilstand, samme
   ruter — kun containerklassene og `itemClass` skiller (rad → kolonne,
   flytende pille → 80px full-høyde rail langs venstre kant med `pl-safe`).
   Ingen parallell navigasjonskomponent, slik planen krevde. FAB-ens `-mt-7`
   droppes i railen; det er ingen kant å stikke opp av.
2. **Plassreservasjonen er flyttet, ikke duplisert.** Railen setter
   `.nav-rail` på `<html>`, og `styles.css` lar den klassen nulle
   `--app-bottom-nav-h` og gi `.pb-bottom-nav` venstre- i stedet for
   bunnpadding. Det gjør at alle flatene som allerede regner høyder fra den
   variabelen (annonseveiviseren, meldingstråden, resultatlistens FAB,
   toast-offset) følger med uten egne endringer — se funn 10.16.
3. **Forsiden:** heroen får en øvre ramme på nettbrett (`min-h-[40vh] pt-10`
   mot telefonens `min-h-[68vh] pt-24`), søkefeltet `max-w-xl`, og «Populært
   nå» er et `grid-cols-3`-rutenett i stedet for `w-[60%]`-karusellen.
   Kategorirutenettet er urørt, som planen sa.
4. **Meldinger side om side:** `InboxPage` er eksportert fra
   `meldinger.index.tsx` og rendres som en 20rem venstrespalte i
   `meldinger.$id.tsx` når formatet er `tablet`. Rent layoutgrep over
   eksisterende komponenter — ingen ny meldingslogikk, ingen ny rute.
   Trådens `NativePageHeader` får `hideBack` i den modusen; listen ved siden av
   _er_ tilbakeveien.
5. **Søkepanelet på nettbrett** (fase 9 punkt 5): `Drawer.Content` får
   `mx-auto w-full max-w-2xl border-x`. Målt på 1024px: **672px bred, sentrert**,
   med resultatlisten synlig på begge sider — i stedet for en fullbredde skuff.
   Primitiven er bevisst _ikke_ byttet: detent-dragingen er hele poenget med
   panelet og skal virke likt i begge formater.

**Avvik fra planen:** ingen i sak. Ett tillegg planen ikke nevnte:
annonseveiviserens faste bunnlinje (`fixed inset-x-0`) fikk
`left-[var(--app-nav-rail-w,0px)]`, ellers havner «Tilbake» under railen
(`justify-between` legger den helt til venstre). Variabelen er udefinert på
telefon, så fallbacken gjør regelen til en no-op der.

**Pensjonert:** `max-w-md`-bunnpillen på nettbrett — den finnes fortsatt, men
kun i telefongrenen. Ingen fil slettet; det er én komponent med to
presentasjoner, ikke to komponenter.

**Verifisert live** med `?forcenative` (målt i DOM, ikke antatt):

- 820×1180 og 1024×1366: `<html class="native nav-rail">`, railen 80×full
  høyde med `aria-label="Hovednavigasjon"`, `main` har `padding-left: 80px` og
  `padding-bottom: 0`. På `/annonser` starter den klebrige headeren riktig
  etter railen.
- 375×812 (regresjonssjekk): `<html class="native">` uten `nav-rail`, pillen
  fortsatt 351×88,5 px, `padding-bottom: 96px`, `padding-left: 0`.
  Telefonoppsettet er uendret.
- Søkepanelet på 1024: `672 × …`, sentrert (`left: 66,5` av 805px klientbredde).
- **320×768 (Split View / Slide Over, planens punkt 6):** første gang appen er
  sett under 375px. `document.scrollWidth === 320` — ingen horisontal
  sidescroll. Eneste elementer som stikker utenfor er «Populært nå»-karusellens
  kort, som er en tiltenkt scrollcontainer. Formatet leses som `phone`, altså
  bunnpille, som er riktig på 320pt.

`bunx tsc --noEmit` rent, `bun run test` 242/242, `bun run lint` 0 errors,
`bun run test:e2e` 3/3.

**Ikke verifisert:**

- **At formatbyttet skjer live ved rotasjon/Split View.** Grenlogikken er
  bekreftet ved reload på hver bredde, men `matchMedia`-lytteren kan ikke
  observeres i dette verktøyet (funn 10.7) — og fase 10 er nettopp fasen som
  hviler på den. Dette er den enkeltrisikoen i fase 10 jeg er minst trygg på.
- **Android nettbrett** (planens punkt 5) — ikke sett. `useFormFactor()` er
  breddebasert og plattformnøytral, så det _bør_ stemme, men planen sa
  eksplisitt at det skal verifiseres og ikke antas. Det står igjen.
- **Meldingsoppsettet** ligger bak innlogging og er kun typesjekket og
  kodegjennomgått, som alle innloggede flater i denne planen. Aktiv samtale
  markeres **ikke** i listen — en kjent forenkling, ikke et oversett krav.
- **Søkepanelets posisjon vertikalt** (om «Vis N treff» er nåbar på 0,6-
  detenten) kunne ikke måles: drawerens transform står i startkeyframen i dette
  verktøyet, jf. funn 10.11. Kun bredde/sentrering er målt.

### Fase 11 — Oppstart og opprydding (tiltak 21, 23) — kodeferdig 2026-08-10, venter på simulator

**Gjort:**

1. `launchAutoHide: false` + `launchFadeOutDuration: 200` i
   `capacitor.config.ts`. `SplashScreen.hide()` kalles nå fra
   `hideNativeBootSplash()` (`src/lib/native.ts`) — altså **på samme sted som
   boot-overlayet allerede fjernes**, i effekten som kjører etter at
   native-layouten faktisk har malt. Den faste 2s-ventetiden fra funn 3.8 er
   dermed borte. `@capacitor/splash-screen` var allerede en avhengighet, men
   ubrukt; ingen ny pakke.
2. **Fallback:** når splashen ikke lenger skjuler seg selv, ville en feilende
   oppstart låst appen på splash-skjermen. `offline.html` (Capacitors
   `errorPath`) kaller derfor `SplashScreen.hide()` selv, via
   `window.Capacitor.Plugins`.
3. `UIRequiredDeviceCapabilities`-blokken (`armv7`) er fjernet fra
   `Info.plist` — 32-bit-verdi mot et iOS 15-deployment target (2.2).
   `plutil -lint` bekrefter at plisten fortsatt er gyldig.
4. **Tiltak 23 er ikke tatt**, som planen krevde: bundlet web-bygg er en
   arkitekturbeslutning med egen ADR, ikke et UX-tiltak, og skal ikke smugles
   inn her.

**Pensjonert:** ingen.

**Verifisert:** `bunx tsc --noEmit` rent, `bun run test` 242/242,
`bun run lint` 0 errors.

**Ikke verifisert:** **hele fasen på enhet.** Splash-timing finnes ikke i
nettleser — `?forcenative` kan ikke vise noe her, og
`import("@capacitor/splash-screen")` er en fanget no-op der. Det som må ses i
simulator: (a) at appen faktisk starter raskere med varm WebView, (b) at
splashen **forsvinner** — dette er fasen med størst «app henger på
splash»-risiko i hele planen hvis `hide()` av en eller annen grunn ikke nås,
og (c) at offline-fallbacken i punkt 2 virker (slå av nettet, kaldstart).
Fjerningen av `UIRequiredDeviceCapabilities` er ikke bygget i Xcode.

---

## 10. Funn oppdaget underveis

_Nye funn som dukker opp under implementering føres inn her med dato og
hvilken fase de ble oppdaget i, og prioriteres inn i tiltakslisten i
seksjon 4 — de skal ikke bare nevnes i en commit-melding._

### 10.1 `?forcenative` gir hydreringsavvik i dev (fase 0, 2026-08-10)

Serveren SSR-er alltid `native={false}` (den kjenner ikke søkeparameteren), så
klienten hydrerer en annen trestruktur og React logger «Hydration failed» +
klientrendrer på nytt. Konsekvensen i praksis er kun konsollstøy i dev —
layouten blir korrekt. Verdt å vite når konsollen leses under senere faser, så
det ikke jaktes som en ekte feil.

I tillegg logger `@capacitor/keyboard` `UNIMPLEMENTED` gjentatte ganger, siden
native-grenen kaller plugins som ikke finnes på web. Samme kategori: forventet
støy fra overstyringen, ikke en regresjon.

**Ikke prioritert inn i tiltakslisten** — å fikse det ville kreve at
overstyringen leses server-side også, hvilket er mer maskineri enn et
dev-verktøy fortjener.

### 10.2 Interaktivt element inne i interaktivt element på forsidens lokasjons-chip (fase 1, 2026-08-10)

`app-landing.tsx`: «fjern lokasjon»-krysset er et `<span role="button"
tabIndex={0}>` **inne i** `<button>`-chipen. Ugyldig nesting, og en sannsynlig
medvirkende årsak til at knappen ble lest uten tilgjengelig navn (3.7). Tiltak
20 er løst med en eksplisitt `aria-label` på ytterknappen, men nestingen står
igjen. Krysset er dessuten ~18px, altså under 44px.

**Foreslått som nytt tiltak 28** (Liten, Middels): flytt krysset ut som en
søsken-`<button>` ved siden av chipen, med ≥44px trykkflate. Passer naturlig
inn i fase 9, som uansett bygger om forsidens søkeinngang.

### 10.3 Horisontal safe area forverrer tittelbrytingen i `NativePageHeader` (fase 2, 2026-08-10)

Med simulert notch (47px venstre og høyre) ble headerens tittelfelt ~94px
smalere, og «2021 Volvo V90 cross country» brøt over **fire** linjer i stedet
for to. Funn 3.2.4 er altså ikke bare et landskapsproblem — `pl-safe`/`pr-safe`
fra denne fasen gjør det målbart verre i nettopp den orienteringen der begge
slår inn samtidig.

**Ikke et nytt tiltak** — det er allerede dekket av fase 3 punkt 3
(`line-clamp-1`). Notert her fordi det hever prioriteten: fase 3 bør ikke
utsettes bak fase 2 lenge, ellers er landskap dårligere enn før denne fasen.

**Lukket i fase 3** (`line-clamp-1` er på plass, målt til én linje på 375px).

### 10.4 `map-overlay.tsx` hadde samme lokale historikk-kopi (fase 3, 2026-08-10)

Funn 3.2.2 slo fast at «det er ett sted som gjør det riktig og sju som ikke
gjør det». Det var to: `map-overlay.tsx:23-30` hadde en nesten identisk kopi av
`image-lightbox`-mønsteret (uten opprydning ved lukking via X, siden alle
lukkeveier gikk via `history.back()`). Begge er pensjonert i fase 3.

Poenget generalisert: når en plan teller kallsteder fra ett funn, er tellingen
verdt å `grep`-e opp på nytt ved implementering — funnet var riktig i sak, men
underrapporterte omfanget.

### 10.5 Lazy-lastede overlays lekker en historikk-oppføring (fase 3, 2026-08-10)

Planen beskrev `useOverlayHistory` som en ren uttrekking av
`image-lightbox`-logikken. Det holdt ikke: `ImageLightbox` lastes med
`React.lazy` bak `Suspense` (`listing-detail-view.tsx:69`), og effekten kjøres
**to ganger** rundt at chunken løses — montert, avmontert, montert igjen.
Målt i dev: `push → back → push` ved én åpning, med to `overlay`-oppføringer
igjen i stacken, altså to tilbake-trykk for å komme forbi galleriet.

`history.back()` er asynkron, så en rent komponentlokal opptelling kan ikke
løse dette. Hooken teller derfor åpne overlays på **modulnivå** og utsetter
opprydningen én tick, slik at en umiddelbar remontering overtar den eksisterende
oppføringen i stedet for å pushe en ny. Målt etter fiksen: nøyaktig én `push`
ved åpning og én `back` ved lukking.

**Kjent tak** (markert med en `ponytail:`-kommentar i hooken): alle samtidig
åpne overlays deler én oppføring, så et tilbake-trykk lukker et nøstet overlay
og forelderen samtidig. Ingen flate i appen har nøstede overlays i dag; telles
per nivå hvis det endrer seg.

### 10.6 Android-tilbake under onboarding avslutter fortsatt appen (fase 3, 2026-08-10)

Fase 3 bevarer med vilje at onboardingen ikke kan lukkes med tilbake
(`historyBack={false}`, jf. planens punkt 1). Konsekvensen er den samme som
funn 3.2.2 beskrev: siden onboardingen ligger på rot-ruten uten egen
historikk-oppføring, går `backButton` → `window.history.back()` →
`App.exitApp()` i `native-offline.ts:46-56`, altså **avslutter appen**.

Det er ikke verre enn før fase 3, men det er heller ikke løst. Riktig oppførsel
er trolig at tilbake-trykk under onboarding går ett kort tilbake, og er en
no-op på første kort.

**Foreslått som nytt tiltak 29** (Liten, Middels): la `OnboardingFlow` selv
håndtere `backButton`/`popstate` til kortnavigasjon. Passer inn hvor som helst;
ingen avhengighet til øvrige faser.

### 10.7 `?forcenative`-verktøyet kan ikke verifisere formatoverganger (fase 4, 2026-08-10)

Nettleserverktøyets viewport-endring oppdaterer `window.matchMedia(...).matches`,
men dispatcher ikke `change`-hendelsen (målt: en lytter armet før en
820→375-endring fikk 0 treff, mens `matches` gikk fra `true` til `false`).
Konsekvensen er at `useFormFactor()`s _grenlogikk_ kan bekreftes ved reload på
hver bredde, men ikke selve **overgangen** telefon ↔ nettbrett.

Det rammer alt som avhenger av live breddeendring: iPad-rotasjon, Split View
og Slide Over — altså kjernen i fase 10. Verktøyet fra fase 0 er fortsatt
riktig valg, men grensen bør være kjent så den ikke antas dekket.

**Ikke et nytt tiltak** — det er en begrensning i verifiseringen, ikke i
appen. Konkret konsekvens: fase 10 punkt 6 (Split View) må kjøres i simulator,
og bør også kontrollere at rotasjon faktisk bytter format.

### 10.8 `boat-info-grid.tsx` hadde samme `@sm:grid-cols-4`-feil (fase 4, 2026-08-10)

Funn 3.3.2 pekte kun på kjøretøy-faktarutenettet. `boat/boat-info-grid.tsx`
er en nesten identisk kopi med samme `grid-cols-2 gap-4 p-4 @sm:grid-cols-4`,
og hadde derfor nøyaktig samme kollisjonsrisiko på nettbrett-bredder. Begge er
fikset i fase 4.

Samme lærdom som 10.4, andre gang i denne planen: **tellingen i et funn er et
utgangspunkt, ikke et fasit — `grep` den opp på nytt ved implementering.**

### 10.9 `useFormFactor()`s breddegrense leser telefon i landskap som nettbrett (fase 5, 2026-08-10)

`useFormFactor()` er `min-width: 768px`. En iPhone i landskap er 844px bred og
returnerer derfor `"tablet"`. For fase 4s bruk (velge dialog vs. bunn-sheet) er
det forsvarlig — på en 844×390-skjerm _er_ en sentrert dialog riktigere enn en
fullhøyde skuff. For orienteringslåsen er det direkte feil: den tilstanden er
nøyaktig der vi skal låse tilbake til portrett.

`orientation.ts` bruker derfor korteste skjermside i stedet. Ikke et nytt
tiltak, men verdt å kjenne før fase 10: **`useFormFactor()` er en
_layout_-akse, ikke en enhetsklassifisering.** Trenger fase 10 å vite hva slags
enhet appen faktisk kjører på (f.eks. for sidenavigasjon), er breddegrensen
alene ikke svaret.

### 10.10 Sidenivå-zoom var allerede av på native (fase 6, 2026-08-10)

Funn 3.5.1 og beslutning 8.4 bygget på at `viewport`-metaen i `__root.tsx`
verken setter `maximum-scale` eller `user-scalable=no`, og at WKWebView derfor
tillater sidenivå-pinch. Metaen stemmer, konklusjonen gjør det ikke: Capacitor
slår av zoom i WebView-en uavhengig av metaen, og `zoomEnabled` er **`false`
som standard** (`@capacitor/cli` `declarations.d.ts`, `@default false`).

- iOS: er `zoomingEnabled` falsk, settes `webView.scrollView.delegate` til
  Capacitors `WebViewDelegationHandler`, som i `scrollViewWillBeginZooming`
  skrur av `pinchGestureRecognizer` (`WebViewDelegationHandler.swift:338`).
- Android: `settings.setBuiltInZoomControls(config.isZoomableWebView())`
  (`Bridge.java:612`) — altså `false`, som også slår av pinch.

Tre konsekvenser:

1. **Tiltak 27 utgår.** Det er ingenting å slå av, og å sette `zoomEnabled:
false` i `capacitor.config.ts` er å konfigurere standardverdien.
2. **Avhengigheten 27 → 19 (fase 6 → fase 8) bortfaller.** Fase 6 fjerner ikke
   noen forstørrelsesmulighet brukeren hadde, og gjør derfor ingenting
   dårligere tilgjengelig. Fase 6 kunne leveres alene.
3. **Men tilgjengelighetshullet er større enn planen trodde, ikke mindre.**
   Appen har aldri hatt zoom på native, og Dynamic Type virker ikke (3.7). WCAG
   1.4.4 er altså brutt i dag, ikke først etter fase 6. Tiltak 19 beholder
   prioritet **Høy** av den grunn — begrunnelsen er bare en annen enn 8.4 anga.

Samme lærdom som 10.4 og 10.8, tredje gang: **et funn utledet fra én fil
(`__root.tsx`) må sjekkes mot laget under før det gjøres til en beslutning.**

### 10.11 `?forcenative`-verktøyet kan ikke observere inn-/ut-animasjoner (fase 7, 2026-08-10)

Når nettleserpanelet er skjult, pauser kompositoren CSS-animasjoner: en åpnet
bunn-sheet ble målt til `data-state="open"` med `currentTime: 0` på
`enter`-animasjonen, altså fortsatt i startkeyframen 100px under skjermkanten.
Det samme gjelder exit-animasjonen — et lukket overlay blir stående montert.

Konsekvensen for fase 7 er konkret: at slide-ut-animasjonen overstyrer den
inline-satte drag-transformen kunne ikke observeres, bare utledes fra
kaskaderekkefølgen (animasjoner slår inline `style`). Konsekvensen generelt:
**alt som avhenger av at en animasjon faktisk spilles, må måles på tilstand
(`data-state`, klasser), ikke på posisjon.** Posisjonsmålinger av et
animerende element i dette verktøyet er verdiløse.

**Ikke et nytt tiltak** — en begrensning i verifiseringen, som 10.7.

### 10.12 Dynamic Type har to ulike svar, ett per plattform (fase 8, 2026-08-10)

Funn 3.7 slo fast at «WKWebView og Android WebView respekterer ikke systemets
tekstskala for en webapp». Det stemmer for iOS, men **ikke for Android**:
Android WebView setter `textZoom` fra `Configuration.fontScale`, altså skalerer
den all tekst etter systeminnstillingen uten at appen gjør noe.

Konsekvensen er at fase 8 er iOS-only, og at en plattformnøytral
implementering ville vært aktivt skadelig: skalaen ville blitt ganget med seg
selv på Android (en bruker på 1,3× ville fått 1,69×).

Lærdommen er den samme som 10.4/10.8/10.10, fjerde gang, men i en ny variant:
**et funn som slår sammen to plattformer i én setning må splittes før det blir
en implementering.**

### 10.13 Tre bunn-sheets har fortsatt håndrullet `pb-8` (fase 7, 2026-08-10)

Fase 2 fjernet `pb-8`-kompensasjonen i `app-bottom-nav.tsx`s ad-picker fordi
`sheet.tsx` `side="bottom"` nå padrer home indicator-sonen selv. Samme
kompensasjon står igjen tre steder: `messages-button.tsx:273`,
`notifications-bell.tsx:356` og `meg.tsx:230`. De er ikke ødelagte — 32px er
mer enn `max(24px, safe-area)` på alle nåværende enheter — men de overstyrer
primitiven og er nøyaktig mønsteret seksjon 6 advarer mot.

Femte forekomst av samme lærdom (10.4, 10.8, 10.10, 10.12): **tellingen i et
funn er et utgangspunkt, ikke en fasit.**

**Foreslått som nytt tiltak 30** (Triviell, Lav): fjern `pb-8` fra de tre.
Ikke gjort i fase 7 fordi to av tre ligger bak innlogging og dermed ikke kan
verifiseres i denne runden.

### 10.14 `native-advanced-search.tsx` kunne ikke slettes — lagrede søk har ingen resultatflate (fase 9, 2026-08-10)

Seksjon 6 slo fast at fase 9 skulle slette **hele** filen. Tellingen var basert
på funn 8.3, som bare så på de to native søkeflatene over resultatlistene.
`grep` ved implementering fant en tredje bruker: `mine-sok.tsx` åpner den for å
redigere kriteriene til et **lagret** søk (`hideSaveAction`, `applyLabel`, og
`location` som del av utkastet i stedet for eid av søkefeltet).

Det er ikke samme oppgave som panelet løser. Panelets hele premiss er at
brukeren justerer filtre _mens resultatlisten er synlig bak_ — ved redigering
av et lagret søk finnes ingen slik liste, og en skuff som dekker 60 % av en
ellers tom skjerm ville vært verre enn dagens fullskjermflate.

Løsningen ble å dele det som faktisk er felles: seksjonene bor nå i
`search-panel/filter-sections.tsx` og rendres av begge. `NativeAdvancedSearch`
er redusert fra 484 til ~155 linjer og er kun header + bunnknapper rundt dem.
Ingen duplisert filterlogikk står igjen — det var det pensjoneringsregelen i
seksjon 6 faktisk skulle beskytte mot.

**Ikke et nytt tiltak.** Lærdommen er en variant av 10.4/10.8/10.10/10.13,
sjette gang: **en pensjoneringsliste skrevet fra et funn må `grep`-es opp på
nytt ved implementering — «hele filen» var riktig for to av tre kallsteder.**

### 10.15 Panelet gjorde kategoriens primærfiltre uttilgjengelige (fase 9, 2026-08-10)

Da chip-raden ble erstattet av sammendrag-pillen (tiltak 26), forsvant den
eneste inngangen til kategoriens **primærfiltre** — Merke, Modell, Årsmodell,
Kilometerstand. Panelets «Mer»-fane rendret `SecondaryCategoryFilters`, som per
navn og implementering (`splitPrimaryFilters(filters).secondary`) dropper
nettopp dem. Planen forutsatte implisitt at chip-raden fortsatt fantes ved
siden av panelet; det gjør den ikke etter tiltak 26.

Fikset i samme fase med en `includePrimary`-opt-in på
`SecondaryCategoryFilters`, brukt kun av panelet — desktop-flatene beholder
splitten, siden de fortsatt har sin egen primær-chip-rad.

**Ikke et nytt tiltak** (lukket i fase 9). Notert fordi det generaliserer:
**når to UI-flater deler ansvar for å eksponere et sett, kan ikke den ene
fjernes uten å sjekke hva den andre bevisst utelot.**

### 10.16 `--app-bottom-nav-h` er appens de facto layoutkontrakt (fase 10, 2026-08-10)

Planen beskrev fase 10 punkt 1 som «samme rutedefinisjoner, annen
presentasjon». Det stemmer for selve navigasjonen, men undervurderte hvor mye
_annet_ som henger på at navigasjonen ligger i bunnen: `grep` fant seks
flater som regner ut fra `--app-bottom-nav-h` (annonseveiviserens innholds-
padding, dens faste bunnlinje, dens tekstfelthøyde, meldingstrådens
`calc(100vh - …)`, resultatlistens flytende knapp og toast-offset).

En rail som bare byttet ut komponenten ville altså etterlatt 96px død plass i
bunnen på seks flater. Løsningen ble å behandle variabelen som _kontrakten_ og
overstyre den (`.nav-rail { --app-bottom-nav-h: 0px }`) i stedet for å røre de
seks kallstedene — men det er verdt å vite at variabelen er mer enn en
paddingverdi.

To ting variabelen ikke dekker, fordi `position: fixed` er viewport-relativ og
ikke bryr seg om innholdets padding: annonseveiviserens bunnlinje (fikset med
`left-[var(--app-nav-rail-w,0px)]`) og annonsedetaljens klebrige CTA (ingen
fiks nødvendig — den er `md:hidden` og finnes ikke på nettbrettbredder).

**Ikke et nytt tiltak** (løst i fase 10). Sjuende variant av den samme
lærdommen som 10.4/10.8/10.10/10.13/10.14: `grep` opp omfanget ved
implementering.

---

## 11. Sluttvurdering (2026-08-10)

Gjennomgang av hele planen mot faktisk kode etter at fase 0–11 er levert.
Formålet er å svare på to spørsmål: ble alt i den opprinnelige planen
gjennomført, og hva gjenstår.

### 11.1 Er tiltakene gjennomført? — ja, med tre unntak som er bevisste

Alle 30 tiltak er kontrollert mot kodebasen, ikke bare mot fremdriftsloggen.
Stikkprøvene som ble kjørt (`grep`/filsjekk):

| Tiltak         | Kontroll                                                                                                           | Status |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| 1              | `forcenative`-grenen i `src/lib/native.ts`                                                                         | ✅     |
| 2–4, 15, 20    | `size-11`/`h-11`/`min-h-11` i primitivene, `.slice(0, 8)` borte                                                    | ✅     |
| 5, 6           | `.pl-safe`/`.pr-safe`/`.px-safe`/`.p-safe` definert i `styles.css` og i bruk 7 steder; `--safe-*`-variablene borte | ✅     |
| 7              | `src/hooks/use-overlay-history.ts`, kalt fra begge primitivene                                                     | ✅     |
| 8              | `allowsBackForwardNavigationGestures` i `AppDelegate.swift:51`                                                     | ✅     |
| 9              | `line-clamp-1` + `titleFadesIn` i `native-page-header.tsx`                                                         | ✅     |
| 10, 11         | `src/hooks/use-form-factor.ts`; `@md:grid-cols-4` i begge info-grid-ene                                            | ✅     |
| 12, 22         | Rail-grenen i `app-bottom-nav.tsx`, `InboxPage` i `meldinger.$id.tsx`                                              | ✅     |
| 13             | `@capacitor/screen-orientation` i `package.json`, `src/lib/orientation.ts`                                         | ✅     |
| 14             | `src/components/listing-detail/zoomable-image.tsx`                                                                 | ✅     |
| 16, 17, 18     | Tre CSS-regler i `styles.css`; `useSheetDrag` i `ui/sheet.tsx`; `usePullToRefresh` i 5 ruter                       | ✅     |
| 19             | `src/lib/text-scale.ts`                                                                                            | ✅     |
| 21             | `launchAutoHide: false` + `launchFadeOutDuration`; `UIRequiredDeviceCapabilities` borte fra `Info.plist`           | ✅     |
| 24, 25, 26, 28 | `search-panel/` (4 filer), `vaul` i `package.json`, `native-filter-chips.tsx` slettet                              | ✅     |
| 27             | Utgikk — Capacitor slår allerede av zoom (10.10)                                                                   | —      |
| 23, 29, 30     | Ikke levert, se 11.2                                                                                               | ⏳     |

Pensjoneringslisten i seksjon 6 er også kontrollert: `native-search-overlay.tsx`
og `native-filter-chips.tsx` finnes ikke lenger, og `native-advanced-search.tsx`
står igjen krympet, som funn 10.14 forklarer.

Tilstanden ved gjennomgangen: `bunx tsc --noEmit` rent, `bun run test` 242/242.

**Vurdering av avvikene.** Alle avvik fra den opprinnelige planen er
dokumentert i fremdriftsloggen med begrunnelse, og ingen av dem er en
utvanning av leveransen. De to som er verdt å merke seg som varige
konsekvenser er at `useSheetDrag` og `vaul` nå lever side om side (fase 9-
avviket), og at `native-advanced-search.tsx` overlevde pensjoneringen (10.14).
Begge er beskrevet der de oppsto; ingen av dem trenger ny beslutning nå.

Ett mønster er verdt å ta med videre ut av denne planen: **sju ganger** (funn
10.4, 10.8, 10.10, 10.12, 10.13, 10.14, 10.16) viste det seg at en telling
eller en konklusjon i funnrapporten underrapporterte omfanget, fordi den var
utledet fra én fil. Ingen av dem førte til feil leveranse, men alle sju kostet
tid ved implementering. Lærdommen hører hjemme i neste plan, ikke bare i denne.

### 11.2 Hva gjenstår

**A. Simulator-/enhetsrunden er det som faktisk står igjen — og den er stor.**
Ni av tolv faser er merket «kodeferdig, venter på simulator». Det er ikke en
formalitet: fase 2 (safe-area-verdier), 5 (rotasjonslås), 6 (ekte multitouch),
7 (dra-gest på ekte touch), 8 (Dynamic Type — kan per definisjon ikke ses i
nettleser) og 11 (splash-timing) har **ingen** verifisering utover kodenivå og
syntetiske hendelser. Prioritert rekkefølge, etter risiko hvis den feiler:

1. **Fase 11 — at splashen faktisk forsvinner.** Størst konsekvens av alle:
   `launchAutoHide: false` betyr at en oppstart som ikke når `hide()` låser
   appen på splash-skjermen. Test også offline-kaldstart (fallbacken i
   `offline.html`).
2. **Fase 5 + 6 — rotasjonslås og pinch/sveip.** Låsen skal ikke slå inn på
   nettbrett, og skal snappe tilbake når galleriet lukkes. iOS 15-grenen
   (`lockLegacy`) er aldri kjørt.
3. **Fase 3 — iOS-kantsveipen mot Embla-karusellene** og mot en zoomet
   panorering som starter nær venstre kant (fase 6-restansen).
4. **Fase 8 — Dynamic Type på iOS, og at Android faktisk allerede skalerer.**
   Antakelsen om Android er lest ut av plattformdokumentasjon (10.12).
5. **Fase 10 — Android nettbrett og at formatbyttet skjer live** ved rotasjon
   og Split View. Verifiseringsverktøyet kunne ikke se `matchMedia`-overgangen
   (10.7), og fase 10 hviler på den.
6. Fase 2 (notch-verdier), 7 (tap-highlight, langtrykk) — lavere risiko.

**B. Innloggede flater er aldri sett kjøre.** Dette er den gjennomgående
begrensningen fra 1.3, og den har fulgt hver eneste fase: annonseveiviserens
tette skjemaoppsett med 44px-felt (fase 1), ad-picker-sheeten (fase 2/4), de
fire nye pull-to-refresh-rutene (fase 7), panelets «Lagre»-flyt (fase 9) og
nettbrettets meldingsoppsett (fase 10). Samlet er dette den nest største
udekkede flaten etter simulatorrunden, og den løses av én testbruker mot en
lokal Supabase-stack — ikke av mer kodegjennomgang.

**C. Kjent teknisk gjeld fra leveransen:**

- **Native e2e-dekning for søkepanelet** (fase 9). Planen ba eksplisitt om at
  den ble skrevet _før_ de gamle overlayene ble slettet. Det skjedde ikke,
  fordi `vaul`s animasjoner ikke kan observeres i verifiseringsverktøyet
  (10.11). Reell gjeld, ikke bortprioritering — bør tas når panelet er sett
  virke på enhet.
- **Resultattelling oppdateres ikke live** mens man justerer i panelet
  (fase 9-avvik). Kjent forenkling; krever enten en telle-query mot utkastet
  eller en navigering per tastetrykk.
- **Aktiv samtale markeres ikke** i nettbrettets meldingsliste (fase 10).
- **`useSheetDrag` og `vaul` lever side om side.** Reversibelt, ~45 linjer.

**D. De tre ikke-leverte tiltakene:**

- **Tiltak 29** (tilbake under onboarding avslutter appen, funn 10.6) — Liten,
  Middels. Ingen avhengighet til noe annet; kan tas når som helst. Dette er
  det eneste gjenværende tiltaket med reell brukerkonsekvens.
- **Tiltak 30** (`pb-8` i `messages-button.tsx:273`,
  `notifications-bell.tsx:356`, `meg.tsx:230`) — Triviell, Lav. Ikke ødelagt,
  men overstyrer primitiven. Tas naturlig sammen med B, siden alle tre ligger
  bak innlogging.
- **Tiltak 23** (bundlet web-bygg) — egen ADR, med vilje ikke tatt her.

**E. Utenfor denne planens omfang, men registrert:** `eslint-plugin-jsx-a11y`
kjører fortsatt med kun én regel (3.7) — allerede notert som anbefalt neste
steg i `UX-AUDIT-PLAN.md` seksjon 9, og hører hjemme der.

### 11.3 Merknad om leveringstilstand

Fase 10 og 11 lå ved denne gjennomgangen **ucommittet i arbeidstreet** på
`staging` (siste commit er `94f1882`, fase 9). Fremdriftsloggen beskriver dem
som kodeferdige, og koden er det — men de er ikke pushet. Verdt å lukke før
simulatorrunden, slik at det som testes på enhet er det som faktisk ligger i
grenen.
