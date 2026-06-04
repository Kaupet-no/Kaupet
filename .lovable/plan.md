# Brukermeny for innloggede brukere

Erstatter dagens "Ny annonse"-knapp + "Logg ut"-knapp i headeren med en samlet avatar-nedtrekksmeny (à la AirBnB/Finn). Legger til to nye sider: **Mine annonser** og **Profil**.

## Endringer i UI

### 1. Header (`src/components/site-header.tsx`)
For innloggede brukere vises:
- Favoritter (hjerte-ikon) — beholdes
- Meldinger-ikon — beholdes (disabled inntil videre)
- **Ny annonse**-knapp — beholdes som primær CTA
- **Avatar-knapp** med nedtrekksmeny (erstatter "Logg ut"-knappen)

Avataren henter `avatar_url` + `display_name` fra `profiles`-tabellen via en liten `useQuery`. Faller tilbake til initialer hvis ingen avatar.

Nedtrekksmeny (shadcn `DropdownMenu`):
- **Min profil** → `/profil`
- **Mine annonser** → `/mine-annonser`
- **Ny annonse** → `/ny-annonse`
- **Favoritter** → `/favoritter`
- ── separator ──
- **Kontoinnstillinger** → `/profil/innstillinger`
- **Logg ut**

### 2. Ny side: Mine annonser (`src/routes/_authenticated/mine-annonser.tsx`)
Lister alle annonser der `seller_id = auth.uid()`, gruppert/filtrert på status (aktiv, utkast, solgt/arkivert). Hver rad viser bilde, tittel, pris, status, visninger og handlinger:
- **Rediger** → `/mine-annonser/$id/rediger` (gjenbruker skjemaet fra `ny-annonse.tsx`)
- **Marker som solgt** / **Reaktiver** (oppdaterer `status`)
- **Slett** (med bekreftelses-dialog)

### 3. Ny side: Profil (`src/routes/_authenticated/profil.tsx`)
To faner / seksjoner:
- **Profilinfo**: rediger `display_name`, `bio`, `location`, `avatar_url` (gjenbruker `ImageUploader` for avatar).
- **Konto** (kan være egen rute `/profil/innstillinger` eller seksjon på samme side):
  - Endre e-post via `supabase.auth.updateUser({ email })` — Supabase sender bekreftelses-e-post.
  - Endre passord via `supabase.auth.updateUser({ password })` med bekreftelse.
  - Logg ut-knapp.

### 4. Ny side: Rediger annonse (`src/routes/_authenticated/mine-annonser.$id.rediger.tsx`)
Refaktorerer felles skjema fra `ny-annonse.tsx` ut i en delt komponent `<ListingForm mode="create" | "edit" />` slik at samme skjema brukes til både opprettelse og redigering. Geokoding kjøres på nytt hvis postnummer/by endres.

## Tekniske detaljer

- Bruker eksisterende `DropdownMenu`, `Avatar`, `Dialog`, `Tabs` fra shadcn (legges til om de mangler).
- Alle nye ruter ligger under `_authenticated/` så de arver auth-gaten.
- Datahenting via `useQuery` mot `supabase` (browser-client, RLS sørger for at brukeren kun ser egne annonser/profil).
- Mutasjoner via `useMutation` + `queryClient.invalidateQueries`.
- Ingen DB-endringer nødvendig — `profiles`, `listings`, og `auth.users` dekker alt.
- Følger eksisterende designtokens i `src/styles.css` (ingen hardkodede farger).

## Filer som opprettes / endres

**Nye:**
- `src/components/user-menu.tsx` (avatar + dropdown)
- `src/components/listing-form.tsx` (delt skjema)
- `src/routes/_authenticated/mine-annonser.tsx`
- `src/routes/_authenticated/mine-annonser.$id.rediger.tsx`
- `src/routes/_authenticated/profil.tsx`

**Endres:**
- `src/components/site-header.tsx` (bytt ut Logg ut-knapp med `<UserMenu />`)
- `src/routes/_authenticated/ny-annonse.tsx` (bruker `<ListingForm />`)

Si fra om du vil ha kontoinnstillinger som egen side (`/profil/innstillinger`) eller som fane på profilsiden — jeg foreslår fane for færre klikk.
