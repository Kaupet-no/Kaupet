# UI/UX-forbedringer — gjennomføring (2026-08-06)

## Bakgrunn og formål

Denne omgangen startet som en full UI/UX-analyse av kodebasen, med
prioritering av kode sluttbrukeren faktisk ser og interagerer med
(landingsside/søk, annonsering-wizarden, annonsevisning/-redigering,
meldinger/konto/navigasjon). Analysen ble gjort ved å lese gjennom disse
fire brukerflatene i dybden og vurdere dem mot vanlige UX-lenser
(tydelighet, feilforebygging/-gjenoppretting, konsistens, tilgjengelighet,
kognitiv belastning).

Formålet med selve implementeringen var ikke å bygge nytt, men å tette de
konkrete hullene analysen fant — først og fremst steder hvor en bruker kan
miste data eller utføre en irreversibel handling ved et uhell, deretter
konsistens- og tilgjengelighetsgjeld. Alt arbeid er gjort som minimale,
lazy fixes på eksisterende mønstre i kodebasen (gjenbruk av komponenter som
allerede fantes, ikke nye abstraksjoner) — ikke en refactor.

Arbeidet ble gjennomført i fire faser, hver committet og pushet til
`staging` for seg selv, med typecheck (`bunx tsc --noEmit`), fullt testsuite
(`bun run test`) og lint grønt før hver commit.

## Fase 1 — Datatap- og sikkerhetsstopp (commit `caee689`)

Den mest alvorlige klyngen: steder hvor en bruker kunne miste arbeid eller
utføre en irreversibel handling uten å mene det.

1. **Auth-guard lot beskyttede sider rendres uten innlogget bruker.**
   `src/routes/_authenticated/route.tsx` fanget opp `AuthSessionMissingError`
   (den vanligste "ikke innlogget"-feilen) og returnerte `{}` i stedet for å
   redirecte til `/auth` — dette var trolig en glipp fra da linjen ble
   skrevet, ikke en bevisst unntakshåndtering. Rettet til å redirecte uansett
   feiltype.
2. **"Merk som solgt" var inkonsistent mellom to sider.** Fra
   annonsevisningen åpnet handlingen en dialog der man velger kjøper blant
   aktive samtaler (`MarkSoldDialog`). Fra Mine annonser-listen fyrte samme
   handling _umiddelbart_ uten bekreftelse. Mine annonser bruker nå samme
   dialog.
3. **Kategoribytte under redigering slettet attributter uten bekreftelse.**
   `category-change-dialog.tsx` skrev `attributes: {}` direkte ved valg av ny
   kategori — dialogens egen advarselstekst sa riktignok at dette kunne skje,
   men handlingen krevde ingen ekstra bekreftelse. Lagt til et eksplisitt
   bekreftelsessteg. (Kommentaren i koden hevdet feilaktig at attributter ble
   "kept as-is" — rettet til å beskrive hva koden faktisk gjør.)
4. **Utkast-autosave i annonsering hoppet over attributter.**
   `use-draft-autosave.ts` persisterte tekstfelter (tittel, beskrivelse,
   pris osv.) til `localStorage`, men aldri `attributes` — nettopp
   spesifikasjonene/utstyret som tar lengst tid å fylle ut for kjøretøy og
   båt. Utvidet til å persistere og gjenopprette attributter også. Bilder
   (rå `File`-objekter) er bevisst utelatt — se «Kjente begrensninger»
   under.
5. **Tall ble auto-strippet fra søkefeltet mens man skrev.**
   Numerisk filter-gjenkjenning (`use-text-to-filter-pipeline.ts`) kjørte
   mot live søketekst uten debounce, ulikt synonym-matcheren rett ved siden
   av — å skrive «3000» kunne bli matchet og fjernet fra boksen etter «300».
   Nå matcher begge mot samme debouncede tekst.

## Fase 2 — Konsistens i redigering og konto (commit `2905dc5`)

1. **Select-felter i inline-redigering krevde et eget "Lagre"-klikk**
   (tilstand, levering på annonsevisningen), ulikt alle andre felter som
   autolagrer ved blur/Enter — en bruker som fulgte samme vane som resten av
   siden (endre og klikke bort) mistet endringen stille. `EditableField`s
   `onCommit` tar nå valgfritt en verdi direkte, slik at Select-feltene kan
   lagre synkront ved valg uten å vente på en re-render-runde.
2. **Båtannonser hadde ingen inline-redigering i det hele tatt.**
   `BoatInfoGrid`/`BoatExtraInfo` var ikke koblet til `EditableRegion`, i
   motsetning til de tilsvarende kjøretøy-seksjonene. Begge er nå koblet til
   samme `GenericAttributesPanel` som allerede fantes for generiske
   kategorier (samme mekanisme kjøretøy-uavhengige annonser alt brukte) — og
   den gamle blanke "Egenskaper"-fallback-blokken er nå ekskludert for båt
   for å unngå to redigeringsinnganger til samme data.
3. **Passordpolicy var inkonsistent.** Minimum 6 tegn ved registrering, 8
   tegn i Kontoinnstillinger — kunne avvise et passord brukeren nettopp
   fikk lov til å sette. Registrering krever nå 8 tegn som Kontoinnstillinger;
   innloggingsskjemaet validerer nå kun at feltet ikke er tomt (ikke lengde),
   slik at en eksisterende konto med et eldre, kortere passord aldri avvises
   av klientvalidering ved innlogging.
4. **Logout fra Kontoinnstillinger tømte ikke query-cache.** I motsetning
   til logout fra Meg-siden. Rettet til samme mønster (tøm cache, naviger
   til forsiden).

## Fase 3 — Tilgjengelighet (commit `ebc84dc`)

1. **Meldingslisten hadde ingen `aria-live`.** Nye meldinger ble aldri
   annonsert for skjermleserbrukere. Lagt til `role="log"
aria-live="polite" aria-relevant="additions"` på scroll-containeren.
2. **Ingen fokusfelle i fire fullskjerm-overlays** (bilde-lightbox,
   kart-overlay, nativt søk, nativt avansert søk) — tastaturbrukere kunne
   Tab-e forbi "modalen" og inn i siden bak mens den visuelt fortsatt dekket
   skjermen. Bygget én delt `useFocusTrap`-hook (`src/hooks/use-focus-trap.ts`,
   med egen test) og koblet den inn i alle fire, samt lagt til
   `role="dialog"`/`aria-modal="true"` på de to native-overlayene som
   manglet det.
3. **Roterende søkeeksempler var helt utilgjengelige for skjermlesere** på
   den native landingssiden — animasjonen var `aria-hidden`, og selve
   inputen hadde bare en statisk generisk `aria-label`. Lagt til en statisk
   `aria-describedby`-tekst med alle eksemplene, lest én gang ved fokus i
   stedet for å spamme en `aria-live`-region hvert ~2,7 sekund.
4. **Bildekarusellen brukte identisk alt-tekst for alle bilder**
   (`alt={title}`) — en skjermleserbruker som bladde gjennom 8 bilder av en
   bil hørte «Toyota Corolla 2019» åtte ganger uten å kunne skille dem.
   Rettet til samme mønster som lightboxen allerede brukte (bildenummer i
   alt-teksten).

## Fase 4 — Strukturell opprydning (commit `aa9e9d6`)

1. **Signerte bilde-URL-er ble hentet én og én.** Hvert `ListingCard` på en
   resultatside kalte `signListingImageUrls` for sitt eget bilde, i stedet
   for én batched forespørsel for hele siden. Løst i selve
   `signListingImageUrls` (ikke i hver kaller) med en microtask-basert
   batching: alle kall gjort innenfor samme tick slås sammen til én
   `createSignedUrls`-forespørsel. Dette er en rot-årsak-fiks som også
   forbedrer alle de andre stedene som allerede kalte funksjonen én
   annonse om gangen (Mine annonser-listen, meldinger, kartvisning,
   fremhev-dialogen) — uten å måtte endre noen av dem.
2. **To uavhengige mekanismer for roterende søkeeksempler.** `/annonser`
   sin søkebar hadde en hardkodet liste, mens landingssiden hentet
   admin-redigerbare eksempler fra `site_settings.default_search_examples`
   — en admin-endring i CMS nådde aldri `/annonser`. Søkebaren blander nå
   inn de samme CMS-styrte eksemplene (med samme "Prøv: "-formatering), i
   tillegg til de faste syntaks-eksemplene (operatorer som
   "unntatt"/"under") som er en annen type innhold og bevisst beholdt
   separat.
3. **Hardkodet farge i avansert søk-varselet.** Advarselen om at et søk
   uten filtre varsler om alt brukte rå Tailwind-farger
   (`border-amber-300 bg-amber-50 text-amber-800`) i stedet for
   token-baserte klasser — så feil ut i mørk modus. Byttet til samme
   mønster som `moderation-banner.tsx` allerede brukte.

## Kjente begrensninger / bevisste avgrensninger

- **Bilder i utkast-autosave (fase 1, punkt 4) er ikke persistert.**
  Bildene i annonsering-wizarden er rå `File`-objekter i minnet, ikke
  serialiserbare til `localStorage` uten en vesentlig større endring
  (IndexedDB/Blob-lagring). Attributter (ren JSON) er den klart
  høyest-verdi delen å gjenopprette og er nå dekket; full bilde-gjenoppretting
  er bevisst utelatt (`ponytail:`-kommentar i `use-draft-autosave.ts`
  navngir dette).
- **`typewriterPlaceholder` på web-landingssiden** (`src/routes/index.tsx`,
  `useTypewriterText`) bruker fortsatt en ekte `placeholder`-attributt på
  inputen (ikke en `aria-hidden`-overlay) — vurdert som en mindre alvorlig
  variant av a11y-problemet enn den native landingssidens overlay, og ikke
  rørt i denne omgangen.
- **Kategoribytte-kommentaren** i `category-change-dialog.tsx` er rettet til
  å beskrive faktisk atferd (attributter slettes), men selve mekanismen
  (ingen migrering av attributter til ny kategoris feltnøkler) er uendret —
  det ville krevd samme registry som opprettelses-wizarden bruker, utenfor
  denne omgangens omfang.

## Nye filer

- `src/hooks/use-focus-trap.ts` + `.test.tsx` — delt fokusfelle-hook for
  fullskjerm-overlays.
- `src/lib/storage.test.ts` — dekker batching og cache-gjenbruk i
  `signListingImageUrls`.

## Anbefalte neste steg

Ordnet omtrent etter forventet verdi/innsats-forhold, basert på funn fra
den opprinnelige analysen som ikke ble tatt med i denne omgangen (bevisst
holdt utenfor for å holde denne runden fokusert på konkrete bugs og
tilgjengelighet, ikke en full omskriving):

1. **Konsolider web/native duplisering i søk og landingsside.** Nesten hele
   søk/filter/landingsside-flyten er bygget to ganger (`SearchBar` vs
   `NativeSearchOverlay`, `AdvancedSearchSheet` vs `NativeAdvancedSearch`,
   `FilterChip` vs native sin egen `Chip`, to separate
   Nominatim-geokodings-implementasjoner i `location-filter.tsx` og
   `listings-map.tsx`). Dette er den mest fundamentale strukturelle gjelden
   i kodebasen og roten til flere av funnene i denne og forrige omgang —
   fortsetter å produsere drift (ulik feilhåndtering, ulik animasjon,
   glemte oppdateringer på den ene siden) helt til noen deler trekkes ut i
   felles primitiver med plattform-spesifikke presentasjonslag.
2. **Fullfør tilgjengelighets-passet.** Denne omgangen dekket de mest
   alvorlige/konkrete funnene (fokusfeller, manglende aria-live, alt-tekst).
   Gjenstår bl.a.: tastaturalternativ for 360°-viseren
   (`vehicle-360-viewer.tsx`, i dag kun pekerstyrt), fokushåndtering ved
   ruteendring på native (`NativePageHeader` mangler dette; web har en
   skip-to-content-lenke native ikke har noe tilsvarende for), og en full
   WCAG AA-kontrastsjekk av kategori-hover-fargene i `category-chip-row.tsx`.
3. **Legg til bekreftelse/tydeliggjøring i vehicle-confirm-steget i
   wizarden.** Deaktiverte knapper uten forklaring, og et
   avgiftsoverstyrings-felt uten øvre grense — begge i et steg med reelle
   økonomiske/juridiske konsekvenser (omregistreringsavgift, SVV-data).
4. **Bilde-draft-gjenoppretting via IndexedDB**, hvis brukertesting/support-
   henvendelser viser at tap av valgte-men-ikke-lastede-opp bilder ved
   utilsiktet faneexit faktisk er et reelt problem i praksis (ikke antatt
   her — se «Kjente begrensninger»).
5. **Batch flere av de resterende per-rad `signListingImageUrls`-kallene
   eksplisitt** (f.eks. samle alle `cover_path` i en `Mine annonser`-liste i
   ett kall før rendering) — batching-fiksen i fase 4 fanger opp kall gjort
   i samme tick automatisk, men eksplisitt batching på listenivå ville
   redusere antall ticks/renders ytterligere for svært lange lister.

## Funn oppdaget underveis (ikke rettet i denne omgangen)

- `advanced-search-sheet.tsx` og `native-advanced-search.tsx` har flere
  `setState` kalt synkront inne i `useEffect` (flagget av lint som
  `react-hooks/set-state-in-effect`-advarsler, ikke feil) — pre-eksisterende
  mønster brukt konsekvent i kodebasen, ikke noe denne omgangen introduserte,
  men verdt en egen opprydningsrunde om lint-advarslene skal bort helt.
- `editable-field.tsx` har en `react-hooks/refs`-advarsel om å lese en ref
  under render (linje som kaller `editRender(...)` med `onCommit: commit`,
  hvor `commit` indirekte lukker over en ref) — pre-eksisterende, ikke rørt.
