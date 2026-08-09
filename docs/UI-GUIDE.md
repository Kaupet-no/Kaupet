# UI-konvensjoner

Kort referanse for konsistente mønstre i Kaupet-frontend. Utledet fra en UI/UX-gjennomgang (2026-07-14) — utvid etter hvert som nye mønstre bekreftes, ikke som en fullstendig spesifikasjon på forhånd.

## Komponenter

- Bruk primitiver fra `src/components/ui/` (shadcn/ui, "new-york"-stil) fremfor egne implementasjoner av dialog, sheet, tabell, skeleton osv.
- Web bruker `Dialog`, native bruker `Sheet` for tilsvarende flyter. Bruk `ResponsiveOverlay`/`ResponsiveOverlayContent` (`src/components/ui/responsive-overlay.tsx`) i stedet for å grene manuelt på `useIsNative()` — den velger riktig primitiv automatisk:

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

  `DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` fungerer uendret inni begge varianter, siden `Dialog` og `Sheet` er bygget på samme `@radix-ui/react-dialog`-primitiv. `app-bottom-nav.tsx`s "Ny annonse"-velger er fortsatt en manuell `!native ? <Dialog> : <Sheet>`-gren (forhåndsdatert `ResponsiveOverlay`) — nytt overlay-UI bør bruke `ResponsiveOverlay` fra start.

## Destruktive/irreversible handlinger

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

## Loading/empty/error-states

- `Skeleton` (`ui/skeleton.tsx`) for innhold som laster.
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
- Touch-targets skal være minst 44×44px (se `app-bottom-nav.tsx`).
- Bruk `pt-safe` / `env(safe-area-inset-bottom)` for områder nær systemets UI (status bar, home indicator).
- Unngå `Tooltip` og andre hover-avhengige mønstre i flater som vises i native-appen.

## Skjemavalidering

- `react-hook-form` + `zod` via `zodResolver`. Se `src/routes/auth.tsx` for standardoppsett med `mode: "onTouched"`.
