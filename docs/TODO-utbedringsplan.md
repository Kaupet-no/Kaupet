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

- React Testing Library + jsdom satt opp (devDependencies, per-fil `@vitest-environment jsdom`-pragma)
- Alle ni hooks fra fase 2 har egen testdekning
- Full suite: **165 tester**, alle grønne

**Fase 4 — delvis ferdig** (commit `105c1e0`)

- Slått på `noUnusedLocals`/`noUnusedParameters` i `tsconfig.json` — fikset 22 avdekkede dødkode-tilfeller (ubrukte imports/variabler i 14 filer). Undersøkte hvert enkelt tilfelle for å utelukke reelle bugs (f.eks. `resultBtn`-propen i `native-filter-chips.tsx` viste seg å være genuint ubrukt, ikke en manglende "lukk ark"-knapp — bekreftet via kodelesning av `onApply→close()`-kjeden).
- Verifisert: ingen andre fail-open-sikkerhetsmønstre som Turnstile-buggen. Gjennomgått alle tre `onAuthStateChange`-abonnement i kodebasen (`auth.tsx` — allerede fikset, `__root.tsx` og `tilbakestill-passord.tsx` — begge trygge by design). Gjennomgått `process.env.*`-guarder i server-filene — resten er best-effort-sideeffekter (e-post/push), ikke sikkerhetsbypasser.

Alt verifisert med typecheck, lint, full test-suite, full bygg, og manuell nettleser-test.

## Gjenstår (lavere prioritet)

- **Vurdere** å slå sammen `useListingTitleHints` og `useEditListingHints` til én parameterisert hook (med/uten kategoriforslag, med/uten selv-ekskludering) — nesten identisk logikk i to filer. Ikke gjort ennå: risiko/gevinst-vurdering tilsier at dette er lavt prioritert siden begge hooks allerede har god testdekning og fungerer korrekt hver for seg; en sammenslåing er en ren DRY-forbedring, ikke en bug-fiks.
- Flere Playwright E2E-specs utover `publish-listing.spec.ts` — krever en kjørende Supabase-stack (`supabase start`) eller staging-miljø, som ikke er tilgjengelig i denne økten.

## Praktisk oppstart neste gang

```bash
git pull origin staging
```

Fase 1–3 er ferdig, Fase 4 er i hovedsak ferdig. De to gjenstående punktene er valgfrie forbedringer uten avhengigheter til hverandre — ta dem når det passer, eller hopp over dem helt.
