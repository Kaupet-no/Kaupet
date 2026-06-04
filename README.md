# Kaupet.no

[![Lisens: AGPL-3.0](https://img.shields.io/badge/lisens-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/Kaupet-no/kaupet/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaupet-no/kaupet/actions/workflows/ci.yml)

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

Backenden (database, auth, filer) leveres av Supabase. Variabler i `.env` genereres automatisk i Lovable. Lokal kjøring mot egen Supabase-instans krever:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

## Teknologi

- [TanStack Start](https://tanstack.com/start) (React 19, SSR) + Vite 7
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) komponenter
- [Supabase](https://supabase.com) — database, auth, storage
- Hostet på Cloudflare Workers via [Lovable](https://lovable.dev)

## Bidra

Vi tar gjerne imot bidrag — store og små. Les [CONTRIBUTING.md](CONTRIBUTING.md) for hvordan du kommer i gang, og [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for hvordan vi snakker sammen.

Funnet en sårbarhet? Se [SECURITY.md](SECURITY.md) — ikke åpne en offentlig issue.

## Lisens

Kaupet.no er lisensiert under [GNU Affero General Public License v3.0](LICENSE). Se [NOTICE](NOTICE) for hva det betyr i praksis — særlig at modifiserte nettverkstjenester må dele kildekoden sin tilbake til fellesskapet.
