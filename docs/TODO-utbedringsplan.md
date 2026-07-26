# Utbedringsplan — status

Se full historikk i samtaleloggen / `iterative-strolling-minsky.md`-planfilen for bakgrunn og resonnement bak hvert steg.

## Alle fire faser er ferdig

**Fase 1 — sikkerhet/konsistens** (commit `922ed59`)

- Turnstile fail-closed i produksjon
- Delt rate-limit-hjelper i `listings.functions.ts`
- Fjernet ubrukt `package-lock.json`
- CI: `bun audit` blokkerer nye høy/kritisk-sårbarheter
- CodeQL-workflow lagt til

**Bifunn — global React-advarsel** (commit `37e716f`)

- `AuthProvider` kalte state-settere synkront fra `onAuthStateChange` idet man abonnerte, som trigget "Can't perform a React state update on a component that hasn't mounted yet" på _hver_ side i appen. Fikset med `queueMicrotask`.

**Fase 2 — alle fire gud-komponenter oppdelt:**

- `ny-annonse.tsx`: 1770 → 1226 linjer
- `admin/kategorier.tsx`: 2003 → 496 linjer (splittet i 8 filer)
- `mine-annonser.$id.rediger.tsx`: 1145 → 835 linjer
- `annonser.tsx`: 943 → 822 linjer
- `index.tsx`: 901 → 765 linjer

**Fase 3 — testdekning** (commits `52bdf16`, `8edf1ab`)

- React Testing Library + jsdom satt opp
- Alle hooks fra fase 2 har egen testdekning

**Fase 4 — opprydding** (commits `105c1e0`, `3b1ce18`, `8d62639`, `2b41910`)

- `noUnusedLocals`/`noUnusedParameters` slått på i `tsconfig.json` — 22 dødkode-tilfeller fjernet, hvert undersøkt for å utelukke reelle bugs
- Sikkerhetsgjennomgang: ingen andre fail-open-mønstre som Turnstile-buggen funnet (alle tre `onAuthStateChange`-abonnement og server-side `process.env`-guarder gjennomgått)
- `useListingTitleHints` og `useEditListingHints` slått sammen til én delt kjerne (`useTitleBasedListingHints`) — fjernet duplisert lignende-annonser/WTB/nøkkelord-logikk
- Ny E2E-spec for uinnlogget søk (`e2e/browse-search.spec.ts`) — **merk: ikke kjørt gjennom Playwright-testløperen**, siden denne sandkassen mangler `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. Bekreftet kun at den parses korrekt (`playwright test --list`). Kjør den én gang mot et konfigurert miljø før den stoles på i CI.

Full test-suite: **168 enhetstester**, alle grønne. Typecheck, lint og full bygg verifisert grønt gjennom hele arbeidet.

## Eneste gjenstående forbehold

`e2e/browse-search.spec.ts` bør kjøres én gang mot en ekte Supabase-tilkobling (lokalt med `.env` konfigurert, eller i CI) for å bekrefte at selektorene faktisk stemmer — den er skrevet ut fra manuelt observerte selektorer, ikke kjørt end-to-end.

## Ved oppstart av nytt arbeid

```bash
git pull origin staging
```
