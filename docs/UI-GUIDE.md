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
9. [Skjemavalidering](#skjemavalidering)

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

### Web/native-responsive dialoger

Web bruker `Dialog`, native bruker `Sheet` for tilsvarende flyter. Bruk `ResponsiveOverlay`/`ResponsiveOverlayContent` (`src/components/ui/responsive-overlay.tsx`) i stedet for å grene manuelt på `useIsNative()` — den velger riktig primitiv automatisk:

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

- `app-bottom-nav.tsx`s "Ny annonse"-velger er fortsatt en manuell `!native ? <Dialog> : <Sheet>`-gren (forhåndsdatert `ResponsiveOverlay`) — nytt overlay-UI bør bruke `ResponsiveOverlay` fra start.
- Bruk `ResponsiveOverlay` for alt brukervendt — en dialog som går rett på `Dialog` mister bottom-sheet-oppførselen native-appen ellers har (se `kaupet-code-dialog.tsx`).
- Rene admin-flater (`src/routes/_authenticated/admin/**`) er unntaket og kan fortsette å bruke `Dialog` direkte, siden de uansett ikke kjører i native-appen (se `create-demo-user-dialog.tsx`).

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

**z-index og stabling i `document.body`:** `FullscreenOverlay`/`FullscreenOverlayContent` bruker `z-[10000]` — samme nivå som `Dialog`, `Sheet` og `AlertDialog`. Radix portalerer hver åpne dialog til `document.body` i den rekkefølgen de _monteres_ (ikke i JSX-nøstingsrekkefølge), og ved lik z-index vinner senere DOM-plassering. Det betyr at en `Sheet`/`Dialog` som kun monteres når brukeren eksplisitt åpner den (mens et `FullscreenOverlay` allerede er oppe) automatisk havner over — se `TermGroupSheet` i `native-advanced-search.tsx` for referanse.

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
- Touch-targets skal være minst 44×44px (se `app-bottom-nav.tsx`).
- **Safe area:** `FullscreenOverlayContent` og `Sheet side="bottom"` håndterer det selv — ikke legg til padding på kallstedet. Skal en fullskjermflate gå helt ut i kanten (bilde, kart, kamera), sett `edgeToEdge` og padre ditt eget chrome i stedet, ikke medieinnholdet.
- Utilities for chrome som ikke går via de primitivene: `.pt-safe`/`.pb-safe` (min. 0,5rem), `.pl-safe`/`.pr-safe` (null i basis — for elementer uten egen horisontal padding), `.px-safe` (1rem i basis — erstatning for `px-4`) og `.p-safe` (alle fire kanter, ingen minimum). Merk at de er ulagede og derfor **erstatter** `padding` fra Tailwind-utilities på samme element — velg varianten hvis basisverdi matcher det kallstedet hadde.
- Unngå `Tooltip` og andre hover-avhengige mønstre i flater som vises i native-appen.

## Skjemavalidering

- `react-hook-form` + `zod` via `zodResolver`. Se `src/routes/auth.tsx` for standardoppsett med `mode: "onTouched"`.
