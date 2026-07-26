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

- `ny-annonse.tsx`: 1770 → 1226 linjer (commits `817ebb6`..`3044c49`) — `useDraftAutosave`, `useVehicleLookupFlow`, `useLocationPicker`, `useListingTitleHints`
- `admin/kategorier.tsx`: 2003 → 496 linjer (commit `f40b812`) — splittet i 8 filer under `src/components/admin/categories/`
- `mine-annonser.$id.rediger.tsx`: 1145 → 835 linjer (commits `d6dd755`, `7494e1c`) — `useEditableListingImages`, `useEditLocationPicker`, `useEditListingHints`
- `annonser.tsx`: 943 → 822 linjer (commit `7b92f9b`) — `useAnnonserSearchState`
- `index.tsx`: 901 → 765 linjer (commit `0549c3e`) — `useCategoryDrilldown`

Alt verifisert med typecheck, lint, 98 tester, full bygg, og manuell nettleser-test for hvert steg (inkl. faktisk søk/filter/drilldown-interaksjon der ruta ikke krevde autentisering).

## Gjenstår

### Fase 3 — Testdekning

- Komponent-/enhetstester for alle de nye hookene under `src/features/listing-creation/`, `src/features/listing-search/` og `src/features/landing/` — ingen har egne tester ennå, kun manuelt verifisert i nettleser
- Vurder Vitest + React Testing Library hvis ikke allerede satt opp for komponenttester
- Flere Playwright E2E-specs utover `publish-listing.spec.ts`

### Fase 4 — Mindre opprydding

- Slå på `noUnusedLocals`/`noUnusedParameters` i `tsconfig.json` gradvis
- Duplisert lignende-annonser-søk/`SIMILAR_STOPWORDS`: finnes nå i tre varianter (`useListingTitleHints`, `useEditListingHints`, og opprinnelig i `mine-annonser.$id.rediger.tsx` — nå konsolidert til `useEditListingHints`). Vurder om `useListingTitleHints` og `useEditListingHints` kan slås sammen til én parameterisert hook (med/uten kategoriforslag, med/uten selv-ekskludering).
- Verifiser ingen andre steder har samme fail-open- eller "synkron callback i useEffect"-mønster som Turnstile- og auth-bugene som ble funnet og fikset underveis

## Praktisk oppstart neste gang

```bash
git pull origin staging
```

Fase 2 (komponentoppdeling) er ferdig. Neste steg er Fase 3 (testdekning) — start med å sette opp React Testing Library hvis det ikke finnes, deretter skriv tester for hookene i prioritert rekkefølge: `use-draft-autosave.ts` og `use-vehicle-lookup-flow.ts` (høyest risiko, betaling/kjøretøy-oppslag involvert) først.
