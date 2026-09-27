# Slik kjører du Kaupet lokalt på din egen PC

Du trenger [Bun](https://bun.sh) installert.

```bash
git clone https://github.com/Kaupet-no/kaupet.git
cd kaupet
bun install
bun dev
```

Appen kjører deretter på `http://localhost:8080`.

## Miljøvariabler og lokal backend (Docker)

Backenden (database og auth) leveres av Supabase, mens bilder og filer lagres i Cloudflare R2. Du trenger derimot ikke tilgang til Kaupet sitt Supabase-miljø for å komme i gang. Det enkleste er å kjøre Supabase lokalt i Docker.

Krever [Docker](https://www.docker.com) og [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):

```bash
bunx supabase start   # starter Supabase-stacken lokalt (Postgres, Auth, Studio m.m.)
bun run env:local     # genererer .env med lokale Supabase-nøkler + tomme placeholders for resten
bun dev
```

`supabase start` drar opp en komplett, isolert Docker Compose-stack og kjører migrasjonene i [supabase/migrations](supabase/migrations) automatisk. Nøklene som settes i `.env` er Supabase sine offentlig kjente lokale dev-defaults. Funksjonalitet som er avhengig av tredjeparter (opplasting av bilder til R2, kjøretøyoppslag, AI-kategoriforslag, Vipps, Resend, push-varsler) vil ikke virke før du eventuelt fyller inn egne nøkler manuelt i `.env`.

Stopp stacken med `bunx supabase stop` når du er ferdig. Supabase Studio (lokalt admin-UI) er tilgjengelig på `http://localhost:54323`.

### Oppdater lokal dev-kopi fra staging

For å få staging-kategorier og annonser inn i den lokale databasen, kjør:

```bash
bunx supabase start
bun run env:local
bun run db:refresh-local -- --replace
```

Importen leser staging-hemmelighetene fra `.env.staging.local`, kopierer
kategorier, filtre, flows, kjøretøydata, annonser, popularitetstall og
annonsebilder, og legger alle annonser under en syntetisk lokal dev-bruker.
Kladder og utløpte staging-annonser normaliseres til aktive lokale annonser.
Eksisterende lokale katalogdata, annonser og `listing-images` erstattes.
Staging-brukere, meldinger, favoritter, adresser og andre private relasjoner
kopieres ikke.
Annonsetitler, beskrivelser og lokasjonsfelter kopieres uendret; bruk bare
lokal maskin med tilgangskontroll og slett kopien når den ikke trengs.

Kommandoen krever `--replace` med vilje, fordi den sletter lokale dev-data.

### Alternativ: kjør mot Kaupet sitt staging-Supabase

For å kjøre appen lokalt mot staging-prosjektet, dekrypter staging-hemmelighetene
og legg dem i den lokale `.env`-filen:

```bash
bun run env:staging
bun dev
```

Dette bruker delt staging-data. Ikke kjør destruktive eller produksjonslignende
administrative operasjoner lokalt. Bytt tilbake til isolert lokal Supabase med:

```bash
bunx supabase start
bun run env:local
```

### Alternativ: kjør mot et annet eksternt Supabase-prosjekt

Har du tilgang til et eget Supabase-prosjekt, kan du i stedet kopiere
`.env.example` til `.env` og fylle inn verdiene direkte:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```
