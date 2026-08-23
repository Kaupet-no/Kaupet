# Frontend- og UX-assessment for Kaupet

**Dato:** 23. august 2026  
**Omfang:** Sluttbrukerrettet web og Capacitor-app, med særlig vekt på søk, resultater, annonsedetalj, registrering og annonseopprettelse.  
**Metode:** Statisk gjennomgang av arkitektur, ruter, komponenter, features, tester og bundle; visuell kontroll av lokal web på 1440 × 900 og native-emulering på 375 × 812; kontroll av DOM, konsoll og sentrale brukerflyter.  
**Avgrensning:** Ingen produksjonsdata, ekte iOS-/Android-simulator, skjermleser, reell nettverksstrupling eller brukertest inngår.

## Kort dom

Kaupet har allerede et mer særpreget visuelt utgangspunkt enn de fleste norske markedsplasser: varm papirflate, mørk skoggrønn, terrakotta og Newsreader gir en gjenkjennelig, rolig og redaksjonell karakter. Dette skal **ikke** erstattes med en generisk «moderne SaaS»-stil.

Det største problemet er ikke estetikk. Det er at produktet prøver å vise for mye av sin tekniske intelligens samtidig. Søk har flere konkurrerende mentale modeller. Opprettelse er blitt en fleksibel flytmotor med mange stopp. Annonsedetaljen har mye fakta, men gjør ikke tydelig nok forskjell på verifiserte data og selgers påstander. Native ber om tillatelser før brukeren har opplevd verdi.

Den tydelige retningen bør være:

> **Kaupet skal føles som den rolige markedsplassen som forstår hva du mener og viser hva du kan stole på.**

Ikke vinn på flere funksjoner. Vinn på mindre friksjon, synlig forklaring og dokumentert tillit.

## Scorecard

| Område                 | Vurdering | Kort begrunnelse                                                                                                     |
| ---------------------- | --------: | -------------------------------------------------------------------------------------------------------------------- |
| Visuell identitet      |      8/10 | Tydelig egenart, gode tokens og typografi; fortsatt for mye standard kort/pille-chrome i funksjonsflatene.           |
| Informasjonsarkitektur |      5/10 | God rutebase, men for mange parallelle innganger og kontrollmønstre.                                                 |
| Søk og filtrering      |      6/10 | Teknisk kraftig og lovende; brukerens mentale modell er ikke samlet.                                                 |
| Annonseopprettelse     |      5/10 | Robust skall, autosave og validering; for mange steg og for mye konfigurerbar flyt.                                  |
| Tillit                 |      6/10 | Personvern, åpen kildekode og kjøretøydata er sterke; proveniens og trygg handel er svakt kommunisert.               |
| Opplevd ytelse         |      5/10 | Gode skeletons og route-splitting, men førstesiden hydrerer feil og de største inngangene er tunge.                  |
| Native-opplevelse      |      6/10 | Safe area, haptikk og overlays er gjennomtenkt; onboarding, auth og noen web-primitiver bryter helheten.             |
| Tilgjengelighet        |      6/10 | Gode etablerte regler og flere riktige ARIA-mønstre; reelle semantiske og dialogrelaterte avvik finnes.              |
| Testbarhet             |      8/10 | 368 tester passerer, gode testid-konvensjoner og tydelig teststrategi. Visuell regresjon og kjernefunnel mangler.    |
| Frontend-vedlikehold   |      5/10 | God feature-retning, men 49 149 linjer frontend-TSX og flere svært store orkestreringsfiler gir høy endringskostnad. |

## Det Kaupet må beholde

1. **Den redaksjonelle nordiske identiteten.** Krem, skoggrønn, terrakotta og serif/sans-kontrasten skiller seg allerede ut.
2. **Personvern som produktløfte.** «Ingen reklame, minst mulig datainnsamling, åpen kildekode» er en reell differensiator, ikke pynt.
3. **Én delt web/native-kodebase.** Formatfaktortilpasningene er stort sett sunne. Ikke bygg parallelle native-flows.
4. **Eksisterende primitive lag.** `ResponsiveOverlay`, `FullscreenOverlay`, `NativeSheet`, `SearchPanel` og `ListingComposerShell` er riktige grenser.
5. **Førsteparts produktmåling.** Den lille, ikke-identifiserende hendelsesmodellen er i tråd med løftet og dekker allerede viktige trinn.
6. **Kjøretøyoppslag og strukturerte fakta.** Dette er et konkret tillitsfortrinn som bør løftes visuelt, ikke gjemmes som ordinære felter.

## Prioriterte funn

### P0 — førstesiden hydrerer feil

**Bevis:** Lokal desktop-kontroll logger React-feilen «Hydration failed because the server rendered HTML didn't match the client». `src/routes/index.tsx` finner `#header-search-slot` direkte under render og oppretter en portal på klienten som ikke finnes i SSR-treet.

**Konsekvens:** Hele treet regenereres på klienten. Det gir ekstra arbeid, risiko for flimring, tap av state/fokus og svekket opplevd fart på produktets viktigste side.

**Tiltak:** Gjør portalens første render server- og klientlik. Den minste løsningen er en `mounted`-state satt i `useEffect` før portalen rendres. Den bedre langsiktige løsningen er at `SiteHeader` eier sin søkeflate via delt søkestate, slik at en rute ikke portalerer interaktiv UI inn i global chrome.

**Akseptanse:** Ingen hydration-feil ved hard reload, JavaScript deaktivert gir korrekt grunninnhold, og søkefeltets verdi/fokus overlever overgangen til sticky header.

### P0 — annonsedetaljen faller ut av SSR på grunn av Leaflet

**Bevis:** Direkte lasting av en annonsedetalj logger `ReferenceError: window is not defined` fra Leaflet og «Switched to client rendering because the server rendering errored». `listing-detail-view.tsx` importerer `FullscreenLocationPicker` statisk; denne importerer `react-leaflet` og `leaflet` på modulnivå. Den eksisterende `mounted`-vakten rundt det synlige detaljkartet beskytter derfor ikke modulinnlastingen.

**Konsekvens:** En av de viktigste SEO- og konverteringsflatene mister serverrendering, får svakere første paint og blir avhengig av JavaScript før annonseinnholdet er robust tilgjengelig.

**Tiltak:** Fjern alle Leaflet-importer fra serverens modulgraf. Last `FullscreenLocationPicker`, detaljkart og kartoverlay klient-only bak eksisterende `mounted`-grense. Ikke innfør en ny kartabstraksjon; én lazy import på det faktiske interaksjonspunktet holder.

**Akseptanse:** Direkte hard reload av en annonse returnerer serverrendret tittel, pris og beskrivelse; serverloggen har ingen `window is not defined`; Leaflet lastes først når kartet skal vises eller redigeres.

### P0 — native onboarding ber om tillit før den har fortjent den

**Bevis:** Første appstart blokkeres av en obligatorisk fullskjermflyt med velkomst, varseltillatelse og lokasjonstillatelse. Den kan ikke lukkes med Escape, klikk utenfor eller system-tilbake.

**Konsekvens:** To systemtillatelser etterspørres uten at flyten først undersøker om brukeren er ny, har en kjent konto eller allerede har lagrede søk. For en ukjent førstegangsbruker strider dette mot Kaupets personvernprofil. For en innlogget bruker med lagrede søk kan push derimot ha umiddelbar og konkret verdi.

**Tiltak:** Gjør onboardingen adaptiv i stedet for å vise samme tillatelseskarusell til alle:

- ukjent eller utlogget bruker: vis en lett velkomst med «Utforsk Kaupet» og valgfri «Logg inn og hent lagrede søk»; ikke be om push;
- innlogget bruker med ett eller flere lagrede søk og `default` push-tillatelse: vis en Kaupet-flate som forklarer den konkrete verdien, for eksempel «Du har 3 lagrede søk. Vil du få beskjed når noe nytt matcher?»; først brukerens eksplisitte «Ja, varsle meg» åpner OS-dialogen;
- innlogget bruker uten lagrede søk: vent til vedkommende lagrer et søk, får en samtale eller aktiverer varsler i profil;
- allerede gitt tillatelse: bruk eksisterende `autoRestoreNativePush()` til å registrere enheten stille etter oppstart/innlogging;
- avslått tillatelse: ikke spør på nytt i appen; forklar på «Mine søk» eller profilsiden hvordan den kan endres i systeminnstillingene.

Den kontekstuelle handlingen skal gå gjennom `usePushStatus().enableOnThisDevice("saved_searches")`, ikke kalle `subscribeNative()` direkte. Da registreres enheten og kontopreferansen for lagrede søk slås på i samme brukerhandling.

**Akseptanse:** En ukjent bruker kan starte første søk med ett trykk og møter ingen OS-dialog. En innlogget bruker med lagrede søk får et konkret, personalisert varseltilbud tidlig. OS-dialogen åpnes bare etter eksplisitt handling, og eksisterende tillatelse gjenopprettes uten nytt spørsmål.

### P1 — søket har tre mentale modeller

Brukeren møter samtidig:

- vanlig fritekst;
- automatisk kategori-/attributtgjenkjenning;
- avansert søk med «alle ord», «minst ett», ekstra termgrupper og eksklusjoner.

Teknisk er dette kraftfullt. UX-messig blir det uklart om teksten er et søk, en kommando eller en kategori. På desktop foreslås «Begrens søket til Sofa» etter søk, mens native har et eget søkepanel med historikk, kategorier og filterseksjoner. Webforsiden, webresultatet og nativepanelet lærer dermed brukeren forskjellige regler.

**Retning:** Én søkemodell, flere innganger. Brukeren skriver naturlig; Kaupet viser umiddelbart hvordan teksten ble tolket som redigerbare biter:

```text
«Volvo V90 diesel under 300 000 nær Oslo»
→ [Volvo] [V90] [Diesel] [≤ 300 000 kr] [Oslo + 50 km]
```

Dette er ikke en chatbot. Det er en synlig parser bygget på dagens `resolveTextToFilters`, `AdvancedSearchValue`, URL-schema og filterchips.

**Tiltak:**

1. La `AdvancedSearchValue` være eneste anvendte søkemodell.
2. La forsidefelt, sticky header, `/annonser` og native `SearchPanel` kun være adaptere til samme modell.
3. Vis tolkningen direkte under feltet før eller samtidig med treff.
4. Flytt boolsk termlogikk til «Presist søk» for eksperter; ikke vis den som likestilt standardfunksjon.
5. Behold alt anvendt søk i URL-en slik at tilbake, deling og lagrede søk fortsetter å virke.
6. Ved null treff: behold brukerens hensikt, forklar hvilket filter som snevrer mest inn, og tilby én konkret utvidelse om gangen.

### P1 — annonseopprettelse er en flytmotor før den er en oppgave

**Bevis:** Salgsruten er 1 720 linjer. Native gjør hver aktive feltgruppe til en egen side. En innlogget gjennomgang av en ordinær stolannonse ga åtte steg: bilder, egenskaper, tilstand, pris, beskrivelse, levering, sted og publisering. Tilstand var en egen side med ett forhåndsvalgt felt; pris var en egen side med ett tomt felt. Kjøretøy får i tillegg registrering, 360°, fakta, tilstand/utstyr og egen pris.

**Det som fungerer:** Tittel/intensjon før ruten, autosave, utkastgjenoppretting, feilsammendrag, idempotenshensyn, kjøretøyoppslag og review er riktig fundament.

**Problemet:** Brukeren må forstå Kaupets skjemastruktur. Valgfrie forbedringer som 360°-opptak ligger i den primære sekvensen. Administrerbar rekkefølge gir fleksibilitet, men gjør produktet vanskeligere å forenkle og teste.

Den innloggede testen avdekket i tillegg:

- automatisk kategoriforslag sto i en ubestemt «Identifiserer innhold»-tilstand i flere sekunder; manuell kategorivelger var heldigvis tilgjengelig;
- forrige annonses postnummer og sted ble forhåndsutfylt uten å forklare kilden, slik at feil sted lett kan publiseres ved ren «Fortsett»-navigasjon;
- review viste kategori, tittel/bilde, pris og sted, men ikke materiale, stil, merke, tilstand, beskrivelse eller levering;
- alle fire reviewhandlingene heter bare «Endre» i tilgjengelighetstreet;
- «Endre» på «Pris og detaljer» sendte brukeren tilbake til første detaljside, og neste gyldige «Fortsett» gikk videre til neste steg i stedet for tilbake til review, i strid med composer-kontrakten i arkitekturguiden.

**Ny standardflyt for ordinære annonser:**

1. **Vis varen:** Bilder + kort tittel. Etter første bilde vises et levende annonseutkast.
2. **Gjør den søkbar:** Foreslått kategori + kun feltene som er nødvendige for treff og sammenligning.
3. **Gjør handelen tydelig:** Pris, tilstand, levering og sted på én side med progressiv visning.
4. **Kontroller og publiser:** Forhåndsvisning der mangler kan rettes inline.

**Kjøretøy:** Registreringsnummer først, slå opp det som kan slås opp, og spør bare om manglende eller selgervurderte data. Flytt 360° til et valgfritt «Gjør annonsen bedre»-kort etter minimumsannonsen, ikke et obligatorisk stopp i lineær navigasjon.

**Teknisk prinsipp:** Del felter i `requiredToPublish`, `recommendedForTrust` og `optionalEnhancement`. Ikke bygg et nytt generelt regelsystem; utvid den eksisterende feltgruppekontrakten med den minste metadataen som trengs.

### P1 — tillit er innholdsrik, men ikke lesbar som proveniens

Annonsedetaljen har sterke elementer: medlemsdato, strukturerte kjøretøydata, kjente feil, vedlikehold, omtrentlig lokasjon og kontakt i kontekst. Men alle fakta presenteres omtrent likt. Kjøperen ser ikke raskt hva som kommer fra Statens vegvesen, hva selgeren har oppgitt, hva Kaupet har validert, og hva som bare er fravær av informasjon.

**Forslag: «Faktagrunnlag», ikke tillitsbadge.**

Vis en kompakt seksjon nær pris/kontakt:

- **Verifisert fra kjøretøyregisteret:** registreringsdata og tidspunkt for oppslag;
- **Oppgitt av selger:** tilstand, feil, vedlikehold og utstyr;
- **Kaupet-konto:** medlem siden, eventuelle fullførte handler/anmeldelser der datagrunnlaget er reelt;
- **Trygg handel:** konkrete råd før melding eller betaling.

Ikke innfør en vag grønn «trygg selger»-badge. Den lover mer enn systemet kan bevise.

### P1 — native auth vises inni ordinær appnavigasjon

På 375 × 812 ligger registreringskortet over bunnavigasjonen, og den løftede «Ny annonse»-knappen konkurrerer visuelt med skjemaet. Auth er en fokusert avstikker, ikke en appfane.

**Tiltak:** Skjul `AppBottomNav` på auth, tilbakestilling, onboarding og andre fokuserte inngangs-/bekreftelsesruter. Bruk en liten sentral ruteklassifisering ved siden av `isComposerRoute`, ikke lokale CSS-unntak.

### P2 — kjøperkort viser selgerinterne visningstall

Annonsekort viser totalt antall visninger og «siste syv dager». For kjøperen er dette støy og kan skape falsk sosial validering eller unødvendig knapphetsfølelse. For selgeren er tallene nyttige på «Mine annonser».

**Tiltak:** Fjern visningstall fra offentlige `ListingCard`. Behold dem i selgerflate og eventuelt admin. Bruk frigjort plass til tidspunkt, avstand eller ett kategori-relevant nøkkelfaktum.

### P2 — nativeforsiden bruker høyde som dekorasjon

Telefonheroen bruker rundt 68 % av viewporten. Resultatet er et vakkert, men svært tomt første skjermbilde der «Populært nå» presses ned bak den flytende navigasjonen.

**Tiltak:** La heroen ende etter søk, lokasjon og de to snarveiene, omtrent 52–58 % på vanlig telefon. Vis første troverdige annonsekort over folden. Behold luft, men bruk den til bevis på faktisk markedsplassaktivitet.

### P2 — komponentreglene etterleves ikke konsekvent

Eksempler:

- Nativeforsidens lokasjonsvelger bruker `Dialog` direkte i stedet for `ResponsiveOverlay`.
- `IntentTitleLanding` har en hover-avhengig tooltip inne i en flyt som brukes native.
- Flere sluttbrukerflater bruker direkte `Dialog`/`Sheet` selv om UI-guiden definerer felles primitiver.
- Kommentarer refererer til gamle «fase», «funn» og planer som ikke finnes i `docs/plans/`.

**Konsekvens:** Historikk, gest, fokus og formatfaktor blir inkonsistent. Koden dokumenterer tidligere prosjektfaser i stedet for varige produktregler.

**Tiltak:** En mekanisk ryddejobb, ikke en ny abstraksjon: bytt avvik til eksisterende primitiver, fjern hover-only hjelp, og omskriv kommentarer til hvorfor-kunnskap. Legg en enkel ESLint-begrensning på direkte `Dialog` i sluttbrukerkomponenter først når de faktiske unntakene er kartlagt.

### P2 — semantiske tilgjengelighetsavvik

- Native annonsedetalj har to semantiske `h1`: den skjulte/fadende sidetittelen i `NativePageHeader` og den synlige tittelen i innholdet. `aria-hidden` fjerner ikke problemet med dokumenthierarkiet for alle verktøy.
- Onboarding rendrer alle tre kortene samtidig i dialogtreet; DOM-snapshotet eksponerer alle overskrifter og knapper selv når bare ett kort er synlig.
- Animerte placeholders er visuelt effektfulle, men den viktigste instruksjonen må alltid finnes som stabil label/hjelpetekst.
- Swipe og drag er godt støttet flere steder, men må fortsatt verifiseres ved 200 % tekst, ekstern tastaturbruk og redusert bevegelse.

**Tiltak:** Bruk ikke-overskriftsmarkup for den skjulte native headertittelen når `titleFadesIn`; sett ikke-aktive onboardingkort `inert`/`aria-hidden`; legg kjerneflytene inn i en eksplisitt a11y-regresjonstest.

### P2 — kompleksitet bremser UX-arbeidet

Repoet har 256 TSX-filer og omtrent 49 149 linjer i sluttbruker-/frontendområdene. De største sentrale filene er blant annet:

- `ny-annonse.tsx`: 1 720 linjer;
- `listing-detail-view.tsx`: 1 125 linjer;
- `attribute-filter-chips.tsx`: 1 097 linjer;
- `ny-ok-annonse.tsx`: 1 040 linjer;
- `annonser.tsx`: 835 linjer;
- `index.tsx`: 783 linjer.

Store filer er ikke automatisk feil. Her betyr de likevel at ruter eier datalasting, produktregler, analyse, plattformgren, overlay-state og presentasjon samtidig. Det øker risikoen for at en liten UX-endring påvirker flere skjulte tilstander.

**Tiltak:** Ikke start en generell refaktorering. Ekstraher kun i forbindelse med de prioriterte flytendringene, og bare kontrakter med minst to reelle konsumenter. Første kandidater er anvendt søkemodell, ruteklassifisering og publiseringsorkestrering.

### P2 — ytelsesbudsjettet består, men er ikke ambisiøst nok for kjerneinngangene

Produksjonsbuild og bundlekontroll består. Observerte nøkkeltall:

- største generelle klientchunk: ca. 324 kB / 99,7 kB gzip;
- klientruntime: ca. 208 kB / 53,9 kB gzip;
- CSS: ca. 113 kB / 19,2 kB gzip;
- fonter: ca. 180 kB totalt;
- Leaflet: ca. 153 kB / 45 kB gzip;
- salgsopprettelse: ca. 40 kB / 13,3 kB gzip i egen routechunk, med store delte registre i tillegg.

**Tiltak:** Mål per brukerreise, ikke bare største fil. Kart, avansert søk, 360° og admin må aldri ligge på kritisk sti for første søk. Sett et eksplisitt budsjett for forsiden og første resultatvisning i tillegg til dagens globale filgrense.

## Foreslått visuell retning

### «Nordisk bruktjournal»

Ikke gjør Kaupet mørkere, mer glassaktig eller mer neon. Gjør uttrykket mer konsekvent redaksjonelt:

- **Flater:** færre kort inni kort; mer sammenhengende papirflate med tynne regler og tydelige seksjoner.
- **Typografi:** Newsreader for overskrift, pris og de viktigste faktaene; Inter for kontroll, metadata og skanning.
- **Farge:** grønt betyr handling/tillit, terrakotta betyr oppmerksomhet/karakter. Kategorifarge brukes som lokal aksent, ikke bakgrunnstema for hele siden.
- **Bilder:** større og mer ærlige. Dårlige/manglende bilder skal se bevisst nøkterne ut, ikke som ødelagt innhold.
- **Bevegelse:** kun for romlig forståelse—panel åpner, filter anvendes, kort blir til detalj. Ingen typewriter eller pynt som får grensesnittet til å virke langsommere.
- **Ikonbruk:** ikon støtter tekst; sjeldnere ikon uten etikett. Kaupet skal føles redaksjonelt, ikke som en kontrollpanel-app.

### Signaturkomponenter

1. **Tolkningslinjen:** søket oversettes til redigerbare, menneskelesbare kriterier.
2. **Faktagrunnlaget:** tydelig proveniens på annonsen uten vage sertifiseringspåstander.
3. **Levende annonseutkast:** opprettelsesflyten viser den faktiske annonsen tidlig og lar brukeren forbedre den, i stedet for å fylle ut et skjema i blinde.

Disse tre gir mer egenart enn en ny gradient, illustrasjonsstil eller mikroanimasjon.

## Teknisk implementeringsplan

### Fase 0 — stabiliser kjerneopplevelsen (1–3 dager)

**Mål:** Fjern feil og unødvendige tillitshindre før redesign.

1. Fiks SSR/hydration for sticky header-søk i `src/routes/index.tsx` og `src/components/site-header.tsx`.
   **Status 23.08.2026: Fullført.** `HeaderSearchPortal` venter til etter mount før portal-målet leses, mens søkefeltet forblir montert gjennom sticky-overgangen. Verifisert med en hydration-regresjonstest, full unit-suite, lint og typecheck.
2. Fjern Leaflet fra SSR-modulgrafen ved å laste `FullscreenLocationPicker` og øvrige kartflater klient-only.
   **Status 23.08.2026: Fullført.** Kartvelgere, resultatkart og detaljkart lastes nå med `lazy` bak `ClientOnly`. `check:server-boundary` følger statiske importer fra rutene og avviser Leaflet i SSR-grafen. Verifisert med rødt/grønt boundary-sjekk, full unit-suite, lint, typecheck og produksjonsbuild.
3. Innfør én `isFocusedRoute(pathname)` ved siden av `composer-route.ts`; skjul bunnnav på auth, reset, onboarding og bekreftelsesflater i `src/routes/__root.tsx`.
   **Status 23.08.2026: Fullført.** En tabelltestet ruteklassifisering skjuler native bunnnav og tilhørende innholds-padding på auth, passordreset og betalingsbekreftelse/-kvittering. Onboardingens eksisterende fullskjermsoverlegg dekker og inert-gjør appskallet på `/`. Verifisert med målrettet unit-test, full unit-suite, lint og typecheck.
4. Gjør onboardingen adaptiv: hent authstatus, antall lagrede søk og pushstatus; vis tidlig push-tilbud kun når kontoen allerede har lagrede søk, ellers flyttes forespørselen til relevant handling.
   **Status 23.08.2026: Fullført.** Utloggede får én lett velkomst med utforsking eller innlogging og ingen tillatelsesforespørsel. Innloggede får et konkret push-tilbud bare ved minst ett lagret søk med `notify=true` og urørt tillatelse; eksplisitt CTA bruker `usePushStatus().enableOnThisDevice("saved_searches")`, mens `granted`/`denied` hoppes over. Verifisert med fem komponenttilstander og rødt/grønt-kontroll, full unit-suite (70 filer / 383 tester), lint, typecheck og produksjonsbuild.
5. Fjern offentlige visningstall fra `src/components/listing-card.tsx`.
   **Status 23.08.2026: Fullført.** Visningstall er fjernet fra både standardkortet og den utvidede offentlige kortvarianten, mens selgerens statistikkflater er beholdt. Verifisert med målrettet komponenttest, full unit-suite, lint og typecheck.
6. Bytt native lokasjonsdialog til `ResponsiveOverlay`; fjern hover-only tooltip i `IntentTitleLanding`.
   **Status 23.08.2026: Fullført.** Nativeforsidens lokasjonsvalg bruker nå eksisterende `ResponsiveOverlay`, med samme fokusoppsett og primitivens innebygde sheet-, safe-area- og historikkoppførsel. Tittelunntaket i `IntentTitleLanding` er synlig uten hover. Verifisert med målrettede komponenttester, full unit-suite, lint og typecheck.
7. Rett semantisk dobbel `h1` og skjul inaktive onboardingkort korrekt.
   **Status 23.08.2026: Fullført.** Den fadende native headertittelen bruker ikke overskriftsmarkup når innholdet allerede har dokumentets `h1`. Onboardingkortene beholder snap-animasjonen, men bare aktivt kort er eksponert og interaktivt via native `aria-hidden`/`inert`. Verifisert med målrettede komponenttester, full unit-suite, lint, typecheck og produksjonsbuild.

**Tester:**

- hard reload av `/` uten konsollfeil;
- hard reload av annonsedetalj med serverrendret kjerneinnhold og uten Leaflet-feil;
- komponenttest for routestyrt navsynlighet;
- onboardingtester for utlogget bruker, innlogget bruker uten søk, innlogget bruker med lagrede søk og allerede gitt/avslått tillatelse;
- a11y-test av ett aktivt onboardingkort;
- eksisterende lint, typecheck og unit suite.

**Ferdig når:** Førstesiden hydrerer rent, første native søk krever ingen tillatelser, og auth har ingen konkurrerende bunnnav.

### Fase 1 — ett søk på alle flater (1–2 uker)

**Mål:** Samle mental modell og kodevei uten å bygge en ny søkemotor.

1. Gjør `AdvancedSearchValue` + attributtverdier til autoritativ anvendt søkestate.
   **Status 23.08.2026: Fullført.** `AppliedSearchState` samler `AdvancedSearchValue` og attributter bak én URL-codec; resultatpanelet har én eksplisitt lokal draft og mottar ikke lenger parallelle `q`-/attributtverdier. Verifisert med rød/grønn round-trip-kontrakttest, målrettede tester, full unit-suite, lint og typecheck.
2. La tekstpipeline returnere både normalisert query og en ordnet liste over tolkede kriterier med `source: "text" | "user"`.
3. Lag én liten `SearchInterpretation`-komponent som bruker eksisterende chip-/filterhandlinger.
4. Koble webforside, header, `/annonser` og native `SearchPanel` til samme submitfunksjon.
5. Behold draft state lokalt i panel; skriv URL én gang ved «Vis treff» eller eksplisitt submit.
6. For null treff, beregn effekten av å fjerne ett aktivt kriterium med eksisterende facet-/count-kall og vis beste utvidelse.
7. Flytt termgrupper og «alle/minst ett» bak «Presist søk»; ikke fjern funksjonaliteten for brukere som trenger den.

**Berørte områder:**

- `src/features/listing-search/resolve-text-to-filters.ts`;
- `src/features/listing-search/search-panel/`;
- `src/features/listing-search/search-schema.ts`;
- `src/routes/index.tsx`;
- `src/routes/annonser.tsx`;
- `src/components/search-bar.tsx`;
- `src/components/attribute-filter-chips.tsx`.

**Måling med eksisterende førstepartsmodell:**

- `search_submitted`: antall tolkede kriterier og kilde, aldri querytekst;
- `search_zero_results`: antall aktive kriterier og kategori-status;
- nytt event bare hvis nødvendig: `search_refined`, med kriterietype, ikke verdi;
- tid fra `search_opened` til første resultatpaint måles lokalt i sesjonen og rapporteres som grovt intervall, ikke fritekst eller identifikator.

**Akseptanse:** Samme tekst gir samme URL og samme kriterier fra alle innganger; tilbakeknapp gjenoppretter søket; all tolkning kan overstyres med ett trykk; tastatur og skjermleser kan redigere alle kriterier.

### Fase 2 — kort annonseopprettelse (2–3 uker)

**Mål:** Halver opplevde stopp uten å svekke validering, sikkerhet eller datakvalitet.

1. Mål dagens median tid og frafall per `step` fra eksisterende hendelser før rekkefølgen endres.
2. Klassifiser eksisterende feltgrupper som publiseringskrav, tillitsanbefaling eller valgfri forbedring.
3. Endre `resolveWizardPages` slik at ordinær nativeflyt grupperes i fire meningsfulle sider; ikke opprett en ny parallell wizard.
4. Behold kjøretøyregistrering solo. Gruppér oppslåtte fakta med brukerens bekreftelse, ikke som gjentatt dataregistrering.
5. Flytt `vehicle-360` ut av lineær minimumsflyt og presenter den etter grunnbilder eller publisering som forbedring.
6. Vis `PreviewDraftView` tidligere som en del av flyten; la reviewseksjoner åpne riktig side og returnere til review.
7. Vis «Publiseringsklar» separat fra «Dette vil gi en bedre annonse».
8. Behold autosave, første ugyldige felt, Turnstile, idempotens og servervalidering uendret.

**Berørte områder:**

- `src/features/listing-creation/category-flows.ts`;
- `src/features/listing-creation/field-groups/registry.ts`;
- `src/features/listing-creation/listing-composer-shell.tsx`;
- `src/features/listing-creation/composer-review.tsx`;
- `src/features/listing-creation/preview-draft-view.tsx`;
- `src/routes/_authenticated/ny-annonse.tsx`;
- kjøpsønskeflyten kun der delt skall faktisk gir samme semantikk.

**Tester:** Én kontrakttest per representativ flyt: generisk, kategori med påkrevde attributter, bil med oppslag, uregistrert kjøretøy og båt. E2E må dekke utkast, tilbake/review, publiseringsretry og tastatur på telefon.

**Akseptanse:** Ordinær annonse kan publiseres gjennom maksimalt fire hovedstopp etter inngang; bruker mister ingen data ved kategoriendring eller tilbake; alle gamle sikkerhets- og serverkrav består.

### Fase 3 — tillit som produktflate (1–2 uker)

**Mål:** Gjør det tydelig hva kjøperen vet, ikke bare hva annonsen inneholder.

1. Definer en presentasjonsmodell `FactSource` i detalj-feature, ikke i generisk listingdomene: `registry`, `seller`, `kaupet`, `unknown`.
2. Map eksisterende kjøretøyoppslag, profilalder, anmeldelser og selgerfelter til kilder.
3. Bygg en kompakt `ListingEvidence`-seksjon med tekstlige kilder og tidspunkt der det finnes.
4. Skill «Ingen kjente feil oppgitt» visuelt og språklig fra «verifisert uten feil».
5. Flytt trygg-handel-råd til kontaktøyeblikket og første samtale, ikke en generell tekstvegg.
6. Ikke lag score eller badge før det finnes validerte data og en dokumentert modell for feilklassifisering.

**Akseptanse:** En bruker kan på fem sekunder svare på hvem som har oppgitt viktigste fakta; ingen tekst lover verifikasjon Kaupet ikke har gjort.

### Fase 4 — visuell konsolidering (1 uke, etter flytendringene)

**Mål:** La den eksisterende identiteten bli tydeligere gjennom reduksjon.

1. Definer tre tetthetsnivåer i eksisterende tokens: hero/redaksjonell, oppgave og dataliste.
2. Fjern unødvendige nested cards og piller i søk/resultat/composer.
3. Standardiser pris, metadata, proveniens og primærhandling på annonsekort og detalj.
4. Kort ned nativeheroen og vis første annonse over folden.
5. Bruk kategoriaksent kun på valgt tilstand/overskrift; behold nøytral skanning ellers.
6. Dokumenter eksemplene i `docs/UI-GUIDE.md`; ikke lag et separat designsystemdokument.

**Akseptanse:** Flater ser ut som samme produkt uten at web og native er pikselidentiske; semantiske tokens dekker alle nye varianter; dark mode og 200 % tekst er kontrollert.

### Fase 5 — kvalitet og ytelsesvern (løpende, start i fase 0)

1. Legg hydration-feil og `console.error` inn som feil i Playwright for kjerneflytene.
2. Legg visuell snapshotdekning på 375 × 812, 820 × 1180 og 1440 × 900 for forside, søkepanel, resultat, detalj, auth og composer.
3. Sett routebudsjett for `/` og `/annonser`, i tillegg til dagens største-fil-budsjett.
4. Lazy-load kart først når kartet er synlig eller brukeren velger kartmodus.
5. Kontroller faktisk bilde-LCP og fontlasting; preload bare den fonten/vekten som brukes over folden hvis måling viser gevinst.
6. Bruk eksisterende produkthendelser til ukentlig funnel, aggregert og uten fritekst/PII.

## Prioritert backlog

| Rekkefølge | Tiltak                                  | Effekt    | Innsats     |
| ---------: | --------------------------------------- | --------- | ----------- |
|          1 | Fiks hydration på `/`                   | Svært høy | Lav         |
|          2 | Fjern Leaflet fra SSR-modulgrafen       | Svært høy | Lav         |
|          3 | Fjern tidlige tillatelseskrav           | Svært høy | Lav         |
|          4 | Skjul bunnnav på fokuserte ruter        | Høy       | Lav         |
|          5 | Fjern offentlige visningstall           | Middels   | Svært lav   |
|          6 | Samle søkestate og vis tolkning         | Svært høy | Middels     |
|          7 | Reduser ordinær composer til fire stopp | Svært høy | Middels/høy |
|          8 | Flytt 360° ut av minimumsflyt           | Høy       | Lav/middels |
|          9 | Innfør faktagrunnlag/proveniens         | Høy       | Middels     |
|         10 | Konsolider overlays og a11y-avvik       | Høy       | Lav/middels |
|         11 | Reduser kort/pille-chrome               | Middels   | Middels     |

## Hva som eksplisitt ikke bør bygges nå

- Ingen chatbot eller generativ søkeassistent. Eksisterende parser med synlig tolkning er raskere, billigere og mer tillitvekkende.
- Ingen ny design-tokenpakke eller komponentbibliotek. Dagens Tailwind/shadcn/Radix-lag holder.
- Ingen separat native-produktflyt.
- Ingen selgerscore eller «AI-verifisert»-badge.
- Ingen generell frontendrefaktorering før kjerneflytene endres.
- Ingen flere onboardingkort, tooltips eller coach marks for å forklare kompleksitet som kan fjernes.

## Beslutninger som må tas av produkteier

1. Skal Kaupet optimalisere først for **raskt publisert minimumsannonse** eller **maksimal datakompletthet før publisering**? Anbefaling: minimumsannonse med tydelig forbedringsnivå.
2. Skal avansert boolsk søk være et synlig hovedløfte eller et ekspertverktøy? Anbefaling: ekspertverktøy bak «Presist søk».
3. Hvilke tillitssignaler kan Kaupet faktisk dokumentere i dag? Anbefaling: vis kun kilde og fakta, ikke score.
4. Er 360°-opptak en differensiator som må være del av opprettelsen, eller en forbedring? Anbefaling: forbedring etter minimumsannonsen.

## Verifiseringsstatus

Gjennomført:

- `bun run lint` — bestått;
- `bunx tsc --noEmit` — bestått;
- `bun run test` — 67 testfiler og 368 tester bestått;
- `bun run build` — bestått;
- `bun run check:bundle` — bestått;
- visuell og semantisk kontroll av webforside, søkeresultat, native onboarding, native forside, native søkepanel, native annonsedetalj og native registrering.

Ikke verifisert:

- ekte iOS-/Android-enhet, safe area og systemtilbake;
- kjøretøycomposer og faktisk publisering; ordinær innlogget flyt er verifisert frem til publiseringsknappen uten å publisere;
- skjermleser, 200 % tekst og ekstern tastaturbruk;
- nettverk med høy latenstid/tap og reelle Core Web Vitals;
- kvalitative brukertester eller produksjonsfunnel.

Den eksisterende, urelaterte endringen i `src/lib/category-suggestion-ai.server.ts` er ikke berørt.
