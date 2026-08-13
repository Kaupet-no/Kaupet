# UI-konvensjoner

Kort referanse for konsistente mønstre i Kaupet-frontend.

1. [shadcn/ui-primitiver](#shadcnui-primitiver)
2. [Dialoger og overlays](#dialoger-og-overlays)
3. [Autocomplete/forslagsdropdown](#autocompleteforslagsdropdown)
4. [Fremdriftsindikatorer](#fremdriftsindikatorer)
5. [Varselbannere](#varselbannere)
6. [Loading/empty/error-states](#loadingemptyerror-states)
7. [Tilgjengelighet](#tilgjengelighet)
8. [Native (Capacitor)](#native-capacitor)
9. [Native søk og filtre](#native-søk-og-filtre)
10. [Skjemavalidering](#skjemavalidering)
11. [Flerstegs opprettelsesflyter](#flerstegs-opprettelsesflyter)

## shadcn/ui-primitiver

Bruk primitiver fra `src/components/ui/` (shadcn/ui, "new-york"-stil, se `components.json`) fremfor egne implementasjoner av dialog, sheet, tabell, skeleton osv.

- **Mangler en primitiv** (f.eks. `alert`, `popover`, `progress`)? Legg den til med:

  ```bash
  bunx shadcn@latest add <navn>
  ```

  Den havner riktig i `src/components/ui/` med riktig stil/alias automatisk — ikke bygg en egen versjon manuelt.

- **Filene i `ui/` er generert, men ikke urørlige.** Trenger du en variant primitiven ikke har (f.eks. `warning`-varianten lagt til i `ui/alert.tsx`, siden shadcn sin standard-`alert` bare har `default`/`destructive`), utvid `cva`-variantene direkte i filen — ikke bygg en parallell, håndstylet variant utenfor `ui/`. Kjør `add` på nytt kun når du bevisst vil hente en shadcn-oppdatering, siden det overskriver filen — sjekk at lokale variant-tillegg overlever før du gjør det.

## Dialoger og overlays

Tre primitiver dekker det aller meste — velg ut fra hva flyten faktisk trenger:

| Situasjon                                                          | Primitiv            |
| ------------------------------------------------------------------ | ------------------- |
| Vanlig dialog/skjema, web + native                                 | `ResponsiveOverlay` |
| Fullskjerm-takeover uten kortet-chrome (galleri, kart, onboarding) | `FullscreenOverlay` |
| Destruktiv/irreversibel bekreftelse                                | `AlertDialog`       |

### Formatfaktor-responsive dialoger

**Telefon** (native, < 768px) bruker `Sheet`; **nettbrett** (native, ≥ 768px) og **web** bruker `Dialog`. Bruk `ResponsiveOverlay`/`ResponsiveOverlayContent` (`src/components/ui/responsive-overlay.tsx`) i stedet for å grene manuelt — den velger riktig primitiv automatisk:

```tsx
<ResponsiveOverlay open={open} onOpenChange={setOpen}>
  <ResponsiveOverlayContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Tittel</DialogTitle>
    </DialogHeader>
    …
  </ResponsiveOverlayContent>
</ResponsiveOverlay>
```

`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` fungerer uendret inni begge varianter, siden `Dialog` og `Sheet` er bygget på samme `@radix-ui/react-dialog`-primitiv.

- Grenen går på `useFormFactor()` (`src/hooks/use-form-factor.ts`), ikke `useIsNative()`: en fullbredde bunn-skuff er riktig på 375px og feil på 1024px. Hooken returnerer `"phone" | "tablet" | "web"` og skal kalles der oppsettet faktisk forgrener — ikke spres som en `isTablet`-boolsk rundt i koden.
- Bruk `ResponsiveOverlay` for alt brukervendt — en dialog som går rett på `Dialog` mister bottom-sheet-oppførselen native-appen ellers har (se `kaupet-code-dialog.tsx`).
- Rene admin-flater (`src/routes/_authenticated/admin/**`) er unntaket og kan fortsette å bruke `Dialog` direkte, siden de uansett ikke kjører i native-appen (se `create-demo-user-dialog.tsx`).
- Begge overlay-rotene (`ResponsiveOverlay` og `FullscreenOverlay`) gir seg selv en egen historikk-oppføring via `useOverlayHistory` (`src/hooks/use-overlay-history.ts`), slik at Android-tilbakeknappen og iOS' kantsveip lukker overlayet i stedet for å navigere siden bak det. Ikke gjenta `history.pushState`/`popstate` i en konsument. Trenger en flate å _ikke_ kunne lukkes med tilbake, sett `historyBack={false}` på `FullscreenOverlay` (kun onboardingen gjør det i dag).

### Fullskjerm-takeovers

For manuelt posisjonerte `fixed inset-0`-fullskjermtakeovers (bildegalleri, kart, native søk/filter, onboarding), bruk `FullscreenOverlay`/`FullscreenOverlayContent` (`src/components/ui/fullscreen-overlay.tsx`) i stedet for en håndbygd `<div role="dialog">`. Bygget på samme Radix Dialog-primitiv som `Dialog`, men uten kortet-chrome — gir portal, fokus-trap og escape-to-close gratis. `title`-propen er skjult for øyet men påkrevd av Radix for skjermlesere.

```tsx
<FullscreenOverlay open={open} onOpenChange={(next) => !next && onClose()}>
  <FullscreenOverlayContent title="Beskrivende tittel for skjermlesere">…</FullscreenOverlayContent>
</FullscreenOverlay>
```

**Skal overlayet ikke kunne lukkes** med Escape eller klikk utenfor (f.eks. et pågående kameraopptak, eller en onboarding-flyt brukeren ikke skal kunne hoppe forbi) — deaktiver eksplisitt, ikke stol på at fravær av lukkeknapp er nok:

```tsx
<FullscreenOverlayContent
  title="…"
  onEscapeKeyDown={(e) => e.preventDefault()}
  onInteractOutside={(e) => e.preventDefault()}
>
```

**z-index og stabling i `document.body`:** `FullscreenOverlay`/`FullscreenOverlayContent` bruker `z-[10000]` — samme nivå som `Dialog`, `Sheet` og `AlertDialog`. Radix portalerer hver åpne dialog til `document.body` i den rekkefølgen de _monteres_ (ikke i JSX-nøstingsrekkefølge), og ved lik z-index vinner senere DOM-plassering. Det betyr at en `Sheet`/`Dialog` som kun monteres når brukeren eksplisitt åpner den (mens et `FullscreenOverlay` allerede er oppe) automatisk havner over — se `TermGroupSheet` i `features/listing-search/search-panel/filter-sections.tsx` for referanse.

Ikke løs stablingsrekkefølge ved å sette en vilkårlig lavere `z-[9999]` på det ytre overlayet for å "garantere" det ligger under — det brøt sammen så snart begge lå på samme nivå og skapte en skjør avhengighet av implisitt monteringsrekkefølge fremfor en eksplisitt en. Trenger du en garanti som _ikke_ avhenger av monteringsrekkefølge (f.eks. et overlay som kan være åpent samtidig som et annet, i en rekkefølge du ikke kontrollerer), sett en eksplisitt høyere `z-`-verdi via `className` på den ytre `FullscreenOverlayContent` i stedet for å stole på stabling.

### Destruktive/irreversible handlinger

Bruk aldri nettleserens `confirm()`. Bruk `AlertDialog` (`src/components/ui/alert-dialog.tsx`) med state for målet som skal slettes/refunderes:

```tsx
const [targetId, setTargetId] = useState<string | null>(null);

<AlertDialog open={!!targetId} onOpenChange={(open) => !open && setTargetId(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>…</AlertDialogTitle>
      <AlertDialogDescription>Dette kan ikke angres.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Avbryt</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          /* utfør handling */ setTargetId(null);
        }}
      >
        Bekreft
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>;
```

Se `src/routes/_authenticated/admin/promoteringer.tsx` (refusjon) og `admin/vipps-webhooks.tsx` (slett webhook) for referanseimplementasjon.

## Autocomplete/forslagsdropdown

Frittstående forslags-/autocomplete-dropdown på et tekstfelt: `Popover`/`PopoverAnchor` (`src/components/ui/popover.tsx`), ikke en håndrullet absolutt-posisjonert `<ul>` med `setTimeout`-blur-hack for å styre lukking.

- `PopoverAnchor asChild` rundt selve inputen gir riktig posisjonering/portal gratis.
- Styr synlighet med `open={visningsbetingelse}` (ikke bare fokus).
- Legg `onOpenAutoFocus`/`onCloseAutoFocus` med `e.preventDefault()` på `PopoverContent` så fokus blir stående i inputfeltet.

Se `field-groups/boat-facts/index.tsx` for referanseimplementasjon.

## Fremdriftsindikatorer

Steg-/fremdriftsindikatorer: `Progress` (`src/components/ui/progress.tsx`), ikke en håndbygd `role="progressbar"`-div. Se `step-indicator.tsx`.

## Varselbannere

Inline varsler/banner i innholdsflyten (ikke destruktiv bekreftelse, ikke toast): `Alert`/`AlertTitle`/`AlertDescription` (`src/components/ui/alert.tsx`), ikke en håndstylet `bg-amber-*`/`bg-destructive/*`-div.

Tre varianter: `default`, `destructive`, og `warning` (amber, for advarsler som ikke er feil — f.eks. moderasjonsbanner, uverifiserte opplysninger). Se `moderation-banner.tsx` og `field-groups/vehicle-confirm/index.tsx`.

## Loading/empty/error-states

- `Skeleton` (`ui/skeleton.tsx`) for innhold som laster — ikke en håndrullet `animate-pulse rounded bg-muted`-div.
- `EmptyState` (`ui/empty-state.tsx`) når en liste/tabell er tom.
- For korte, inline laste-indikatorer: `<div role="status" aria-live="polite"><Loader2 className="animate-spin" aria-hidden="true" /><span className="sr-only">…</span></div>`.
- Hent data ved mount (`useEffect`/`useQuery`) — ikke la siden vise "ingen data" før brukeren manuelt trigger en oppdatering.

## Tilgjengelighet

- Alle interaktive ikon-only-elementer skal ha `aria-label`.
- Skjemafelt: koble feilmeldinger med `aria-invalid` + `aria-describedby` (se `src/routes/auth.tsx`).
- Landemerker: `<header>`/toppnav bruker `<nav aria-label="Hovednavigasjon">`, mobil bunnav bruker `<nav aria-label="Bunnavigasjon">`. Rot-layout (`src/routes/__root.tsx`) har en skip-link til `#main-content` og `<main id="main-content">`.
- `aria-current="page"` på aktive navigasjonslenker.

## Native (Capacitor)

- Sjekk `isNative()` (`@/lib/native`) eller hooken `useIsNative()` for å grene mellom web- og native-UI — ikke dupliser hele komponenter.
- **Verifisere native-grener i nettleser:** legg til `?forcenative` i URL-en i dev
  (`http://localhost:3000/?forcenative`), så returnerer `isNative()` true og hele
  native-grenen rendres. Overstyringen er gated på `import.meta.env.DEV` og finnes
  ikke i produksjonsbygget. Bruk den til layoutverifisering på 375×812, 844×390,
  820×1180 og 1024×1366 — safe-area-verdier er alltid 0 i nettleser, så de må
  fortsatt sjekkes i simulator.
- Touch-targets skal være minst 48×48px (dekker både Apples 44 pt og Androids
  48 dp; se `app-bottom-nav.tsx`).
- **Safe area:** `FullscreenOverlayContent` og `Sheet side="bottom"` håndterer det selv — ikke legg til padding på kallstedet. Skal en fullskjermflate gå helt ut i kanten (bilde, kart, kamera), sett `edgeToEdge` og padre ditt eget chrome i stedet, ikke medieinnholdet.
- Utilities for chrome som ikke går via de primitivene: `.pt-safe`/`.pb-safe` (min. 0,5rem), `.pl-safe`/`.pr-safe` (null i basis — for elementer uten egen horisontal padding), `.px-safe` (1rem i basis — erstatning for `px-4`) og `.p-safe` (alle fire kanter, ingen minimum). Merk at de er ulagede og derfor **erstatter** `padding` fra Tailwind-utilities på samme element — velg varianten hvis basisverdi matcher det kallstedet hadde.
- **Orientering:** telefon er låst til portrett ved oppstart, nettbrett roterer fritt (`src/lib/orientation.ts`). Trenger en flate landskap, kall `unlockOrientation()` ved mount og `lockPortraitOnPhone()` ved unmount — se `image-lightbox.tsx`, som er eneste unntak i dag. Ikke fjern landskap fra `Info.plist`: låsen styres i kjøretid, og plisten er det som gjør unntaket mulig i det hele tatt.
- **Native-only CSS:** `setupNative()` setter klassen `.native` på `<html>`. Bruk den som gate for regler som kun skal gjelde i appen (tap-highlight, `user-select`, `overscroll-behavior` — se `styles.css`). Native scroll skal beholde WebView-ens plattformfeedback (iOS-bounce og Android edge-stretch/glow); bruk `overscroll-behavior: contain` på en konkret overlay-scrollregion når scroll ikke skal lekke til flaten bak. Merk at `user-select: none` bevisst er begrenset til interaktive elementer: brødtekst, annonsebeskrivelser og meldinger skal fortsatt kunne kopieres.
- **Bunn-sheets kan dras ned for å lukkes** (`vaul` i `ui/sheet.tsx`, kun `side="bottom"`). Håndtaket rendres automatisk — ikke legg til ditt eget. Lange paneler bruker `expandable` (og eventuelt `initialSnapPoint`) på `SheetContent`/`NativeSheet`: første oppoverscroll utvider panelet til full høyde før innholdet ruller, mens nedoverdrag ved listetoppen bruker Vauls motstand, snap-back og lukkegrense. Merk sliders og andre kontroller som tar sin egen gest med `data-vaul-no-drag`.
- **Søk på native går gjennom ett panel.** `SearchPanel` (`src/features/listing-search/search-panel/`) er den eneste native søkeflaten: et dratt `vaul`-panel med to detents (60 % / fullskjerm). Uten `results`-propen er det en søkelansering (fritekst, historikk, kategorier); med den redigerer det filtrene til resultatflaten det står over. Resultatflatene viser `SearchSummaryPill` i stedet for søkelinje + chip-rad. Ikke legg til en tredje native søkeflate ved siden av — utvid panelet. `NativeAdvancedSearch` er etter dette **kun** redigering av et lagret søk (`mine-sok.tsx`); begge rendrer de samme `SearchFilterSections`.
- `vaul` brukes av alle bunn-sheets gjennom `SheetContent`; den ytre Radix-roten beholdes for felles dialogkontekst og API. `SearchPanel` har fortsatt sin egen `Drawer.Root` fordi det alltid har søkespesifikke detents (60 % / fullskjerm), men bruker samme scroll-overlevering som `SheetContent`.
- **Haptikk:** kall bare wrapperne i `src/lib/haptics.ts`, aldri Capacitor-pluginen direkte. Wrapperne normaliserer impact, selection og notification til én lett touch slik at handlinger ikke gir lange vibrasjonsmønstre på Android.
- **Tekststørrelse:** `src/lib/text-scale.ts` speiler iOS' Dynamic Type inn i `html { font-size }`. Bruk `rem` (Tailwinds standard) for all typografi — `px`-satt tekst skalerer ikke med brukerens innstilling. Android trenger ingenting; WebView-en skalerer allerede selv.
- Unngå `Tooltip` og andre hover-avhengige mønstre i flater som vises i native-appen.

## Native søk og filtre

Native søk og filtrering bruker én `SearchPanel`-flyt. Første nivå er alltid
en oversikt over valgt tilstand; en detaljkontroll åpnes på egen flate. Ikke
legg søketreff, flere dropdown-lister, checkboksmatriser eller flere slidere i
oversikten samtidig.

### Tetthet, rader og handlinger

- Bruk `px-4` (16 px) som horisontal sidemarg på telefon, `gap-6` mellom
  hovedgrupper og `gap-2` eller `gap-3` mellom relaterte rader.
- En filterrad er minst 56 px høy, har minst 16 px horisontal og 12 px
  vertikal padding, og hele raden er tappbar. La raden vokse for lang eller
  skalert tekst; ikke bruk fast høyde eller `truncate` på eneste verdi.
- Interaktive elementer er minst 48×48 px effektivt. Bruk
  `native-touch-target` når selve kontrollen kan vokse, og `native-hit-area`
  for kompakt ikon-chrome med separat, ikke-overlappende treffområde.
- Primær bunnhandling er én fullbredde `Button size="lg"` med `h-14`; den
  ligger i panellets dialogtre og viser live treffantall. Nullstilling er en
  sekundær teksthandling og er bare synlig når et filter er aktivt.
- Bruk semantiske tokens, luft og typografi før ekstra rammer. Ikke lag kort
  inni kort eller flere fylte primærknapper i samme viewportseksjon.

### Valgflater

På telefon skal filterflyten ikke bruke ankret `SelectContent` eller popover
for valg. `Select` er fortsatt riktig på web og desktop. Velg flate etter
innholdet:

| Innhold                    | Telefon                                                | Nettbrett/web                    |
| -------------------------- | ------------------------------------------------------ | -------------------------------- |
| 2–5 korte enkeltvalg       | Store, hele tappbare valgknapper/radiokontroller       | `Select` eller radiokontroller   |
| 6–12 valg                  | `NativeSheet` med fullbreddsrader                      | `Select` eller dialog            |
| Mer enn 12/lange etiketter | Fullhøyde `NativeSheet` med søk                        | Dialog med søk ved behov         |
| Flervalg                   | Søkbar sjekkliste, valgte verdier først og fast «Bruk» | Samme semantikk, passende dialog |
| Hierarki                   | Drill-down med breadcrumb og tilbake                   | Dialog eller sidepanel           |

Valgraden skal være minst 52–56 px høy. Gjør hele checkbox-/radio-/switchraden
tappbar, uttrykk valgt tilstand visuelt og semantisk, og tilby eksplisitt
«Alle»/«Ingen begrensning». Bevar valgte verdier mens listen søkes. Bruk
eksisterende `NativeSheet`/`ResponsiveOverlay` og `Checkbox`; ikke opprett en
lokal variant av valgflaten per filter.

```tsx
<NativeSheet open={open} onOpenChange={setOpen} title="Velg tilstand" titleVisible expandable>
  <button
    type="button"
    className="native-touch-target flex min-h-14 w-full items-center px-4 text-left"
  >
    Brukt
  </button>
  <Button type="button" size="lg" className="mt-6 h-14 w-full" onClick={apply}>
    Bruk valg
  </Button>
</NativeSheet>
```

### Tall, tilgjengelighet og navigasjon

- Pris, årstall og ekspertverdier prioriterer romslige Fra/Til-felt og
  relevante hurtigvalg. Slider er sekundær og brukes bare når relativ
  justering hjelper mer enn presis inntasting.
- `Slider`/`RangeSlider` skal beholde `data-vaul-no-drag`, synlig tekstverdi,
  tastaturtilgang og minst 24 px synlig thumb / 48×48 px effektivt treffområde.
  Gi sliderregionen minst 24 px luft over og under sporet.
- En filterunderside åpnes i full høyde på telefon. Tilbake går ett nivå opp,
  gjenoppretter fokus og scroll til raden som åpnet undersiden, og lar
  overlay-primitiven eie Android-tilbake/iOS-kantsveip.
- Fast bunnhandling skal ikke portaleres utenfor det aktive dialogtreet.
  Ved ny opptelling beholdes forrige treffantall med en kort statusmelding
  (`role="status"`, `aria-live="polite"`).
- Tekst og verdier bruker `rem`; verifiser 200 % tekst og eksternt tastatur.
  En gesture, inkludert swipe for fjerning, er aldri eneste måte å gjøre en
  handling på.

## Skjemavalidering

- `react-hook-form` + `zod` via `zodResolver`. Se `src/routes/auth.tsx` for standardoppsett med `mode: "onTouched"`.

## Flerstegs opprettelsesflyter

Retningslinjene gjelder innholdsproduksjon som annonseopprettelse på tvers av
native og web. Den detaljerte målarkitekturen og den levende statusloggen for
annonser ligger i [ANNONSEOPPRETTELSE-UX-PLAN.md](ANNONSEOPPRETTELSE-UX-PLAN.md).

### Én gjenkjennelig composer

- Flyter som oppretter samme type brukerinnhold skal dele skall, navigasjon,
  fremdrift, lagringsstatus, valideringsmønster og ferdigtilstand. Del ikke
  domene-spesifikke felt bare for visuell likhet.
- På telefon er en kompleks flerstegsoppgave en full rute, ikke en veiviser
  inni et bunn-sheet. Sheet/dialog brukes til korte valg og detaljkontroller.
- Bruk ett delt composer-skall når det er implementert. Skallet skal eie
  `NativePageHeader`, `StepIndicator`, safe area, fast native footer, fokus ved
  sideskifte og avslutningsvern; det skal ikke inneholde kategori- eller
  kjøretøylogikk.
- Native og web skal ha samme semantiske siderekkefølge og valideringsgrenser.
  Web kan samle relaterte grupper på færre sider og bruke en sekundærkolonne,
  men skal ikke bli en separat produktflyt.

### Sidekontrakt og visuell rytme

- Ett steg skal ha ett forståelig oppgavenavn og primært én hovedbeslutning.
  Bruk korte verb-/spørsmålsformuleringer som «Hva vil du selge?» fremfor
  interne domenenavn.
- På telefon: 16 px horisontal padding, minst 24 px mellom hovedseksjoner og
  8–12 px mellom relaterte felt. Bruk luft og typografi før rammer; aldri kort
  inni kort for å skille hvert enkelt felt.
- Valgrader er minst 56 px høye og hele raden er tappbar. Alle interaktive
  treffområder er minst 48×48 px.
- Fast native footer ligger over `--app-bottom-nav-h`, håndterer safe area og
  har én fullbredde `Button size="lg"`/`h-14` som primærhandling. Tilbake er i
  native header; web kan vise tilbake i footer.
- Tastaturet skal ikke dekke aktivt felt eller primærhandlingen. Ikke bruk
  fast viewporthøyde uten å ta hensyn til `--vvh`, safe area, appnavigasjon og
  skalert tekst.

### Fremdrift, navigasjon og fokus

- Bruk `StepIndicator`/`Progress`, med «Steg X av Y» og gjeldende oppgavenavn.
  Ikke bygg en lokal variant med nummererte sirkler.
- Ikke vis et eksakt totalantall før den kategoriavhengige flyten er kjent.
  Dynamisk innsetting av tekniske undersider skal ikke få det synlige
  stegantallet til å hoppe urimelig.
- Android system-tilbake, iOS kantsveip og synlig tilbakehandling går ett
  steg tilbake før ruten forlates. Bruk én delt historikkmekanisme; ikke legg
  lokale `pushState`-varianter i hver flyt.
- Etter sideskifte flyttes fokus til sidens overskrift eller første relevante
  felt og scroll starter på toppen. Ved valideringsfeil flyttes fokus til
  første ugyldige felt. «Endre» fra oppsummering skal returnere fokus og
  scroll til seksjonen som åpnet steget.

### Utkast, validering og status

- Brukergenerert innhold i en flerstegsflyt skal autolagres lokalt, og på
  konto når mulig. Vis stabil status: «Lagrer …», «Lagret» eller en konkret
  feil. En lagringsfeil skal aldri slette den lokale kopien.
- Lokale utkast skal ha eksplisitt innholdstype og skjemaversjon. Salg og
  kjøpsønske bruker separate lagringsnøkler, og nyeste gyldige kopi vinner ved
  konflikt mellom enhet og server. Et nyere lokalt utkast overskrives aldri
  automatisk av en eldre serverkopi.
- Ved avslutning med endringer: tilby «Lagre som utkast», «Forkast» og
  «Fortsett å redigere». Vanlig tilbake mellom steg skal ikke utløse dialog.
- Feltvalidering vises inline med `aria-invalid` og `aria-describedby`.
  Ved flere feil vises en fokusérbar feiloppsummering øverst. Toast er for
  nettverks-/systemfeil, ikke eneste forklaring på et ugyldig felt.
- Bruk `mode: "onTouched"`. En deaktivert «Fortsett»-knapp skal ikke være
  eneste signal om hva som mangler; forklar kravet ved feltet.
- Langvarig oppslag, opplasting og publisering viser konkret status med
  `role="status"`/`aria-live="polite"`. Blokker dobbeltinnsending og gjør
  publiseringskall idempotente der det er mulig.

### Oppsummering og ferdigtilstand

- Før publisering skal brukeren få en kompakt «Se over»-side. Vis seksjoner
  med forståelige verdier og «Endre» som går til riktig steg. Visuell
  fullforhåndsvisning kan være sekundær; ikke tving alle annonsetyper inn i
  samme kortpresentasjon.
- Vis hvem som kan se informasjon og hva publisering/varsling gjør der
  beslutningen tas. Konkret status skaper mer tillit enn dekorative
  sikkerhetsmerker.
- Ferdigtilstanden bekrefter resultatet og har én anbefalt neste handling
  («Se annonsen»/«Se kjøpsønsket») samt én sekundær vei til oversikten.
  Haptikk kan støtte visuell og tekstlig feedback, aldri erstatte den.

### Plattform- og tilgjengelighetskontroll

- Verifiser minimum 375×812, 844×390, 820×1180 og 1024×1366, pluss 320 px
  web og 200 % zoom/tekst. Test lys/mørk modus og redusert bevegelse.
- Verifiser VoiceOver, TalkBack, Switch Access og eksternt tastatur. Ingen
  handling skal avhenge av swipe, farge, hover eller tidsbegrenset toast.
- Følg Apples anbefalinger om enkel datainntasting og vern mot datatap, og
  Androids krav om minst 48 dp treffområder. Plattformkildene og begrunnelsen
  er samlet i annonseplanens seksjon «Grunnlag og metode».
