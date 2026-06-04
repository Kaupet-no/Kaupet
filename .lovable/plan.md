# Kartfilter for annonser

Legg til lokasjonsbasert filtrering på `/annonser` med både stedssøk + radius og interaktiv pin på kart, vist som split-view (liste venstre, kart høyre).

## Hva som bygges

**Filter-UI (over listen, ved siden av eksisterende søk):**
- Tekstfelt for stedssøk (Places Autocomplete, Norge)
- Radius-slider (1–100 km, default 10 km)
- Knapp «Bruk min posisjon» (browser geolocation)
- «Nullstill lokasjon»

**Kart (høyre side, sticky):**
- Google Maps sentrert på valgt punkt
- Sirkel som viser radius
- Draggable pin – flytter man pinnen, oppdateres senter (og søk)
- Markører for alle treff med lat/lng; klikk åpner mini-popup med tittel + pris + lenke til annonsen
- Hover på listekort highlighter tilhørende markør

**Layout:**
- Desktop: 2-kolonne split (liste 60% / kart 40%, kart `sticky top-20`)
- Mobil: kart skjult bak knapp «Vis kart» som åpner fullskjerm-overlay

**Søk-parametere (URL):**
Utvid `searchSchema` i `src/routes/annonser.tsx` med `lat`, `lng`, `radius` (alle optional). Bevares på tvers av nav via standard search-merging.

**Filtrering (DB):**
Postgres-funksjon `listings_within_radius(center_lat, center_lng, radius_km)` som bruker Haversine-formel direkte i SQL (ingen PostGIS nødvendig). Returnerer listing-id-er innenfor radius. Kalles via `supabase.rpc()` når lat/lng er satt, og resultatet kombineres med øvrige filtre.

Alternativ enklere variant: legg `earthdistance`-ext + bounding-box-filter i query (`lat BETWEEN ... AND ...`) og finjuster i klient. Velger RPC-varianten for korrekthet.

## Tekniske detaljer

**Connector:** Bruker den allerede tilgjengelige Google Maps Platform-connectoren:
- Browser-nøkkel (`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`) for Maps JS API + Places Autocomplete (New).
- Gateway via TanStack server function for evt. geocoding fallback.
- Bruker `google.maps.Marker` (ikke AdvancedMarker), ingen `mapId`.

**Nye filer:**
- `src/components/listings-map.tsx` – kart, sirkel, markører, pin-drag
- `src/components/location-filter.tsx` – autocomplete-input + radius-slider + geolocation-knapp
- `src/hooks/use-google-maps.ts` – async loader for Maps JS API (callback-pattern, singleton)
- DB-migration: SQL-funksjon `public.listings_within_radius(double precision, double precision, double precision)` (SECURITY DEFINER, search_path = public, returnerer setof uuid)

**Endrede filer:**
- `src/routes/annonser.tsx` – utvid schema, split-layout, integrer kart + filter, query-logikk
- `package.json` – ingen nye deps (Maps lastes via `<script>`)

**Ingen endringer** i auth, listing-skjema, favoritter eller andre sider.

## Mobil

På < `md` skjules kartet. En flytende «Vis kart»-knapp åpner kartet som fullskjerm-sheet med samme markører og kontroller.

## Rekkefølge

1. Migration: `listings_within_radius` SQL-funksjon
2. Maps-loader hook + ListingsMap-komponent
3. LocationFilter-komponent med Places Autocomplete
4. Integrer i `annonser.tsx` (schema, layout, query)
5. Mobil-sheet
