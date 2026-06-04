## Favoritter-funksjonalitet

### Mål
Brukeren skal kunne markere annonser som favoritter og se alle favoritter på en egen side.

### Bakgrunn
Databasetabellen `favorites` (user_id, listing_id, created_at) eksisterer allerede med RLS-policy som lar autentiserte brukere administrere sine egne rader. Det som mangler er frontend-funksjonalitet.

### Endringer

#### 1. Ny side: `/favoritter`
- Viser en grid med alle favoritter for innlogget bruker, likt layout som `/annonser`
- Bruker `ListingCard` for hver favoritt-annonse
- Tom tilstand: "Du har ikke lagret noen favoritter ennå"
- Krever innlogging; uautentiserte brukere omdirigeres til `/auth`

#### 2. Favoritt-knapp på annonsekort (`ListingCard`)
- Legg til en hjerte-knapp (outline/fylt) øverst i høyre hjørne på bildet i `ListingCard`
- Knappen stopper klikk-bubbling så man ikke navigerer til annonsen når man klikker hjertet
- Uautentiserte brukere som klikker hjertet blir sendt til `/auth`
- Optimering: bruk en lokal tilstand + `useMutation` for umiddelbar visuell tilbakemelding
- Hjerte-fargen følger `--accent`-token (terrakotta)

#### 3. Favoritt-knapp på annonsedetaljsiden (`annonse.$id.tsx`)
- Legg til samme hjerte-knapp ved siden av "Send melding"-knappen i sidebar
- Samme oppførsel som på kortet: toggle favoritt, omdirigering for uautentiserte

#### 4. Header-endring (`SiteHeader`)
- Favoritter-knappen (Heart-ikonet) gjøres klikkbar og lenker til `/favoritter`
- Viser antall favoritter som en liten badge når bruker er innlogget (valgfritt, dersom raskt å implementere)
- Kun synlig for innlogget bruker

#### 5. Hjelpere
- Ny komponent: `FavoriteButton` i `src/components/favorite-button.tsx` med delt logikk (query for å sjekke status, mutation for toggle)
- Bruker `useAuth` for å sjekke innloggingsstatus
- Bruker `useQuery` + `useMutation` fra TanStack Query med passende cache-invalidering

### Tekniske detaljer
- Query key for favoritt-status: `["favorite", listingId]`
- Query key for brukerens favoritter: `["user-favorites"]`
- `onSuccess` i toggle-mutation invaliderer begge keys
- Ingen database-migrasjoner nødvendig (tabell og RLS finnes)
