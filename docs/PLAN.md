# Samlet tiltaksplan

Konsolidert fra `docs/UI-UX-AUDIT-2026-08-06.md` (nå slettet — den historiske
fase-loggen for allerede gjennomført arbeid ligger i git-historikken, se
commits `caee689`, `2905dc5`, `ebc84dc`, `aa9e9d6` på `staging`). Dette er den
eneste plan-/tiltaksfilen som fantes i repoet utover README-er og
standarddokumenter (CLA, CoC, CONTRIBUTING).

Status verifisert mot koden 2026-08-07 — alle punkter under er fortsatt
uløst.

## Prioritert handlingsplan

Rangert etter forventet verdi/innsats, høyest øverst.

1. **Vehicle-confirm-steget: forklaring på disabled knapp + øvre grense på
   avgiftsoverstyring.** Lite, isolert, økonomisk/juridisk konsekvens
   (SVV-data, omregistreringsavgift) — høyest verdi for innsats.
2. **Fullfør tilgjengelighets-passet: tastaturstøtte i 360-vieweren og
   fokushåndtering ved native ruteendring.** Konkret, avgrenset,
   a11y-kritisk.
3. **Eksplisitt batching av `signListingImageUrls` i Mine annonser-listen.**
   Liten endring i én fil, ren ytelsesgevinst.
4. **Web/native-duplisering i søk/filter/landingsside.** Størst strukturell
   gjeld, men også størst omfang — bør gjøres som egen, avgrenset omgang,
   ikke bakes inn i andre fikser.
5. **IndexedDB for bilde-draft-gjenoppretting.** Bevisst utsatt — gjør kun
   hvis brukertesting/support faktisk viser at det er et problem.
6. **Rydd `set-state-in-effect`-lint-advarsler** i
   `advanced-search-sheet.tsx`/`native-advanced-search.tsx`. Kosmetisk,
   lavest prioritet.

## Implementeringsplan (for punkt 1–3)

### 1. Vehicle-confirm

- `src/features/listing-creation/field-groups/vehicle-confirm/index.tsx:879`
  — knappen er `disabled` av flere uavhengige betingelser
  (`!selectedSlug`, `matching`, `confirmValue`, manglende
  `eu_control_exempt`/`drive_type`). Legg til synlig hjelpetekst som sier
  konkret hva som mangler, framfor en stille disabled-knapp.
- `src/features/listing-creation/field-groups/price/omregistreringsavgift-box.tsx:50`
  — feltet har `min={0}` men ingen `max`. Sett en fornuftig øvre grense
  (samme mønster som andre numeriske felt i wizarden bruker).

### 2. Tilgjengelighet

- `src/components/listing-detail/vehicle/vehicle-360-viewer.tsx:45-79` —
  kun pointer-events. Legg til `onKeyDown` (piltaster for å rotere) og
  `tabIndex`/`role` slik at komponenten er fokuserbar, samme mønster som
  `useFocusTrap`-arbeidet i forrige omgang.
- `src/components/native-page-header.tsx` — ingen fokushåndtering ved
  ruteendring. Legg til en `useEffect` som flytter fokus til sidetittel/
  hovedinnhold ved navigasjon, tilsvarende web sin skip-to-content-lenke.

### 3. Batching på listenivå

- `src/features/my-listings/listing-row.tsx:111` — hver rad kaller
  `signListingImageUrls([row.cover_path])` individuelt. Flytt kallet opp til
  listekomponenten (samle alle `cover_path` fra synlige rader i ett kall før
  rendering) — mikrotask-batchingen fra fase 4 fanger fortsatt opp kall gjort
  i samme tick, men eksplisitt batching på listenivå reduserer antall
  ticks/renders for lange lister.

Punkt 4–6 er bevisst ikke brutt ned i delsteg her — de er enten for store til
å planlegges før en egen kartleggingsrunde (4), eller betinget av fremtidig
signal (5), eller lavt nok prioritert til at det er unødvendig arbeid å
planlegge nå (6).
