# Kaupet.no

[![Lisens: AGPL-3.0](https://img.shields.io/badge/lisens-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/Kaupet-no/Kaupet/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaupet-no/Kaupet/actions/workflows/ci.yml)

Kaupet.no er en åpen markedsplass for kjøp og salg av brukte ting. Ingen sporing, ingen lukket plattform. Koden er fri, og alle forbedringer kommer fellesskapet til gode.

## Slik kjører du prosjektet lokalt

Du trenger [Bun](https://bun.sh) installert.

```bash
git clone https://github.com/Kaupet-no/kaupet.git
cd kaupet
bun install
bun dev
```

Appen kjører deretter på `http://localhost:3000`.

### Variabler

Backenden (database, auth, filer) leveres av Supabase. Kopier `.env.example` til `.env` og fyll inn verdiene for ditt eget Supabase-prosjekt. Lokal kjøring mot egen Supabase-instans krever:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

## Staging-miljø

Endringer skal ikke testes direkte i produksjon. Push til `staging`-branchen for å deploye til en egen Cloudflare Worker (`kaupet-no-staging`) koblet til et eget Supabase-prosjekt:

1. Opprett et eget Supabase-prosjekt for staging og kjør migrasjonene i `supabase/migrations` mot det (`supabase link` + `supabase db push`).
2. Sett opp et GitHub Environment kalt `staging` i repo-innstillingene med egne `vars` (`VITE_SUPABASE_*`) og `secrets` (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) som peker på staging-prosjektet — se `.env.staging.example` for full liste over variabler.
3. Push til `staging`-branchen. CI bygger og kjører `bun run deploy -- --env staging`, som deployer til staging-workeren definert i `wrangler.jsonc` (`env.staging`).
4. Vipps-betalinger i staging skal alltid bruke `VIPPS_ENVIRONMENT=test` og `VIPPS_TEST_*`-nøklene.

Produksjon (`main`) er uberørt av dette — `deploy`-jobben der fortsetter å bruke GitHub Environment `production` som før.

## Teknologi

- [TanStack Start](https://tanstack.com/start) (React 19, SSR) + Vite 7
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) komponenter
- [Supabase](https://supabase.com) — database, auth, storage
- Hostet på Cloudflare Workers

## Bidra

Vi tar gjerne imot bidrag — store og små. Les [CONTRIBUTING.md](CONTRIBUTING.md) for hvordan du kommer i gang, og [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for hvordan vi snakker sammen.

Funnet en sårbarhet? Se [SECURITY.md](SECURITY.md) — ikke åpne en offentlig issue.

## Lisens

Kaupet.no er lisensiert under [GNU Affero General Public License v3.0](LICENSE). Se [NOTICE](NOTICE) for hva det betyr i praksis — særlig at modifiserte nettverkstjenester må dele kildekoden sin tilbake til fellesskapet.
