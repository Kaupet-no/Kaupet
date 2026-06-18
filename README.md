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

Endringer skal ikke testes direkte i produksjon. Push til `staging`-branchen deployer automatisk til **https://staging.kaupet.no** — en egen Cloudflare Worker med eget Supabase-prosjekt, helt atskilt fra produksjon.

Domenet ligger bak Cloudflare Access, så alle besøkende må logge inn med en godkjent e-post før de når appen. Detaljert oppsett (Supabase-migrasjoner, secrets, Access-policy) er dokumentert i README på `staging`-branchen.

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
