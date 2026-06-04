## Mål

Gjøre repoet `github.com/Kaupet-no/kaupet` klart for eksterne bidragsytere, og sørge for at koden på GitHub er den som faktisk driver siden.

## 1. Community-dokumentasjon (rot i repoet)

- **README.md** — kort intro (norsk), skjermbilde, "Slik kjører du lokalt" (`bun install`, `bun dev`), teknologi-stack (TanStack Start, Lovable Cloud/Supabase, Tailwind), lenker til CONTRIBUTING/LICENSE, status-badges (CI, lisens).
- **CONTRIBUTING.md** — hvordan foreslå endringer, fork → branch → PR-flyt, kodekonvensjoner (Prettier, ESLint), commit-stil, hvordan kjøre tester, hvordan rapportere bugs.
- **CODE_OF_CONDUCT.md** — Contributor Covenant v2.1 (norsk), kontakt: `andreas@happypixel.no`.
- **SECURITY.md** — rapporter sårbarheter privat til `andreas@happypixel.no`, ikke i offentlige issues, responstid-forventninger.
- **.github/ISSUE_TEMPLATE/bug_report.md** og **feature_request.md**.
- **.github/PULL_REQUEST_TEMPLATE.md** — sjekkliste (lint, typecheck, beskrivelse, screenshots).
- **.github/FUNDING.yml** — (valgfritt, tom som plassholder).

LICENSE og NOTICE finnes allerede (AGPL-3.0) — beholdes som de er.

## 2. GitHub Actions (CI)

`.github/workflows/ci.yml` som kjører på alle PR-er mot `main`:
- `bun install`
- `bun run lint` (ESLint)
- `bunx tsc --noEmit` (typecheck)
- `bun run build` (Vite build)

Dette gir en grønn/rød status på hver PR slik at vedlikeholdere raskt ser om bidraget er trygt å merge.

## 3. Lenker i appen

- I `src/routes/index.tsx` linje 230: bytt `https://github.com` → `https://github.com/Kaupet-no/kaupet`.
- Søk gjennom resten av koden etter andre placeholders og oppdater.
- Vurder en liten "Bidra på GitHub"-lenke i footer/site-header.

## 4. Sync GitHub ↔ Lovable (forklaring til deg)

Lovable's GitHub-integrasjon er allerede toveis: endringer du gjør i Lovable pushes til `main` på GitHub, og merge-de PR-er fra bidragsytere kommer automatisk tilbake til Lovable. Det betyr at koden på GitHub **er** den som driver siden — så snart en PR merges til `main`, oppdateres preview og (ved publisering) produksjon.

Anbefalt GitHub-oppsett (gjøres i GitHub-UI, ikke noe jeg kan kode):
- **Branch protection på `main`**: krev minst 1 review, krev at CI er grønn, ikke tillat direkte push.
- **Default branch**: `main`.
- **Issues + Discussions**: skru på Discussions for spørsmål/idéer.
- **Topics**: `marketplace`, `norway`, `open-source`, `tanstack-start`, `agpl-3-0`.
- Skru på "Require contributors to sign off on web-based commits" hvis dere vil ha DCO.

## 5. Veien videre etter denne planen

- Når flere bidragsytere kommer: vurder GitHub Branch Switching i Lovable Labs så du kan jobbe i feature-branches også fra Lovable.
- Sett opp en `CHANGELOG.md` og release-tags når dere får første eksterne PR.
- Sett opp Dependabot for sikkerhetsoppdateringer (`.github/dependabot.yml`).

## Tekniske detaljer

Filer som opprettes:
```
README.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
.github/ISSUE_TEMPLATE/bug_report.md
.github/ISSUE_TEMPLATE/feature_request.md
.github/ISSUE_TEMPLATE/config.yml
.github/PULL_REQUEST_TEMPLATE.md
.github/workflows/ci.yml
.github/dependabot.yml
```

Filer som endres:
- `src/routes/index.tsx` (GitHub-lenke linje ~230)

Alt på norsk (bokmål), konsistent med resten av siden. CI bruker `oven-sh/setup-bun@v2`.
