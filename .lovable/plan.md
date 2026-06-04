# Airbnb-stil kart og søk på /annonser

Implementerer Retning B: listen er primær, kartet er en glatt sidekikker, og hele søket samles i én pille-formet bar.

## 1. Samlet søkebar (pille-stil)

Erstatter dagens to rader (søk+kategori+sortering, så lokasjon under) med én container `rounded-full border bg-background shadow-sm` med segmenter delt av tynne `border-l`:

```
[ 🔍 Hva  ] | [ 📍 Hvor ] | [ ⊙ Radius ] | [ Kategori ] | [ Sortering ] [Søk-knapp]
```

- **Hva**: inline input, samme oppførsel som i dag.
- **Hvor**: Popover som åpner Nominatim-autocomplete + "Min posisjon" + "Tegn på kart"-snarvei.
- **Radius**: Popover med slider 1–100 km. Disabled (grået ut + tooltip "Velg sted først") til lat/lng finnes. Viser "10 km" som etikett.
- **Kategori / Sortering**: Popover med radio-liste i stedet for native `<select>` for konsistent stil.
- På mobil kollapser baren til ett trykk → bottom-sheet med samme felter stablet vertikalt (Airbnb mobile mønster).

Eksisterende `LocationFilter`-komponent splittes i to mindre stykker (`LocationPicker`, `RadiusPicker`) som kan brukes i den nye baren.

## 2. Kart-stil og pins

`listings-map.tsx`:
- Bytt tile-layer til **CartoDB Positron** (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`) med riktig attribusjon — lys, minimalistisk, matcher resten av siden.
- **Pris-pins** via `L.divIcon`: liten rounded-full kapsel med pris, hvit bakgrunn, primary border, myk skygge. "Gis bort" får accent-farge. Bruker design tokens (`hsl(var(--primary))`, `--shadow-elegant`).
- Hover på pin → kapsel vokser litt og hever skygge; aktiv (klikket) pin får solid primary-fyll.
- Popup erstattes med custom card-popup: bilde 16:9, tittel, pris, "Se annonse"-knapp i samme stil som `ListingCard`.
- Sentrum-markøren beholdes som i dag, radius-sirkel får lavere opacity.

## 3. Liste ↔ kart synkronisering

- Hover på `ListingCard` → tilhørende pin highlightes (via et delt `hoveredId` state lokalt i `BrowsePage`).
- Hover/klikk på pin → tilhørende kort scrollet inn i view og highlightet.
- Implementeres med to enkle props: `hoveredId`, `onHoverChange` på `ListingsMap` og `ListingCard`.

## 4. "Utvid kart" + mobil FAB

- Desktop: liten "⤢ Utvid kart"-knapp øverst til høyre i kartcontaineren → åpner `Dialog` med fullbredde-kart (90vw × 85vh) som inkluderer en "Søk i dette området"-knapp som flyter øverst.
- Mobil: dagens "Vis kart"-knapp blir en **flytende FAB** nederst til høyre (`fixed bottom-4 right-4 rounded-full shadow-lg`) med kart-ikon + "Kart"-tekst. Åpner samme `Sheet` som i dag.

## 5. "Søk i dette området"-knapp

Felles for utvidet kart-dialog og desktop-kart:
- Når brukeren panner kartet > ~500 m fra forrige senter, vises en flytende knapp øverst sentrert: "Søk i dette området".
- Klikk = oppdaterer `lat`/`lng` til kartets senter, beholder eksisterende radius.
- Implementeres ved å lytte på Leaflet `moveend` og sammenligne med forrige senter (Haversine).

## 6. Visuell polish

- Søkebar: `rounded-full`, `shadow-sm` hvilende, `shadow-md` på hover/fokus, divider mellom segmenter er `border-l border-border/60`.
- Kart-container: `rounded-2xl` (i dag `rounded-xl`), tynnere border, samme `--shadow-elegant`.
- Tomtilstand: behold dagens design men legg til en "Nullstill filtre"-knapp.

## Filer som endres

- `src/routes/annonser.tsx` — ny header med pille-bar, hover-state, dialog + FAB.
- `src/components/listings-map.tsx` — Positron tiles, pris-pins, custom popup, hoveredId, moveend-knapp.
- `src/components/location-filter.tsx` — refaktoreres til `LocationPicker` + `RadiusPicker` (popovers).
- Ny: `src/components/search-bar.tsx` — pille-containeren som komponerer alle delene.

## Tekniske notater

- Ingen nye npm-pakker nødvendig. `leaflet.markercluster` skippes i denne runden — pris-pins er ofte unike nok med dagens 60-rad-limit.
- Beholder lazy-loading av kartet og `mounted`-guarden.
- Alle farger via CSS-variabler (`--primary`, `--accent`, `--surface`) — ingen hardkodede hex.

## Spørsmål før jeg går videre

1. CartoDB Positron som ny tile-stil (lys og minimal) er greit? Alternativet er Stadia Alidade Smooth som er litt varmere.
2. Skal `Hva`-feltet søke automatisk mens du skriver (debounced), eller beholde "trykk Enter / Søk-knapp" som nå?
