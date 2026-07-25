# Utbedringsplan — status og videre arbeid

Se full plan i samtalehistorikken / `iterative-strolling-minsky.md`-planfilen for bakgrunn. Dette dokumentet er en kort statusoppdatering for å plukke opp arbeidet igjen.

## Ferdig (committet og pushet til `staging`)

**Fase 1 — sikkerhet/konsistens** (commit `922ed59`)

- Turnstile fail-closed i produksjon
- Delt rate-limit-hjelper i `listings.functions.ts`
- Fjernet ubrukt `package-lock.json`
- CI: `bun audit` blokkerer nye høy/kritisk-sårbarheter
- CodeQL-workflow lagt til

**Fase 2 — `ny-annonse.tsx`** (1770 → 1226 linjer, commits `817ebb6`..`3044c49`)

- `useDraftAutosave`, `useVehicleLookupFlow`, `useLocationPicker`, `useListingTitleHints` trukket ut til `src/features/listing-creation/`

**Fase 2 — `admin/kategorier.tsx`** (2003 → 496 linjer, commit `f40b812`)

- Splittet i 8 filer under `src/components/admin/categories/` (ren fil-splitting, verifisert byte-for-byte mot original)

Alt verifisert med typecheck, lint, 98 tester, full bygg, og manuell nettleser-test for hvert steg.

## Gjenstår

### Fase 2 — resterende gud-komponenter (prioritert rekkefølge)

1. **`mine-annonser.$id.rediger.tsx`** (1145 linjer) — trolig samme entangled-state-mønster som `ny-annonse.tsx` siden det er "rediger"-tvillingen til den. Sjekk om `useDraftAutosave`/`useVehicleLookupFlow`/`useLocationPicker` kan gjenbrukes direkte eller trenger en "edit mode"-variant.
2. **`annonser.tsx`** (943 linjer) — søk/listevisning
3. **`index.tsx`** (901 linjer) — landingsside

### Fase 3 — Testdekning

- Komponenttester for de nye hook-ene (`use-draft-autosave.ts`, `use-vehicle-lookup-flow.ts`, `use-location-picker.ts`, `use-listing-title-hints.ts`) — ingen har egne tester ennå, kun manuelt verifisert i nettleser
- Vurder Vitest + React Testing Library hvis ikke allerede satt opp
- Flere Playwright E2E-specs utover `publish-listing.spec.ts`

### Fase 4 — Mindre opprydding

- Slå på `noUnusedLocals`/`noUnusedParameters` i `tsconfig.json` gradvis
- `mine-annonser.$id.rediger.tsx` har en duplisert kopi av `SIMILAR_STOPWORDS`/lignende-annonser-søket som også finnes i `useListingTitleHints` — vurder gjenbruk når den filen tas fatt på
- Verifiser ingen andre steder har samme fail-open-mønster som den opprinnelige Turnstile-bugen

## Praktisk oppstart i morgen

```bash
git pull origin staging
```

Fortsett med punkt 1 over (`mine-annonser.$id.rediger.tsx`), samme fremgangsmåte som `ny-annonse.tsx`: kartlegg delstater → trekk ut til hooks i `features/listing-creation/` → verifiser med typecheck/lint/test/build → manuell nettleser-test → commit per utrekk.
