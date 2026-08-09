# App-UX-revisjon: funn og implementeringsplan

Status: Fase 1 (fiks promotering), fase 2 (delte UI-primitiver, del 1),
fase 3 (manuell dark mode-bryter), fase 4 (360°-opptak: in-wizard +
etterpåfølgende tillegg), fase 5 (WTB-redigeringskonsolidering), fase 6
(annonseveiviser: feilhåndtering) og fase 7 (meldinger: bildevedlegg)
gjennomført 2026-08-09. Fase 8 er neste.
Sist oppdatert: 2026-08-09.

**Dette dokumentet er levende.** Etter hver fase gjennomføres skal
seksjon 8 («Fremdriftslogg») fylles ut med hva som faktisk ble gjort, evt.
nye funn underveis, og oppdaterte anbefalinger for gjenstående faser — samme
mønster som [`SOK-UX-PLAN.md`](./SOK-UX-PLAN.md) seksjon 7 allerede
etablerer. Statuslinjen over oppdateres til å peke på hvilken fase som er
neste.

## 1. Bakgrunn og metode

Full gjennomgang av kjerneflytene sett fra sluttbruker, med hovedvekt på
native-appen (samme TanStack Start-app som web, kjørt i en Capacitor-WebView
mot live `kaupet.no` — se `capacitor.config.ts`). Omfatter
annonseopprettelse, annonseredigering, «mine annonser», meldinger,
favoritter, auth/onboarding, varsler, forside og det delte UI-systemet.

**Søkeflyten (`/annonser`, avansert søk, lagrede søk） er bevisst utelatt**
fra denne revisjonen — den er allerede grundig dekket av
[`SOK-UX-PLAN.md`](./SOK-UX-PLAN.md) (analyse 2026-08-05, fire faser
implementert og committet 2026-08-07). Konklusjonen der («kvaliteten er høy
og til dels mer moderne enn web») er verifisert på nytt i denne revisjonen
og står fortsatt; se seksjon 2.9 for en kort krysshenvisning.

**Metode:** kildekodegjennomgang av samtlige nevnte filer (ikke bare
stikkprøver), pluss live verifisering i nettleser mot lokal dev-server på
mobil viewport (375×812, inkl. `prefers-color-scheme: dark`) for de
funnene der levende DOM-mål var mulig å bekrefte. Native-spesifikke grener
(`useIsNative()`) styres av `Capacitor.isNativePlatform()`, ikke
viewport-bredde, så de er vurdert ut fra kildekoden — samme begrensning som
`SOK-UX-PLAN.md` allerede dokumenterer.

Kaupet har allerede en etablert konvensjonsguide,
[`UI-GUIDE.md`](./UI-GUIDE.md), med eksplisitte regler («native bruker
`Sheet`», «touch-targets skal være minst 44×44px»). Flere funn under er
**brudd på appens egne dokumenterte konvensjoner**, ikke bare generelle
beste-praksis-anbefalinger — det er notert eksplisitt der det gjelder.

## 2. Funn per overflate

### 2.1 Delt UI-system og native-tilpasning (påvirker alle flyter)

Dette er den høyest-giring-delen av revisjonen: fikser her forplanter seg
til hele appen uten at hver enkelt flyt må endres separat.

- **`Dialog` brukt der `UI-GUIDE.md` sier `Sheet` skal brukes, på 28 av 29
  steder.** Kun `app-bottom-nav.tsx` («Ny annonse»-velgeren) grener faktisk
  på `useIsNative()` for Dialog/Sheet. `report-dialog.tsx`,
  `share-listing-dialog.tsx`, `promote-listing-dialog.tsx`,
  `published-listing-dialog.tsx`, `kaupet-code-dialog.tsx` og alle
  kategori-/admin-dialoger viser samme sentrerte, faste
  `left-[50%] top-[50%]`-modal i native-appen som på desktop — stikk i
  strid med appens egen guide.
- **`vaul` (bunn-skuff-biblioteket) er installert, men brukes null steder**
  (`Grep "vaul"` i `src/` → ingen treff). `src/components/ui/sheet.tsx` er
  bygget direkte på `@radix-ui/react-dialog` med `cva`-varianter i stedet —
  altså en CSS-animert slide-in, ikke en ekte bunn-sheet med
  dra-for-å-lukke/velocity-snap. Native «Sheet»-flyter mangler dermed den
  gesten native brukere forventer av en bunn-sheet.
- **Touch-targets under 44px, bekreftet live.** `button-variants.ts`:
  `default: h-9` (36px), `sm: h-8` (32px), `icon: h-9 w-9` (36px) — kun
  `xl` (64px, brukt på FAB-en) treffer HIG/Material-anbefalingen. Målt live
  på `/[kaupetCode]` (annonsedetalj, mobil viewport): primær-CTA-ene «Send
  melding til selger» og «Del annonse» er 36px høye — primærhandlinger på
  den viktigste konverteringssiden i appen, under appens egen 44px-regel.
  `FavoriteButton size="sm"` (kort-overlay) er 32×32px.
- **Dark mode-CSS er dødt, bekreftet live.** `.dark`-tokens er fullt
  definert i `styles.css:94-119` med god kontrastdisiplin (egen
  `--accent-text`-variant for 4.5:1), men ingenting i `src/` setter
  `.dark`-klassen på `<html>`. Testet direkte: med
  `prefers-color-scheme: dark` emulert forblir
  `document.documentElement.classList.contains('dark')` `false` og
  bakgrunnsfargen `oklch(0.985 0.012 85)` (lys) uendret. `native-setup.ts`
  lytter allerede på samme media-query for å style statuslinjen — mønsteret
  finnes, det er bare ikke koblet til `<html>`-klassen.
  **Avklart 2026-08-09:** dark mode er planlagt på sikt og skal
  implementeres som del av denne planen, med en manuell bryter (ikke bare
  auto system-styring) — se fase 3.
- **`favorite-button.tsx` har en død kodegren, bekreftet live.** Komponenten
  returnerer `null` for utloggede brukere (linje 78) _før_ den når
  `handleClick`s innloggings-redirect-logikk (linje 80-88) — sistnevnte er
  derfor uoppnåelig kode. Konsekvens testet i nettleser: en utlogget bruker
  ser **ingen favoritt-knapp i det hele tatt** på annonsekort, dvs. ingen
  invitasjon til å logge inn for å bruke funksjonen — en sannsynlig
  konverteringslekkasje.
- **`eslint-plugin-jsx-a11y` er installert, men i praksis dekorativ.**
  `eslint.config.js` utvider ikke `recommended`-settet; kun én regel
  (`label-has-associated-control`) er aktiv. ~25 andre regler
  (`alt-text`, `click-events-have-key-events`, `role-has-required-aria-props`
  m.fl.) håndheves ikke av verktøy. Stikkprøver viser at disiplinen som
  _finnes_ er forfatterdrevet (mange komponenter har god `aria-label`-bruk
  likevel), ikke verktøyhåndhevet — dvs. sårbar for regresjon uten at CI
  fanger det. **Avklart 2026-08-09:** noteres som anbefalt neste steg
  (seksjon 9), ikke egen implementeringsfase i denne omgangen.
- Ingen bruk av CSS/React `view-transition`/`startViewTransition` noe sted —
  side- og sheet/dialog-overganger er rene Tailwind
  `animate-in`/`animate-out`-klasser, ingen delt-element- eller
  ruteoverganger.

### 2.2 Annonsefremheving skjult i produksjon — bekreftet reell bug

**Korrigert etter avklaring 2026-08-09.** Opprinnelig fremstilt som en
mulig bevisst demo-begrensning; verifisert i kode at det ikke er tilfellet.

`src/features/my-listings/listing-row.tsx` linje 238 og 323 gater «Fremhev
annonse»-knappen (både i kebab-menyen og som inline-knapp) bak
`isDemo && ...`, der `isDemo` (`use-is-demo.ts`) er sann for brukere med
rollen `demo` **eller** `admin`. Det finnes ingen annen inngang til
promotering i UI-et — resultatet er at **ingen ekte produksjonskunde noen
gang ser knappen**, uavhengig av miljø.

Samtidig har betalingslaget (`src/lib/vipps.server.ts`, linje 1-4, 40-53)
allerede en fullstendig, korrekt test/produksjon-separasjon — **vertsbasert**
(`isTestHost(host)`: `test.kaupet.no` bruker `VIPPS_TEST_*`-nøkler, alt
annet bruker ekte `VIPPS_*`-nøkler), helt uavhengig av `isDemo`-rollen.
Betalingssikkerheten er med andre ord allerede korrekt løst ett lag lenger
ned — `isDemo`-sjekken i `listing-row.tsx` er en ekstra, utilsiktet
UI-sperre lagt oppå et system som ikke trenger den, ikke en bevisst
beskyttelse mot ekte pengebruk. Dette er en inntektspåvirkende
korrekthetsbug, ikke en produktbeslutning.

### 2.3 Annonseopprettelse (`ny-annonse.tsx`, `ny-ok-annonse.tsx`)

Arkitekturen (data-drevet «field-group»-registry som komponerer
veiviser-steg per kategori, `field-groups/registry.ts` +
`category-flows.ts`) er solid og bør ikke skrives om — det er en
gjennomtenkt, godt kommentert løsning på et reelt problem (variabelt
skjema per kategori). Konkrete svakheter:

- **Inkonsekvent feilvisning.** Skjemafeil (zod/react-hook-form) vises
  korrekt inline med `aria-invalid`/`aria-describedby`. Men
  steg-på-tvers-validering (`validateExtra` i registry) — manglende
  kjørelengde, manglende beskrivelse av kjente feil, manglende
  kategori-attributter — vises **kun som toast**, ikke inline under det
  aktuelle feltet, selv når feltet er synlig på skjermen. To ulike
  feil-UX-er i samme veiviser avhengig av hvilket steg brukeren er på.
- **Stille bildeopplastingsfeil ved publisering.** Hvis ett av flere bilder
  feiler under parallell opplasting (`Promise.all`, `ny-annonse.tsx:655`),
  logges det kun til `console.warn` (linje 666-668) — brukeren får aldri
  vite at et bilde manglet på den ferdigpubliserte annonsen.
- **360°-opptak er praktisk talt utilgjengelig for en ren mobilbruker.**
  Funksjonen nås kun via en desktop-only QR-panel
  (`vehicle-360-qr-panel.tsx`, egen kommentar «Desktop-only panel») som
  brukeren skanner _med_ telefonen for å sende opptaket _tilbake_ til en
  skrivebordsøkt. En bruker som oppretter hele annonsen på telefonen sin har
  ingen inngang til 360°-opptak for sin egen annonse — motion/tilt-gatet
  opptakslogikken selv er godt bygget, men handoff-modellen forutsetter en
  desktop-økt som ikke finnes for en ren app-bruker. **Avklart 2026-08-09:**
  skal løses med ekte in-wizard-opptak på native, pluss mulighet til å legge
  til 360°-opptak senere på en allerede publisert eller kladd-lagret annonse
  — egen fase (fase 4), gitt omfanget.
- **To parallelle veivisere uten delt kode.** `ny-ok-annonse.tsx` (WTB) er
  en egen, håndrullet 3-stegs veiviser med egen `useState`-stegindeks og
  egen numrert steg-indikator i stedet for delt `StepIndicator` — én ekstra
  ting å vedlikeholde parallelt, uten funksjonell begrunnelse (WTB har ikke
  vesentlig andre navigasjonsbehov enn hovedveiviseren).
- **Kjent, sporet flakiness i e2e** (`e2e/pages/listing-wizard.ts:78-111`):
  klikk i veiviseren har observert å fullføre uten feil men uten at
  sidetilstanden endres — en reell, uroot-caused bug i veiviseren, i dag
  bare kompensert i testene med retry+skjermdump, med et eksplisitt
  revisit-dato-merke (2026-11-01). Ute av scope for denne planen (egen sak),
  men verdt å nevne siden fase 5 under rører nærliggende feilhåndteringskode.

### 2.4 Annonseredigering — tre inkompatible mønstre (hovedfunn)

Dette er det klareste vedlikeholds-/konsistensproblemet i hele appen:

1. **Opprettelse** = veiviser (steg for steg, «Neste»/«Tilbake»).
2. **Vanlig annonse-redigering** = inline klikk-for-å-redigere direkte på den
   offentlige annonsesiden (`?edit=true`), med per-felt autolagring
   (`EditableField`/`EditableRegion`, `save-listing-field.ts`) — en solid,
   veldesignet mekanisme i seg selv.
3. **WTB-redigering** (`mine-annonser.ok.$id.rediger.tsx`) = et helt eget,
   klassisk helskjema med `react-hook-form` + eksplisitt
   «Lagre endringer»-knapp + `useBlocker`-vakt for ulagrede endringer — den
   _gamle_ mønsteret som koden selv (kommentar i `save-listing-field.ts:28-34`)
   sier ble erstattet for vanlige annonser, men som aldri ble migrert for WTB.
4. Kategori- og kjennemerke-endring bruker en _fjerde_ variant (egne
   modaler, `category-change-dialog.tsx`/`vehicle-plate-edit-dialog.tsx`) —
   trolig rimelig begrunnet (sekundære sideeffekter/valideringer), men
   udokumentert som bevisst unntak.

Ingen delt mental modell mellom disse. En bruker som har lært å redigere en
vanlig annonse må lære en helt annen interaksjon for en WTB-annonse.

Mindre funn i samme område:

- **«Logg ut» har ingen bekreftelse** (`meg.tsx:86-90`) — kalles direkte på
  trykk, i kontrast til sletting/blokkering/annonse-forkasting som alle har
  `AlertDialog`-bekreftelse. Et feilklikk logger brukeren ut umiddelbart.

### 2.5 Meldinger

Kjernen (optimistisk sending med rollback, Supabase Realtime, per-melding
lest-kvittering med race-vakt, blokkeringssystem med tydelig scoping) er
godt bygget og bør ikke røres uten grunn. Konkrete gap:

- **Ingen bildevedlegg i det hele tatt** — verken i komponist eller skjema.
  For en bruktmarkedsplass for kjøretøy er «kan du sende et bilde av den
  rustflekken» et naturlig, ofte etterspurt behov — dette er en reell
  funksjonsmangel, ikke bare finpuss. Ingen «typing»/presence-kanal — ingen
  «skriver …»-indikator.
- **Ingen frakoblet-indikator.** Hvis realtime-kanalen mister forbindelsen,
  får ikke brukeren noe signal — de kan sitte og se på en utdatert tråd uten
  å vite det.
- **Salgsbekreftelse/anmeldelse er bakt inn i chat-tråden** (`SalePanel`) —
  en bevisst arkitekturbeslutning, men verdt å vurdere om «har vi
  gjennomført et salg»-tilstand hører hjemme i en DM-tråd eller i «Mine
  annonser»; ikke et hastefunn, men en produktvurdering verdt å ta stilling
  til bevisst.
- **Null automatisert testdekning** for hele meldingsflyten.

### 2.6 Auth / onboarding

- **Passordkrav er inkonsekvente på tvers av tre steder.** Signup krever
  minst 8 tegn via zod. Tilbakestilling av passord
  (`tilbakestill-passord.tsx:108`) sjekker kun `minLength={6}` på selve
  HTML-inputen — ingen zod-validering i det hele tatt på det skjemaet. En
  bruker kan altså sette et 6-tegns passord ved reset, selv om appen krever
  8 tegn ved opprettelse.
- **Ingen Turnstile-captcha på signup/innlogging** — kun på siste steg i
  annonsepublisering. **Avklart 2026-08-09:** Turnstile skal etableres på
  både signup og innlogging — se fase 7.
- **`authMode`/URL-drift.** Interne modusbytter («Glemt passord?») endrer
  kun lokal state, ikke `mode`-søkeparameteren — URL-en og tilbake-knappen
  gjenspeiler ikke lenger det som faktisk vises.
- **Ingen «sjekk e-posten din»-bekreftelsestilstand etter signup** —
  brukeren blir stående på skjemaet med kun en toast, i kontrast til
  reset/resend-modusene som _har_ en dedikert bekreftelsesskjerm.

### 2.7 Varsler / push-priming

Selve varselhistorikken og preferansesiden er godt bygget (samlet feed på
tvers av tre varseltyper, enhetsliste med individuell fjerning). Native
onboarding gjør permission-priming riktig (forklar først, spør etterpå, med
hopp-over). Svakhet: dette skjer kun én gang ved første app-åpning
(`localStorage`-gate) og kun på native — web har ingen tilsvarende
priming-flate, og det finnes ingen re-prompt-strategi for brukere som hoppet
over første gang (f.eks. etter N mottatte meldinger med push av).

### 2.8 Forside / landing og «Mine annonser»

Forsiden har helt separate web-/native-implementasjoner (rimelig, gitt hvor
forskjellig de er strukturert) — ingen kritiske funn. «Mine annonser» sin
publiseringsvarsel-dialog (blokkerende vs. anbefalte mangler) er et godt
eksempel på gjennomtenkt validerings-UX og bør brukes som mal andre steder.

### 2.9 Søk (kort — se `SOK-UX-PLAN.md`)

Allerede revidert og i hovedsak utbedret. Gjenstående åpne punkter derfra
(simulator-verifisering, evt. native e2e-emulering) er ikke duplisert her.

## 3. Tiltaksplan (prioritert)

| #   | Tiltak                                                                                                                                                                              | Omfang   | Prioritet   | Hvorfor                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fjern `isDemo`-sperren på «Fremhev annonse» i `listing-row.tsx` (linje 238, 323)                                                                                                    | Triviell | **Kritisk** | Inntektsfunksjon usynlig for alle ekte kunder i produksjon i dag; betaling er allerede trygt vertsbasert i `vipps.server.ts` |
| 2   | Hev minimum touch-target i `button-variants.ts` (`sm`/`icon`/`default` → ≥40-44px)                                                                                                  | Liten    | Høy         | Én endring, treffer hele appen; bryter i dag appens egen 44px-regel på primær-CTA-er                                         |
| 3   | Bygg ett delt `ResponsiveOverlay`-mønster (Dialog på web / Sheet på native) og migrer `report-dialog`, `share-listing-dialog`, `promote-listing-dialog`, `published-listing-dialog` | Middels  | Høy         | 28 av 29 dialogflyter bryter appens egen `UI-GUIDE.md`-regel i dag; ett sted å fikse fremfor 28                              |
| 4   | Fiks `favorite-button.tsx`: vis innloggingsprompt for utloggede brukere i stedet for `return null`, fjern uoppnåelig kodegren                                                       | Liten    | Høy         | Bekreftet konverteringslekkasje + dødkode                                                                                    |
| 5   | Manuell dark mode-bryter (web: avatarmeny; native: «Meg»-siden), aktiver eksisterende `.dark`-tokens, synk statuslinje                                                              | Middels  | Høy         | Planlagt uansett; alt visuelt grunnlag er allerede bygget og kontrast-testet                                                 |
| 6   | Fjern ubrukt `vaul`-avhengighet                                                                                                                                                     | Triviell | Lav         | Dødvekt, null risiko å fjerne                                                                                                |
| 7   | Konsolider annonseredigering: migrer WTB-redigering til samme inline-autolagringsmønster som vanlige annonser                                                                       | Stor     | Høy         | Fjerner ett av tre inkompatible redigeringsparadigmer; størst enkeltstående vedlikeholdsgevinst i planen                     |
| 8   | Ekte in-wizard 360°-opptak på native + mulighet til å legge til 360°-opptak på eksisterende/kladd-annonse                                                                           | Stor     | Høy         | Reelt funksjonsgap for mobilbrukere; produktbeslutning allerede tatt 2026-08-09                                              |
| 9   | Flytt `validateExtra`-feil i annonseveiviseren fra toast-only til inline-under-felt                                                                                                 | Middels  | Middels     | Fjerner den mest konkrete inkonsekvensen i opprettelsesflyten                                                                |
| 10  | Vis brukeren hvilke bilder som feilet ved publisering (ikke bare `console.warn`)                                                                                                    | Liten    | Middels     | Stille datatap er verre enn en synlig feil                                                                                   |
| 11  | Legg til bekreftelse på «Logg ut»                                                                                                                                                   | Triviell | Middels     | Irreversibel handling uten vakt, i kontrast til resten av appen                                                              |
| 12  | Bildevedlegg i meldinger (gjenbruk eksisterende bildekomprimering/opplastingsmønster fra annonseopprettelse)                                                                        | Stor     | Middels     | Reell, ofte etterspurt funksjonsmangel for en gjenstandsmarkedsplass                                                         |
| 13  | Harmoniser passordkrav (fjern `minLength={6}`, bruk delt zod-skjema på reset) + Turnstile på signup og innlogging                                                                   | Middels  | Høy         | Sikkerhets-/misbrukskonsistens, ikke bare UX; Turnstile-utvidelsen er en eksplisitt produktbeslutning 2026-08-09             |
| 14  | «Sjekk e-posten din»-bekreftelsestilstand etter signup + fiks `authMode`/URL-drift                                                                                                  | Liten    | Lav         | Symmetri/konsistens, ikke blokkerende mangler                                                                                |

**Ikke anbefalt:** full omskriving av annonseveiviseren (arkitekturen er
solid) eller av meldingssystemets kjerne (optimistisk sending/realtime er
allerede riktig bygget). Der denne planen foreslår omfattende endringer
(tiltak 7, 8, 12), er det for å **konsolidere til ett mønster** eller **fylle
et konkret hull**, ikke for å erstatte noe som fungerer.

## 4. Implementeringsplan

Faseinndelingen følger tiltakslisten, gruppert i sammenhengende
PR-størrelser. Fase 1 er en isolert, kritisk bug fix som bør ut uavhengig av
resten. Fase 2 er bevisst «bred infrastruktur først» — den bygger de delte
primitivene resten av appen (og fremtidige flyter) kan gjenbruke, fremfor å
flikke på symptomer flyt for flyt.

### Fase 1 — Fiks skjult annonsefremheving i produksjon (tiltak 1)

**Filer:** `src/features/my-listings/listing-row.tsx`.

- Fjern `isDemo &&`-betingelsen rundt «Fremhev annonse» på linje 238
  (kebab-meny) og 323 (inline-knapp) — knappen skal vises for alle brukere
  med `row.status === "active"`, uavhengig av `isDemo`.
- Ingen endring nødvendig i betalingslaget (`vipps.server.ts`) — test/
  produksjon er allerede korrekt vertsbasert og upåvirket av denne
  endringen.
- Dobbeltsjekk at `PromoteListingDialog` selv ikke har noen tilsvarende
  skjult `isDemo`-antakelse (f.eks. i tekst/copy som forutsetter
  demo-kontekst) før den blir allmenn synlig.

**Testpåvirkning:** ingen eksisterende tester dekker promotering
(bekreftet null e2e/komponentdekning). Vurder én komponenttest som
verifiserer at knappen rendres uavhengig av `isDemo`-verdi, siden dette er
nøyaktig regresjonen som skjedde forrige gang (knappen ble ikke fjernet med
vilje av UX-grunner, men endte opp skjult).

### Fase 2 — Delte UI-primitiver, del 1: touch-targets, overlay-mønster, favoritter (tiltak 2, 3, 4, 6)

**Filer:** `src/components/ui/button-variants.ts`,
`src/components/ui/` (ny `responsive-overlay.tsx` el.),
`src/components/favorite-button.tsx`, `package.json`.

1. **Touch-targets:** hev `sm`/`icon`/`default`-høyder i
   `button-variants.ts` til minst 40px (helst 44px for `default`). Sjekk
   visuelt at tette knapperader (f.eks. annonsekortenes overlay-knapper)
   ikke klipper hverandre ved den nye høyden.
2. **`ResponsiveOverlay`:** ny liten komponent som speiler mønsteret
   `app-bottom-nav.tsx` allerede bruker manuelt (`!native ? <Dialog> :
<Sheet side="bottom">`), som en gjenbrukbar wrapper med samme
   `open`/`onOpenChange`/children-kontrakt som `Dialog`. Migrer
   `report-dialog.tsx`, `share-listing-dialog.tsx`,
   `promote-listing-dialog.tsx`, `published-listing-dialog.tsx` til den.
   **Sjekk `e2e/publish-listing.spec.ts`** (asserter på
   `PublishedListingDialog`s heading) — behold samme innhold/heading-tekst
   og en stabil selektor uavhengig av Dialog/Sheet, så testen ikke må
   endres. Oppdater `UI-GUIDE.md` med et eksplisitt eksempel som viser til
   den nye komponenten i stedet for kun `app-bottom-nav.tsx`.
3. **`favorite-button.tsx`:** fjern det tidlige `return null` for utloggede
   brukere; render i stedet en tom/utfylt-hjerte-knapp som alltid er synlig,
   og la eksisterende `handleClick`-redirect-til-`/auth`-gren (allerede
   skrevet, bare uoppnåelig i dag) faktisk kjøre. Legg til
   `hapticImpact("light")` på vellykket toggle.
4. **Fjern `vaul`** fra `package.json` siden `sheet.tsx` ikke bruker den.

**Testpåvirkning:** ny komponenttest for `ResponsiveOverlay` (render-modus
per `useIsNative()`-verdi, speiler mønsteret i
`swipe-to-delete-row.test.tsx`). Verifiser `e2e/publish-listing.spec.ts`
fortsatt består etter migrering av `PublishedListingDialog`.

### Fase 3 — Delte UI-primitiver, del 2: manuell dark mode-bryter (tiltak 5)

**Avklart 2026-08-09:** manuell bryter, ikke bare auto system-styring. Web
får en bryter i avatarmenyen øverst til høyre; native får en tilsvarende
bryter på «Meg»-siden.

**Filer:** ny `src/hooks/use-theme.ts` (kontekst + hook), `src/routes/__root.tsx`
(monter `ThemeProvider`), `src/components/site-header.tsx` (verifiser
dagens avatarmeny-implementasjon først — legg til `DropdownMenu`-item hvis
en dropdown allerede finnes der, ellers etabler én), `src/routes/_authenticated/meg.tsx`
(ny `Switch`-rad, samme mønster som den eksisterende «Test-modus»-bryteren
på linje 163-182), `src/lib/native-setup.ts` (statuslinje-synk).

- **Tilstand:** liten React Context (`ThemeProvider`/`useTheme`) montert én
  gang i `__root.tsx` — nødvendig fordi bryteren skal virke fra to
  fysisk atskilte steder i treet (header-dropdown på web, «Meg»-siden på
  native) og state må overleve navigasjon. Verdier: `"light" | "dark" |
"system"`, persistert i `localStorage` under `kaupet_theme` (samme
  navnekonvensjon som `kaupet_view_mode`/`kaupet_photo_guide_seen`).
  Standard: `"system"` (følger `prefers-color-scheme` helt til brukeren
  eksplisitt velger noe annet).
  Løsningen skal **ikke** dra inn en tredjeparts theme-avhengighet
  (`next-themes` e.l.) — konteksten er noen titalls linjer og appen har
  allerede et etablert mønster for denne typen liten, dedikert
  tilstand (jf. `swipe-to-delete-row.tsx`s begrunnelse for å ikke ta inn et
  bibliotek for ett bruksområde).
  Anvend/fjern `.dark`-klassen på `document.documentElement` i en
  `useEffect` som kjører når resolved theme endres.
- **Web-UI:** legg bryteren (sol/måne-ikon + evt. tre valg lys/mørk/system,
  eller en enkel to-tilstands bryter hvis «system» oppleves som unødvendig
  kompleksitet for brukeren — avklar med design ved implementering) inn i
  den eksisterende avatar-dropdownen i `site-header.tsx`.
- **Native-UI:** legg til en `Switch`-rad («Mørk modus») i `meg.tsx`s
  `NavRow`-liste, samme komponentmønster som «Test-modus»-bryteren som
  allerede ligger der — konsistent gjenbruk, ikke en ny UI-primitiv.
- **Statuslinje-synk (viktig detalj, ikke bare kosmetikk):**
  `native-setup.ts` linje 14-34 styrer i dag `StatusBar`-farge direkte fra
  `prefers-color-scheme`-media-queryen. Når en manuell bryter finnes, må
  statuslinjen følge **resolved theme fra `useTheme()`**, ikke rå
  OS-preferanse — ellers kan statuslinjen vise mørk stil mens appen for
  øvrig viser lys (eller omvendt) når brukeren har overstyrt manuelt. Denne
  filen må derfor oppdateres til å konsumere samme tilstand som
  `ThemeProvider`, ikke lytte uavhengig.

**Testpåvirkning:** ny komponenttest for `useTheme` (system-standard,
manuell overstyring persisterer i `localStorage`, riktig klasse settes).
Manuell visuell verifisering (som gjort i denne revisjonen) av kontrast i
begge moduser — ingen eksisterende tester berøres.

### Fase 4 — Ekte in-wizard 360°-opptak + etterpåfølgende tillegg (tiltak 8)

**Avklart 2026-08-09:** egen fase gitt omfanget. To leveranser:
(a) opptak direkte i annonseveiviseren når annonsen opprettes på native,
(b) mulighet til å legge til 360°-opptak på en allerede publisert eller
kladd-lagret annonse i etterkant.

**Filer:** `src/features/vehicle-360-capture/capture-flow.tsx` (gjenbrukes,
ikke skrives om — motion/tilt-gatet opptakslogikk er allerede solid),
`src/features/listing-creation/field-groups/` (nytt entry-point for
native), `src/features/listing-edit/` (nytt «Legg til 360°-opptak»),
`src/features/my-listings/listing-row.tsx` (ny rad-handling for
kladd-annonser), `src/routes/360-opptak.$token.tsx` (opplastingskontrakt
som gjenbrukes).

- **Viktig teknisk avklaring før implementering:** dagens flyt laster opp
  mot en `token` knyttet til en spesifikk annonse-/kladd-rad
  (`/360-opptak/:token`), designet for QR-handoff-scenariet. Verifiser
  nøyaktig hvordan `token` genereres og hvilken rad den peker til
  (`vehicle-360-qr-panel.tsx` og server-siden av `360-opptak.$token.tsx`)
  før arbeidet starter — planen her forutsetter at opplastingskontrakten
  (token → annonse-id) kan gjenbrukes uendret, bare uten QR-steget, men
  dette må bekreftes mot faktisk kode, ikke antas.
- **In-wizard (native):** i `title-photos`- eller et nytt, native-only
  steg i vehicle-flowen, legg til en knapp «Ta 360°-opptak» som åpner
  `Vehicle360CaptureFlow`s kamera-/motion-gatede opptaks-UI direkte i
  appen (samme komponentlogikk som i dag, ny inngang). Siden opptaket
  trenger en rad å laste opp mot, sørg for at wizarden har en kladd-rad
  klar (gjenbruk `use-draft-autosave.ts`, som allerede oppretter en
  kladdrad tidlig i flyten) før knappen aktiveres — ikke bygg en egen
  midlertidig opplastingsmekanisme parallelt med kladd-systemet.
  Skrivebord beholder eksisterende QR-panel uendret (fortsatt riktig
  mønster der).
- **Etterpåfølgende tillegg:** legg til en «Legg til 360°-opptak»-handling
  (kun kjøretøykategorier, kun native) i (1) eierens inline redigeringsmodus
  på `$kaupetCode.tsx` for allerede publiserte annonser, og (2) som
  rad-handling i «Mine annonser» for kladd-annonser (`row.status ===
"draft"`) — begge gjenbruker samme opptaks-UI og opplastingskontrakt som
  in-wizard-varianten, bare med annonse-ID hentet fra den eksisterende raden
  i stedet for en fersk kladd.

**Testpåvirkning:** kjernelogikken (motion/tilt-deteksjon) er uendret og
trenger ingen ny test. Legg til komponenttest for de nye
entry-point-komponentene (knapp vises kun `isNative` + kjøretøykategori,
riktig annonse-ID/token sendes videre). **Kamera-/motion-funksjonalitet kan
ikke verifiseres i nettleser-forhåndsvisning eller Playwright** —
simulator-verifisering er obligatorisk for denne fasen (samme begrensning
som `SOK-UX-PLAN.md` seksjon 5 dokumenterer for andre native-only-grener).

### Fase 5 — Konsolider annonseredigering: WTB → inline-mønster (tiltak 7)

**Filer:** `src/routes/_authenticated/mine-annonser.ok.$id.rediger.tsx`
(fjernes/erstattes), `src/features/listing-edit/` (utvides til å dekke
WTB-felter), `src/lib/save-listing-field.ts`.

- Kartlegg WTB-skjemaets feltsett (`wtb-criteria-types.ts`) mot
  `EditableField`/`EditableRegion`-kontrakten — WTB har range-/multiselect-
  kriterier i stedet for enkeltverdier, så `save-listing-field.ts` må
  trolig utvides med en kriterie-variant av lagrefunksjonen, ikke bare
  gjenbrukes as-is.
- Bygg en tilsvarende inline-redigerbar visning for WTB-annonser (avklar
  hvilken visningsflate WTB-annonser faktisk har i dag før implementering).
- Behold «Marker som oppfylt»-handlingen som egen, tydelig knapp — det er en
  statusendring, ikke et redigerbart felt.
- Fjern den gamle helskjema-siden når migreringen er verifisert.

**Testpåvirkning:** ingen eksisterende automatiserte tester dekker verken
gammel eller ny WTB-redigering — legg til minst én fokusert komponenttest
for den nye inline-lagringen (lagre-status idle/saving/saved/error), etter
samme mønster som `swipe-to-delete-row.test.tsx`.

### Fase 6 — Annonseveiviser: feilhåndtering (tiltak 9, 10)

**Filer:** `src/features/listing-creation/field-groups/registry.ts`,
`src/routes/_authenticated/ny-annonse.tsx`.

- Utvid `validateExtra`-kontrakten til å returnere hvilket feltnavn feilen
  hører til (ikke bare en Norsk feilstreng), så steget kan vise en inline
  banner ved det aktuelle feltet i tillegg til/i stedet for toast.
  `SHOW_NO_IMAGE_DIALOG`/`SHOW_NO_PRICE_DIALOG`-sentinelene beholdes som
  egne dialog-triggere (bevisste myke gates, ikke feltfeil).
- Bytt `console.warn` for feilede bildeopplastinger (linje 666-668) til en
  synlig feilmelding som lister hvilke bilder som ikke ble lastet opp.

**Testpåvirkning:** `e2e/pages/listing-wizard.ts`s `data-testid`-kontrakt
endres ikke. Legg til én ny assertion i
`publish-listing.spec.ts`/`publish-vehicle-listing.spec.ts` som dekker
minst én `validateExtra`-feilvei (i dag udekket). Ikke rør den allerede
sporede flakiness-workaroundet (`clickAndWaitFor`) — egen sak, revisit
2026-11-01.

### Fase 7 — Meldinger: bildevedlegg (tiltak 12)

**Filer:** `src/components/meldinger/`,
`src/routes/_authenticated/meldinger.$id.tsx`, meldings-skjema/tabell (ny
migrasjon).

- Gjenbruk `src/lib/image-compression.ts` — ikke bygg en ny
  opplastingspipeline.
- Utvid meldings-tabellen med en attachment-referanse (egen migrasjon —
  følg CLAUDE.md-regelen om å committe/pushe migrasjonen separat og vente
  til den er bekreftet anvendt før appkoden som avhenger av den).
- Komponer inn i eksisterende optimistisk-sending-mønster
  (`sendMutation.onMutate`).
- Skjermbegrensning: maks 1 bilde per melding i første versjon (YAGNI —
  utvid kun hvis det faktisk etterspørres).

**Testpåvirkning:** ingen eksisterende tester for meldinger. Legg til
komponenttest for vedleggsopplasting, og vurder én ny e2e-spec hvis
`e2e/global-setup.ts`s Supabase-avhengighet er tilgjengelig i CI (verifiser
på nytt — den var ikke tilgjengelig i miljøet `SOK-UX-PLAN.md`s fase 4 ble
utført i).

### Fase 8 — Auth-konsistens inkl. Turnstile (tiltak 13, 14)

**Avklart 2026-08-09:** Turnstile skal etableres på både signup og
innlogging (utvidet fra opprinnelig funn som kun flagget signup).

**Filer:** `src/routes/auth.tsx`, `src/routes/tilbakestill-passord.tsx`,
`src/routes/_authenticated/meg.tsx`, `src/lib/listings.functions.ts`
(referanse for eksisterende server-side Turnstile-verifisering).

- **Turnstile på signup og innlogging:** legg til `@marsidev/react-turnstile`
  (allerede en avhengighet, brukt ett sted i dag) på begge
  `auth.tsx`-skjemaene, med tilsvarende server-side verifisering som
  publiseringsflyten allerede har. Vurder om usynlig/«managed»-modus
  (samme som brukt i dag) er tilstrekkelig, eller om innlogging spesielt
  bør ha en lavere friksjonsterskel (kun trigge ved mistenkelig mønster) —
  avklar ved implementering hvis dette blir en reell brukeropplevd
  friksjon.
- **Passord:** erstatt `minLength={6}` på reset-siden med samme zod-skjema
  (`min(8)`) og `zodResolver` som `auth.tsx` bruker, inkl.
  `aria-invalid`/`aria-describedby`. Trekk ut ett delt passord-schema i
  stedet for duplisert `min(8)`/`minLength={6}`.
- **«Logg ut»:** wrap `handleLogout` i `AlertDialog`-bekreftelse, samme
  mønster som resten av appen.
- Legg til en «Sjekk e-posten din»-bekreftelsestilstand etter signup.
- Fiks `authMode`-drift: la interne modusbytter kalle
  `navigate({search: (prev) => ({...prev, mode: newMode})})` i stedet for
  kun `setAuthMode`.

**Testpåvirkning:** ingen eksisterende auth-tester. Legg til unit-test for
det delte passord-schemaet og en komponenttest for logg-ut-bekreftelsen.
Turnstile i seg selv er ikke enhetstestbart (ekstern tjeneste) — verifiser
manuelt at signup/innlogging fortsatt fungerer i test-modus (Turnstile har
en dokumentert test-nøkkel-modus — bruk samme mønster som
`listings.functions.ts` allerede har for publisering, ikke en ny løsning).

## 5. Verifisering

- `bunx tsc --noEmit` og `bun run lint` etter hver fase (kjøres uansett som
  pre-push/pre-commit-hooks).
- `bun run test` (vitest) for nye/endrede komponenttester per fase.
- `bun run test:e2e` for de tre eksisterende spec-ene etter fase 2 og 6
  spesielt (dialog-migrering og veiviser-feilhåndtering er fasene som rører
  kode e2e-ene faktisk asserter på).
- Manuell sjekk i mobil nettleser-viewport for touch-target- og
  dark mode-endringene — begge er direkte DOM-verifiserbare uten ekte
  native-runtime.
- **Simulator-verifisering nødvendig for:** `ResponsiveOverlay`s
  Sheet-gren, favorite-button-haptikk, dark mode-bryteren på native
  («Meg»-siden) og statuslinje-synk, og hele fase 4 (360°-opptak) — alt som
  grener på `useIsNative()` eller bruker kamera-API-er er ikke
  observerbart i nettleser-forhåndsvisning.

## 6. Rekkefølge og avhengigheter

Fase 1 er uavhengig og bør prioriteres først (inntektspåvirkende, triviell).
Fase 2 og 3 (delte primitiver) bør gjøres før fase 5 og 7 berører
UI-flater som drar nytte av dem (`ResponsiveOverlay` i particular — ny kode
i senere faser bør bruke den fra start i stedet for å skrive enda en
Dialog-only-flate som må migreres senere). Fase 4 (360°-opptak) og fase 8
(auth) er uavhengige av de andre og kan gjøres i valgfri rekkefølge relativt
til fase 5-7.

## 7. Åpne spørsmål — status

Alle fem opprinnelige åpne spørsmål er besvart 2026-08-09 og innarbeidet i
planen over (dark mode: fase 3; 360°-opptak: fase 4; Turnstile: fase 8;
promotering: fase 1, bekreftet reell bug; jsx-a11y: flyttet til seksjon 9
som anbefalt neste steg, ikke egen fase). Ingen åpne spørsmål gjenstår før
oppstart av fase 1-3. Fase 5 (WTB-konsolidering) og fase 7
(meldingsvedlegg) har mindre, angitte avklaringspunkter innbakt i sine
respektive faseseksjoner (visningsflate for WTB, vedleggsgrense) som avklares
ved implementeringsstart, ikke her.

## 8. Fremdriftslogg (oppdateres etter hver fase)

### Fase 1 — 2026-08-09

Fjernet `isDemo &&`-gatingen rundt «Fremhev annonse» i
`src/features/my-listings/listing-row.tsx` (kebab-meny og inline-knapp).
Knappen vises nå for alle brukere med `row.status === "active"`, uavhengig
av rolle. Siden `isDemo` etter dette ikke lenger brukes noe sted i
`ListingRow`, ble prop-en fjernet fra komponentens signatur i samme slag
(mindre avvik fra planen, som kun nevnte å fjerne selve betingelsen) — og
kallstedet i `mine-annonser.index.tsx` oppdatert til å ikke sende `isDemo`
lenger, inkl. fjerning av den da ubrukte `useIsDemo()`-importen/kallet der.
`PromoteListingDialog` ble sjekket og har ingen skjult demo-antakelse i
tekst/copy. Ingen endring i `vipps.server.ts` (uendret, som planlagt —
vertsbasert test/prod-separasjon er allerede korrekt).

Lagt til `src/features/my-listings/listing-row.test.tsx` — én
komponenttest som verifiserer at «Fremhev annonse» rendres uavhengig av
rolle (regresjonsvakt mot akkurat denne buggen). `bunx tsc --noEmit` og
lint kjørt rent på alle endrede/nye filer.

Ingen nye funn underveis. Fase 2 (delte UI-primitiver: touch-targets,
`ResponsiveOverlay`, favoritter, fjern `vaul`) er neste anbefalte steg.

### Fase 2 — 2026-08-09

Hevet touch-targets i `src/components/ui/button-variants.ts`: `default`
`h-9`→`h-11`, `sm` `h-8`→`h-10`, `lg` `h-10`→`h-11`, `icon` `h-9 w-9`→`h-11
w-11` (alle ≥40px, `default`/`lg`/`icon` nå ved 44px-anbefalingen; `xl`
uendret).

Bygget `src/components/ui/responsive-overlay.tsx` (`ResponsiveOverlay` +
`ResponsiveOverlayContent`) — speiler `app-bottom-nav.tsx`s manuelle
`!native ? <Dialog> : <Sheet>`-mønster bak én gjenbrukbar komponent.
`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` gjenbrukes
uendret inni begge varianter (samme underliggende
`@radix-ui/react-dialog`-primitiv), så migreringen var kun et bytte av
rot-/content-komponenten i `report-dialog.tsx`, `share-listing-dialog.tsx`,
`promote-listing-dialog.tsx` og `published-listing-dialog.tsx`. Lagt til
`src/components/ui/responsive-overlay.test.tsx` (web→Dialog,
native→Sheet, speiler mønsteret i `swipe-to-delete-row.test.tsx`).
`app-bottom-nav.tsx` selv er ikke migrert (forhåndsdatert
`ResponsiveOverlay` og fungerer identisk) — `UI-GUIDE.md` peker nytt
overlay-UI mot `ResponsiveOverlay` fra start.

Fjernet det tidlige `if (!user) return null` i `favorite-button.tsx` —
utloggede brukere ser nå favoritt-knappen og sendes til `/auth` ved klikk
(den eksisterende redirect-grenen i `handleClick`, tidligere uoppnåelig).
Lagt til `hapticImpact("light")` på vellykket toggle.

Fjernet ubrukt `vaul`-avhengighet fra `package.json` (`bun install` kjørt,
lockfile oppdatert).

`e2e/pages/listing-wizard.ts`s `publishAndExpectSuccess` asserter på
`getByRole("heading", {name: "Annonsen din er publisert, bra jobba!"})` —
uendret av migreringen siden `DialogTitle` gjenbrukes som before. `bunx tsc
--noEmit`, `bun run lint` (0 feil, kun eksisterende warnings) og `bun run
test` (219/219 grønn) kjørt rent. Manuell sjekk mot lokal dev-server
(konsoll uten feil).

Ingen nye funn underveis. Fase 3 (manuell dark mode-bryter) er neste
anbefalte steg.

### Fase 3 — 2026-08-09

Bygget `src/hooks/use-theme.tsx` (`ThemeProvider`/`useTheme`) — liten React
Context, ingen tredjeparts theme-avhengighet, som planlagt. Verdier
`"light" | "dark" | "system"`, persistert i `localStorage` under
`kaupet_theme`, standard `"system"`. Montert én gang i `__root.tsx` rundt
`AuthProvider`. Lagt til et synkront inline-script i `RootShell` (samme
mønster som det eksisterende `native-boot`-scriptet) som setter
`.dark`-klassen på `<html>` før noe males, så det ikke blir noe lysmodus-glimt
for brukere med mørk modus valgt eller som systempreferanse.

`src/lib/native-setup.ts` delt i to: `setupNative()` (uendret ansvar —
viewport/tastatur) og en ny eksportert `syncStatusBarTheme(dark)` som
`ThemeProvider` selv kaller (kun on native) hver gang resolved theme endres —
statuslinjen følger nå appens faktiske tema, ikke en uavhengig
`matchMedia`-lytter slik planen påpekte som viktig detalj.

**Web-UI:** lagt til en «Mørk modus»-bryter (`Switch`, samme mønster som
Test-modus-bryteren) i `UserMenu` (avatar-dropdownen i `site-header.tsx`).
**Native-UI:** tilsvarende bryter lagt til i `meg.tsx`s «Konto»-seksjon,
samme `NavRow`-visuelle mønster. Begge brytere er enkle av/på (ikke en
tredje «system»-meny-oppføring) — resolved theme fra system brukes som
utgangspunkt inntil brukeren eksplisitt slår bryteren, i tråd med planens
åpning for en enklere to-tilstands bryter fremfor tre valg.

Lagt til `src/hooks/use-theme.test.tsx` (system-standard følger lys
OS-preferanse, manuell overstyring persisterer i `localStorage` og setter
riktig klasse). `bunx tsc --noEmit`, `bun run lint` (0 feil, kun eksisterende
warnings) og `bun run test` (221/221 grønn) kjørt rent. Manuelt verifisert i
nettleser: `localStorage.kaupet_theme = "dark"` + reload setter `.dark` på
`<html>` synkront før maling og løser til korrekt mørk bakgrunnsfarge
(`oklch(0.18 0.02 150)`), ingen konsollfeil.

**Ikke gjort, bevisst:** ingen simulator-verifisering av
statuslinje-synkroniseringen på ekte native — kun kodenivå (samme
begrensning planen selv flagger for `useIsNative()`-grener).

Ingen nye funn underveis. Fase 4 (ekte in-wizard 360°-opptak) er neste
anbefalte steg.

### Fase 4 — 2026-08-09

Bekreftet før implementering (per planens egen "viktig teknisk avklaring"):
`listing_360_capture_sessions.token` er et rent bærer-hemmelighet
(`token → listing_id`) uten QR-spesifikke egenskaper — gjenbrukbart uendret
for en native in-app-flyt uten QR/route-navigasjon. `Vehicle360CaptureFlow`
selv brukte allerede `getUserMedia`/`DeviceOrientationEvent` (ikke
`@capacitor/camera`), så ingen ny avhengighet var nødvendig.

Bygget `src/components/vehicle-360-capture-launcher.tsx`
(`Vehicle360CaptureLauncher`) — én delt komponent for alle tre native
inngangene: minter en økt via `createVehicle360CaptureSession` (oppretter
draft ved behov via `ensureListingId`, eller bruker en kjent `listingId`
direkte) og kjører `Vehicle360CaptureFlow` i en full-skjerm-overtakelse
in-process. `capture-flow.tsx` fikk en ny valgfri `onDone`-prop: når satt
(alle tre native-inngangene) byttes «Gå tilbake til datamaskinen»-teksten og
toasten ut med in-app-egnet tekst («360°-bildene er lagt til annonsen») og en
«Ferdig»-knapp som lukker overtakelsen — QR-handoff-varianten
(`360-opptak.$token.tsx`) er uendret og fortsatt uten `onDone`.

**(a) In-wizard (native):** `title-photos/index.tsx` — native+`isVehicle`-
grenen viser nå `Vehicle360CaptureLauncher` under bildeopplastingen, koblet
til eksisterende `draftId`/`ensureDraftId` fra `use-draft-autosave.ts` (ingen
ny kladd-opprettingslogikk). Desktop beholder uendret `Vehicle360QrPanel`.

**(b) Etterpåfølgende tillegg:** (1) `$kaupetCode.tsx` — ny
eier+native+kjøretøy-gate i `ownerStatsSlot` (gjenbruker allerede beregnet
`vehicleGroup`/`isNative`) med samme launcher for allerede publiserte
annonser. (2) `src/features/my-listings/listing-row.tsx` — ny
`isVehicle`-prop, ikonknapp-launcher i native-raden for `draft`/`active`-
annonser, plassert ved siden av «…»-menyknappen (utenfor `DropdownMenu` for å
unngå at launcherens tilstand unmountes når menyen lukkes).
`mine-annonser.index.tsx` beregner `isVehicle` per rad via samme
`useAllCategoryFilters`/`["categories"]`-mønster som `$kaupetCode.tsx`
allerede bruker (delt cache, ingen ny query-kostnad).

Ingen ny registry-/`category-flows.ts`-oppføring var nødvendig — planens
«billigste alternativ» (gren i eksisterende steg fremfor egen wizard-side)
ble valgt, siden det holdt diffen liten og QR-panelets desktop-gren allerede
levde i nøyaktig dette steget.

**Testpåvirkning:** `listing-row.test.tsx` oppdatert med den nye påkrevde
`isVehicle`-propen. `bunx tsc --noEmit`, `bun run lint` (0 nye feil/warnings
i endrede filer — to eksisterende, urelaterte lint-feil i
`routes/index.tsx`/`annonser_.filter.tsx` upåvirket) og `bun run test`
(221/221 grønn) kjørt rent. Ingen ny komponenttest lagt til for
`Vehicle360CaptureLauncher` selv (kamera-/motion-avhengig, samme begrensning
som resten av opptaksflyten).

**Ikke gjort, bevisst — som planen selv flagger:** ingen
simulator-verifisering av kamera-/motion-funksjonaliteten (kun kodenivå og
manuell type-/lint-/testverifisering). Dette er obligatorisk før fasen kan
anses fullstendig ferdig verifisert — kun kodenivå-implementering er gjort
her.

Ingen nye funn underveis. Fase 5 (WTB-redigeringskonsolidering) er neste
anbefalte steg.

### Fase 5 — 2026-08-09

**Avklart før implementering (bruker spurt eksplisitt, jf. planens egen
åpning "avklar hvilken visningsflate WTB-annonser faktisk har i dag"):** WTB-
annonser hadde ingen offentlig detaljside i det hele tatt — kun kort i søk/
"Mine annonser". Brukeren valgte å bygge en enkel WTB-detaljside
(`/ok/$id`) fremfor å presse inline-redigering inn i listeraden eller
beholde et eget skjema. Dette var en forutsetning planens opprinnelige tekst
ikke hadde tatt stilling til.

Bygget `src/routes/ok.$id.tsx` — offentlig WTB-detaljside (tittel, kategori,
kriterier, beskrivelse, maks pris, kontakt-knapp for andre brukere). For eier

- `?edit=true`: samme inline klikk-for-å-redigere/autolagre-mønster som
  `$kaupetCode.tsx`, gjenbrukt via `EditableField`/`EditableRegion`.

**Generalisering nødvendig for gjenbruk:** `EditableField`/`EditableRegion`
var hardkodet mot `ListingEditContext` (som selv bærer listing-spesifikke
felt: `behavior`, `openVehicleLookupModal` osv.). Siden begge komponentene
i praksis kun leser `editMode`/`fieldStatus` fra konteksten, ble dette
generalisert til et valgfritt `context`-prop (default `ListingEditContext`,
null-endring for alle eksisterende kallsteder) typet mot et minimalt
`BaseEditContextValue`. Ny `WtbEditContext`
(`src/features/wtb/wtb-edit-mode-context.tsx`) og `WtbFieldPatch`/
`saveWtbListingField` (`src/features/wtb/save-wtb-listing-field.ts`, tynn
adapter over eksisterende `updateWtbListing`-serverfunksjon, som allerede
støtter partial-oppdateringer — ingen ny server-funksjon eller migrasjon
nødvendig) og `useWtbEditMutations`
(`src/features/wtb/use-wtb-edit-mutations.ts`, speiler
`useListingEditMutations`) implementerer WTB-siden av det samme mønsteret.

Kriterie-feltene (`WtbCriteriaFields`, range/multiselect) beholdt som egen
`WtbCriteriaPanel`-underkomponent inni `EditableRegion`s panel — den har
allerede sin egen "aktivert men ikke utfylt"-avkrysningstilstand
(`checkedKeys`) som må leve lokalt i panelet (ikke i selve
`attributes`-verdien), ellers ville autolagring trigget på hver avkrysning
i stedet for kun på faktiske verdiendringer.

Fjernet `src/routes/_authenticated/mine-annonser.ok.$id.rediger.tsx`
(gammelt helskjema + `useBlocker`-vakt) helt — ingen `useBlocker` er lenger
nødvendig siden alle felt autolagrer individuelt, samme som resten av
inline-redigeringen. `mine-annonser.index.tsx`s "Rediger"-lenke og
`wtb-listing-card.tsx`s tittel peker nå til `/ok/$id` (sistnevnte lenket
ingen steder fra før — nytt).

**Testpåvirkning:** `bunx tsc --noEmit` og `bun run lint` kjørt rent (0 feil,
kun eksisterende warnings). `bun run test`: 221/221 grønn (ingen eksisterende
tester dekket verken gammel eller ny WTB-redigering, som planen selv
bemerket — ingen ny komponenttest lagt til denne omgangen, avvik fra planens
anbefaling). Manuell verifisering i nettleser: `/ok/$id` med en ukjent ID
viser korrekt "Fant ikke annonsen"-tilstand uten konsollfeil (bekrefter
routing/rendering fungerer); full eier-redigeringsflyt med ekte data ikke
verifisert i denne omgangen (krever innlogget testbruker mot appens
faktiske Supabase-miljø, som ikke var tilgjengelig i denne økten).

Ingen nye funn underveis utover selve visningsflate-avklaringen over. Fase 6
(annonseveiviser: feilhåndtering) er neste anbefalte steg.

### Fase 6 — 2026-08-09

Utvidet `FieldGroup["validateExtra"]`-kontrakten
(`src/features/listing-creation/field-groups/registry.ts`) til å returnere
`{ field: string; message: string } | string | ...` — de tre
enkeltfelt-sjekkene som faktisk peker på ett konkret, ikke-RHF-registrert
felt (`vehicle-facts` → `mileage_km`, `boat-facts` → `brand`/`model`,
`vehicle-condition` → `known_issues`) returnerer nå objektformen; de øvrige
(`missingFilters`-lister, modul-feil i `category-attributes`,
`vehicle-registration`) beholdes som ren streng (toast only) — disse dekker
flere/ubestemte felt om gangen og egner seg ikke til én inline-banner.
`ny-annonse.tsx` setter ny `extraFieldError`-state ved objektresultat (nullstilt
ved hvert nytt valideringsforsøk), sendt gjennom `WizardSharedProps` til de tre
berørte field-group-komponentene, som viser en `text-destructive`-melding rett
ved det aktuelle feltet (samme visuelle mønster som eksisterende RHF-feil) i
tillegg til den eksisterende toasten — ikke i stedet for, siden toasten alene
fortsatt er nyttig når feltet er scrollet ut av syne.

`SHOW_NO_IMAGE_DIALOG`/`SHOW_NO_PRICE_DIALOG`-sentinelene er urørt, som planlagt.

Byttet `console.warn` for feilede kort-thumbnail-opplastinger
(`ny-annonse.tsx`) til å samle feilede filnavn og vise én `showErrorToast`
etter at alle bildene er lastet opp — fortsatt best-effort (stopper ikke
publisering), men brukeren ser nå at noe feilet i stedet for at det kun
havner i konsollen.

Lagt til én ny assertion i `publish-vehicle-listing.spec.ts` som dekker
`vehicle-condition`s `validateExtra`-feilvei (tidligere udekket, jf. planens
testpåvirkningsnotat): forsøk på å gå videre uten avkrysning eller utfylt
tekst blokkeres og viser inline-feilmeldingen. `data-testid`-kontrakten i
`e2e/pages/listing-wizard.ts` er ikke endret.

`bunx tsc --noEmit` rent. `bun run lint`: 0 feil (135 eksisterende warnings,
ingen i berørte filer). `bun run test src/features/listing-creation`: 71/71
grønn.

Ingen nye funn underveis. Fase 7 (meldinger: bildevedlegg) er neste anbefalte
steg.

### Fase 7 — 2026-08-09

Lagt til migrasjon `supabase/migrations/20260809160000_messages_attachment.sql`:
ny nullable `attachment_path text`-kolonne på `public.messages`, samt en ny
privat `message-attachments`-bucket (`storage.buckets`, `public: false`) —
ingen `storage.objects`-policy trengs, siden ingen eksisterende bucket i
repoet har det (tilgang styres av signerte URL-er, samme mønster som
`listing-images`/`listing-360-frames`). **Migrasjonen er ikke pushet/anvendt
i denne økten** — jf. CLAUDE.md-regelen skal den committes/pushes for seg
selv og bekreftes anvendt av Supabase sin GitHub-plugin før appkoden som
avhenger av kolonnen slippes i produksjon.

`src/lib/storage.ts` fikk `MESSAGE_ATTACHMENTS_BUCKET`,
`uploadMessageAttachment()` og `signMessageAttachmentUrls()` — sistnevnte
speiler `signVehicle360FrameUrls()` (samme enkle per-kall-cache, ingen
batching, siden en samtale har få vedlegg om gangen), i tråd med at
codebasen allerede har to nesten-identiske implementasjoner for de to andre
bucketene fremfor én generisk versjon.

`src/routes/_authenticated/meldinger.$id.tsx`: `sendMutation` tar nå
`{ text, file }` i stedet for kun tekst. Ved vedlegg komprimeres bildet med
eksisterende `compressImage(file, "listing")` (ingen ny preset lagt til, jf.
planens egen YAGNI-note) og lastes opp før selve meldingsraden settes inn,
slik at `attachment_path` er satt atomisk med INSERT. Optimistisk sending
viser en lokal `URL.createObjectURL`-forhåndsvisning
(`attachmentPreviewUrl` på `Message`), revokes i `onSuccess`/`onError`. Ny
binders-knapp (`Paperclip`) åpner et skjult filinput
(`accept="image/jpeg,image/png,image/webp"`), gjenbruker
`validateImages`/`describeImageError` fra `storage.ts` for
type-/størrelsesvalidering, med én liten forhåndsvisning + fjern-knapp over
komponisten. Maks 1 bilde per melding, som planlagt.

`src/components/meldinger/message-list.tsx`: `Message`-typen fikk
`attachment_path`/`attachmentPreviewUrl`, og bobleren rendrer nå bildet
(lokal preview eller signert URL fra et nytt `attachmentUrls`-map hentet via
`signMessageAttachmentUrls` i en effekt i route-filen) over meldingsteksten,
som skjules helt hvis meldingen kun har et vedlegg og tom body.

Ingen ny e2e-spec lagt til (planens egen testpåvirkningsnotat flagget dette
som betinget av at Supabase-avhengigheten i `e2e/global-setup.ts` er
tilgjengelig i CI — ikke reverifisert i denne økten). Ingen ny
komponenttest for selve opplastingsflyten heller (ingen eksisterende
meldingstester å bygge videre på, samme situasjon som fase 5 møtte for WTB).
`bunx tsc --noEmit`, `bun run lint` (0 feil) og `bun run test` (221/221
grønn) kjørt rent.

**Manuell verifisering ikke gjort i denne økten:** faktisk opplasting mot
Supabase (krever at migrasjonen er pushet/anvendt og en innlogget testbruker
mot ekte miljø, som fase 5 også manglet).

Ingen nye funn underveis. Fase 8 (auth-konsistens inkl. Turnstile) er neste
anbefalte steg.

## 9. Anbefalte neste steg (utenfor denne planens faser)

- **Gradvis `jsx-a11y`-oppgradering:** aktiver `alt-text`,
  `click-events-have-key-events`, `no-static-element-interactions`,
  `role-has-required-aria-props` og øvrige `recommended`-regler som
  `"warn"` først (samme eskaleringsmønster som allerede brukt for de
  nedgraderte `react-hooks`-reglene, `eslint.config.js:42-46`). Tell og
  noter antall eksisterende brudd per regel som utgangspunkt for gradvis
  opprydding. Ikke en del av fasene over — egen, uavgrenset innsats som bør
  spores separat når den startes.
- Re-prompt-strategi for push-varsler (seksjon 2.7) for brukere som hoppet
  over onboarding-priming.
- Frakoblet-indikator i meldingstråden ved tapt realtime-forbindelse
  (seksjon 2.5) — vurderes sammen med, men ikke nødvendigvis i, fase 7.
