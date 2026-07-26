# Utbedringsplan — status og videre arbeid

Se full plan i samtalehistorikken / `iterative-strolling-minsky.md`-planfilen for bakgrunn. Dette dokumentet er en kort statusoppdatering for å plukke opp arbeidet igjen.

## Ferdig (committet og pushet til `staging`)

**Fase 1 — sikkerhet/konsistens** (commit `922ed59`)

- Turnstile fail-closed i produksjon
- Delt rate-limit-hjelper i `listings.functions.ts`
- Fjernet ubrukt `package-lock.json`
- CI: `bun audit` blokkerer nye høy/kritisk-sårbarheter
- CodeQL-workflow lagt til

**Bifunn — global React-advarsel** (commit `37e716f`)

- `AuthProvider` kalte state-settere synkront fra `onAuthStateChange` idet man abonnerte, som trigget "Can't perform a React state update on a component that hasn't mounted yet" på _hver_ side i appen. Fikset med `queueMicrotask`.

**Fase 2 — alle fire gud-komponenter ferdig oppdelt:**

- `ny-annonse.tsx`: 1770 → 1226 linjer — `useDraftAutosave`, `useVehicleLookupFlow`, `useLocationPicker`, `useListingTitleHints`
- `admin/kategorier.tsx`: 2003 → 496 linjer — splittet i 8 filer under `src/components/admin/categories/`
- `mine-annonser.$id.rediger.tsx`: 1145 → 835 linjer — `useEditableListingImages`, `useEditLocationPicker`, `useEditListingHints`
- `annonser.tsx`: 943 → 822 linjer — `useAnnonserSearchState`
- `index.tsx`: 901 → 765 linjer — `useCategoryDrilldown`

**Fase 3 — testdekning ferdig** (commits `52bdf16`, `8edf1ab`)

- Satte opp React Testing Library + jsdom (devDependencies, per-fil `@vitest-environment jsdom`-pragma slik at de opprinnelige node-miljø-testene ikke påvirkes)
- Alle ni hooks fra fase 2 har nå egen testdekning: `useDraftAutosave`, `useVehicleLookupFlow`, `useLocationPicker`, `useListingTitleHints`, `useEditableListingImages`, `useEditLocationPicker`, `useEditListingHints`, `useAnnonserSearchState`, `useCategoryDrilldown`
- Full suite: **165 tester** (98 opprinnelige + 67 nye), alle grønne

Alt verifisert med typecheck, lint, full test-suite, full bygg, og manuell nettleser-test for hvert steg i fase 1/2.

## Gjenstår

### Fase 4 — Mindre opprydding

- Slå på `noUnusedLocals`/`noUnusedParameters` i `tsconfig.json` gradvis
- Vurder å slå sammen `useListingTitleHints` og `useEditListingHints` til én parameterisert hook (med/uten kategoriforslag, med/uten selv-ekskludering) — nesten identisk logikk i to filer
- Verifiser ingen andre steder har samme fail-open- eller "synkron callback i useEffect"-mønster som Turnstile- og auth-bugene som ble funnet og fikset underveis
- Flere Playwright E2E-specs utover `publish-listing.spec.ts`

## Praktisk oppstart neste gang

```bash
git pull origin staging
```

Fase 2 og 3 er ferdig. Det som gjenstår (Fase 4) er lavthengende frukt — kan gjøres i vilkårlig rekkefølge, ingen avhengigheter mellom punktene.
