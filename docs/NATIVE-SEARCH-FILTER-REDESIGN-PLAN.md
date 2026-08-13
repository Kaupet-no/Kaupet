# Native søkefilter: redesign og implementeringsplan

> Levende styringsdokument for redesign av søke- og filterpanelet i Kaupets
> native-apper. Dokumentet er både designkontrakt, arbeidsplan og statuslogg.
> Alle agenter som arbeider med initiativet skal lese hele dokumentet og
> oppdatere relevante status-, funn- og verifiseringsseksjoner i samme endring.

Opprettet: 2026-08-13  
Sist oppdatert: 2026-08-13  
Dokumenteier: Produkt/UX  
Overordnet status: **Ikke startet**

## 1. Mål og ønsket effekt

Filterpanelet skal gjøre Kaupets avanserte søkemuligheter enkle å oppdage og
trygge å bruke på telefon og nettbrett. Brukeren skal kunne avgrense et søk
raskt uten å møte et langt, tett skjema eller små kontroller.

Løsningen skal:

- prioritere store, tydelige og konsistente trykkflater;
- gi god luft mellom valg og redusere samtidig eksponert kompleksitet;
- presentere valgt tilstand før alle mulige innstillinger;
- bruke romslige native valgflater i stedet for trange dropdown-menyer;
- løfte frem de mest relevante kategorifiltrene uten å skjule resten;
- beholde live treffantall, utkast, nullstilling, lagring av søk og alle
  eksisterende filtermuligheter;
- fungere med Dynamic Type/Android tekstskalering, skjermleser, tastatur,
  system-tilbake og iOS-kantsveip;
- gjenbruke og utvide eksisterende primitiver fremfor å etablere et nytt
  parallelt UI-system.

### Ikke-mål

- Ingen endring av søkesemantikk, RPC-kontrakter, URL-format eller database i
  første omgang.
- Ingen generell redesign av alle skjemaer i Kaupet. Delte primitivendringer
  må likevel vurderes mot alle eksisterende kallsteder.
- Ingen separat native kodebase. Capacitor-appen skal fortsatt bruke den
  delte React-implementasjonen med formatfaktor-responsive primitiver.
- Ingen ny UI-avhengighet uten dokumentert behov som eksisterende Radix,
  shadcn, Vaul og CSS ikke dekker.

## 2. Før agenten starter

1. Les `AGENTS.md`, hele `CLAUDE.md`, `docs/UI-GUIDE.md` og dette dokumentet.
2. Les nærliggende kode og tester. Søk spesielt i `src/components/ui/`,
   `src/components/` og `src/features/listing-search/` før noe nytt bygges.
3. Kontroller `git status`. Ikke overskriv eller rydd bort andres endringer.
4. Velg ett avgrenset arbeidspunkt fra faseplanen. Ikke bland uavhengige faser
   i samme commit.
5. Oppdater statusen for arbeidspunktet til **Pågår**, med dato og agent, før
   implementeringen begynner.
6. Etter arbeidet: oppdater status, verifisering, funn, avvik og anbefalte
   videre steg i dette dokumentet.

Tillatte statusverdier: **Ikke startet**, **Pågår**, **Blokkert**, **Ferdig i
kode**, **Verifisert** og **Utsatt**. «Ferdig i kode» betyr aldri at manuell
native-verifisering kan hoppes over.

## 3. Dagens løsning og berørte hovedfiler

Native søk går allerede gjennom ett `SearchPanel` med 60 % og full høyde.
Dette skal videreutvikles, ikke erstattes av en tredje søkeflate.

| Område          | Nåværende ansvar                                                        | Sentrale filer                                                                                                   |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Panel og utkast | Drawer, snap-punkter, treffantall, bruk/nullstill/lagre                 | `src/features/listing-search/search-panel/search-panel.tsx`                                                      |
| Filterinnhold   | Aktive filtre, kategori, sted, pris, tilstand, attributter, søkegrupper | `src/features/listing-search/search-panel/filter-sections.tsx`                                                   |
| Kategorifiltre  | Dynamiske `CategoryFilter`-kontroller                                   | `src/components/category-filter-fields.tsx`, `src/components/attribute-filter-chips.tsx`                         |
| Tallområder     | Slider og fra/til-felt                                                  | `src/components/range-filter-field.tsx`, `src/components/ui/range-slider.tsx`                                    |
| Sted            | Stedsøk, posisjon og radius                                             | `src/components/location-filter.tsx`                                                                             |
| Boolsk søk      | Inkluder/ekskluder og alle/minst ett ord                                | `src/components/term-group-editor.tsx`                                                                           |
| Valgflater      | Select, sheet, dialog og responsive overlays                            | `src/components/ui/select.tsx`, `src/components/ui/native-sheet.tsx`, `src/components/ui/responsive-overlay.tsx` |
| Knapper         | Delte varianter og størrelser                                           | `src/components/ui/button.tsx`, `src/components/ui/button-variants.ts`                                           |
| Retningslinjer  | Gjeldende UI-konvensjoner                                               | `docs/UI-GUIDE.md`                                                                                               |

Før en delt primitiv endres skal agenten finne alle kallsteder med `rg` og
avgjøre om endringen kan gjøres globalt, trenger en native-/størrelsesvariant,
eller kun hører hjemme i søkeflyten.

## 4. Designkontrakt

Denne seksjonen er normativ. Avvik skal beskrives under «Beslutningslogg» og
godkjennes før implementering.

### 4.1 Informasjonsarkitektur

Første nivå er en filteroversikt, ikke et komplett skjema. Oversikten viser:

1. header med «Filtrer», «Nullstill» ved aktive valg og lukk/tilbake;
2. et kompakt sammendrag av aktive filtre;
3. rader for Kategori, Sted, Pris og Tilstand;
4. 4–6 primære kategorifiltre når kategori er valgt;
5. én tydelig rad for «Alle filtre», med antall aktive sekundærfiltre;
6. én rad for «Avanserte søkeord», med kort sammendrag;
7. fast bunnhandling med live treffantall.

En filterrad viser etikett, valgt verdi eller «Alle», eventuelt antall valg og
chevron. Tapping åpner en egen valgflate. Hovedoversikten skal ikke vise
dropdown-lister, søketrefflister, checkboksmatriser eller flere sliders
samtidig.

### 4.2 Visuell rytme og luft

- Horisontal sidemarg på kompakt mobil: 16 px/dp.
- Vertikal avstand mellom hovedgrupper: 24 px/dp.
- Avstand mellom relaterte rader i samme gruppe: 8–12 px/dp.
- Innvendig padding i tappbare rader: minst 16 px horisontalt og 12 px
  vertikalt.
- Standard filterrad: minst 56 px/dp høy. Raden kan vokse ved stor tekst.
- Det skal aldri være mer enn én primær fylt knapp i samme viewportseksjon.
- Bruk bakgrunn, mellomrom og typografisk hierarki før flere rammer. Unngå
  «kort inni kort» og gjentatte helrammede beholdere.
- Forklarende tekst skal være kort og kun vises der den hjelper et konkret
  valg. Lange forklaringer åpnes i en tilgjengelig valgflate.

Tallene er startverdier, ikke argument for fast høyde. Innhold skal kunne
reflowe ved tekstskalering uten avkorting eller overlapp.

### 4.3 Knapper og trykkflater

- Alle native interaktive elementer skal ha minst 48 × 48 dp effektivt
  treffområde. Dette dekker Androids 48 dp og Apples anbefalte 44 pt.
- Standard handlingsknapp i native filterflyt: minst 52 px/dp høy.
- Primær bunnhandling: 56 px/dp høy, full bredde, tydelig verb og treffantall.
- Ikonknapper skal ha minst 48 × 48 treffområde, `aria-label` og synlig
  press-/fokustilstand. Selve ikonet kan være 18–24 px.
- Hele radio-, checkbox- og switchraden skal være tappbar; ikke bare den
  synlige kontrollen.
- Nærliggende handlinger skal ha minst 8 px/dp visuelt mellomrom og ikke dele
  overlappende usynlige treffområder.
- Destruktive eller nullstillende handlinger skal ikke konkurrere visuelt med
  «Vis annonser».
- Kompakte `size="sm"`-knapper skal ikke brukes som primære interaksjoner i
  native filterflater.
- Haptikk skal bruke eksisterende wrappers og være lett; haptikk erstatter
  aldri visuell valgt/trykket tilstand.

Implementeringen skal først vurdere om `buttonVariants` trenger en eksplisitt
native/komfortabel størrelse. Ikke øk alle knapper globalt blindt; admin- og
desktopflater må ikke få utilsiktede layoutbrudd.

### 4.4 Dropdowns, enkeltvalg og flervalg

På native telefon skal en trang ankret dropdown ikke brukes i filterflyten.
Velg mønster etter innhold:

| Innhold                               | Native mønster                                                   |
| ------------------------------------- | ---------------------------------------------------------------- |
| 2–5 korte, gjensidig utelukkende valg | Store valgknapper eller romslig radioliste                       |
| 6–12 valg                             | `NativeSheet` med fullbreddsrader                                |
| Mer enn 12 valg eller lange etiketter | Fullhøyde, søkbart `NativeSheet`                                 |
| Flervalg                              | Søkbar sjekkliste, valgte elementer øverst, fast «Bruk»-handling |
| Hierarki, for eksempel kategori       | Drill-down med breadcrumb/tilbake                                |

Hver valgrad skal være minst 52–56 px/dp, vise valgt tilstand både visuelt og
semantisk og, når tilgjengelig, vise treffantall høyrejustert. Valgte verdier
skal bevares mens brukeren søker i listen. «Alle» eller «Ingen begrensning»
skal være et eksplisitt, forståelig valg.

`Select` kan fortsatt brukes på web og desktop. Native-adferd skal samles i én
gjenbrukbar eksisterende/utvidet valgflate, ikke spesialimplementeres for
hvert filter.

### 4.5 Slidere og numeriske områder

Slider brukes bare når relativ justering er viktigere enn eksakt verdi.

- Synlig thumb: minst 24 px/dp. Effektivt treffområde: minst 48 × 48.
- Spor: minst 4–8 px høyt, med tydelig aktiv og inaktiv del.
- Sliderregionen skal ha minst 24 px vertikal luft over og under sporet.
- `data-vaul-no-drag` beholdes, slik at slidergesten ikke drar sheetet.
- Verdi skal alltid vises tekstlig; farge og thumb-posisjon er ikke nok.
- Tastatur, skjermleser og tekstinnskriving skal være reelle alternativer.
- Dobbel slider skal ikke være standard for alle tallfiltre på mobil.

Anbefalt kontroll per filter:

- Pris: store Fra/Til-felt og relevante hurtigvalg; slider er valgfri sekundær
  kontroll dersom brukertest viser verdi.
- Radius: 5, 10, 25, 50 og 100 km samt «Hele Norge»; «Egendefinert» kan åpne
  slider.
- Årsmodell: Fra/Til-valg eller tallfelt, ikke slider som eneste kontroll.
- Kilometerstand: maksimum-hurtigvalg og egendefinert felt.
- Vekt, effekt og andre ekspertfelt: romslige Fra/Til-felt.

### 4.6 Aktive filtre

- Første nivå viser et kort sammendrag, for eksempel «7 filtre valgt».
- Eventuelle tokens skal ha minst 44/48 px effektiv høyde eller treffområde og
  synlig fjernknapp.
- Swipe-to-delete kan være en snarvei, men aldri eneste fjernemulighet.
- «Nullstill» er alltid synlig når minst ett filter er aktivt.
- Fjerning oppdaterer utkast og treffantall, men lukker ikke panelet.

### 4.7 Avanserte søkeord

Eksisterende `exclude` og `mode` beholdes i datamodellen, men presenteres som:

- **Må inneholde** — alle ordene;
- **Kan inneholde** — minst ett av ordene;
- **Skal ikke inneholde** — ekskluderte ord.

«Flere søkelinjer» og tekniske uttrykk som «boolsk» skal ikke brukes i
brukergrensesnittet. Regelbyggeren åpnes i en egen romslig valgflate. Store
segmenter/radiovalg erstatter dagens kompakte «Vis/Ekskluder» og «Alle
ord/Minst ett».

### 4.8 Navigasjon og adaptive flater

- Søkefilteret forblir én `SearchPanel`-flyt.
- 60 % detent kan vise oversikten; scroll eller åpning av et konkret filter
  ekspanderer til full høyde.
- Filterundersider bruker full høyde på telefon.
- Nettbrett/web bruker sentrert dialog eller sidepanel med passende maks
  bredde; ikke fullbredde telefon-sheet på store skjermer.
- Android-tilbake og iOS-kantsveip går ett nivå tilbake fra filterundersiden
  før hele filterpanelet lukkes.
- Fokus og scrollposisjon gjenopprettes til raden som åpnet undersiden.
- Safe area håndteres av eksisterende overlayprimitiver.

### 4.9 Treffantall, venting og null treff

- Fast bunnhandling skal alltid være nåbar og tilgjengelig for skjermleser.
- Forrige treffantall beholdes mens nytt tall beregnes; en liten statusindikator
  forteller at tallet oppdateres.
- Ved null treff skal knappen fortsatt være forståelig, og flaten kan foreslå
  én konkret utvidelse, eksempelvis større radius eller å fjerne ett filter.
- Treffantall per valgalternativ skal vises der data finnes, men må ikke gjøre
  raden visuelt tett eller være eneste signal om tilgjengelighet.

## 5. Faseplan

Hver fase skal leveres og verifiseres separat. Fase 0–2 etablerer kontrakter og
primitiver; senere faser skal ikke duplisere disse lokalt.

### Fase 0 – baseline, prototyp og måling

Status: **Ferdig i kode**  
Ansvarlig: Codex  
Sist oppdatert: 2026-08-13

Arbeid:

- dokumenter skjermbilder/video av dagens flyt på iOS- og Android-telefon;
- registrer kontrollhøyder, treffområder, avstander, nesting og steder med
  dropdown/popover;
- kartlegg alle `CategoryFilter`-typer og minst kategoriene Bil, MC og én
  ikke-kjøretøykategori;
- lag en klikkbar eller kodebasert lavdetalj-prototype av oversikt og minst
  tre undersider: enkeltvalg, flervalg og numerisk område;
- definer baseline for tid til utført filter, feiltrykk, nulltreff og frafall
  dersom produktdata er tilgjengelig;
- avklar hvilke 4–6 primærfiltre som vises per kategori via eksisterende
  `is_primary`; ikke bygg en ny rangeringsmotor i denne fasen.

Akseptansekriterier:

- Produkt/UX har godkjent informasjonsarkitektur og ordlyd.
- Alle eksisterende filterfunksjoner er representert i løsningsskissen.
- Ukjente kategorifiltertyper er dokumentert, ikke antatt bort.

Verifisering/statusnotat: Baseline er kartlagt fra implementasjonen, med en
lavdetalj-skisse nedenfor. iOS-/Android-opptak, produkt-/UX-godkjenning og
produksjonsmålinger er ikke tilgjengelige i arbeidsmiljøet og må gjøres før
fasen kan markeres **Verifisert**.

**Implementasjonsbaseline (2026-08-13)**

- `SearchPanel` er én Vaul-bunnskuff med 60 % og full høyde. Når panelet
  redigerer søkeresultater, eier det et utkast og viser fast «Vis annonser»-
  handling med live treffantall.
- `SearchFilterSections` viser i dag aktive filtre, Kategori, Sted, Pris,
  Tilstand og «Flere filtre» som én kontinuerlig, scrollende kontrollmatrise.
  Kategori og en søkelinje åpnes allerede i `NativeSheet`; stedets treffliste,
  radius-slider, prisslider/felt, tilstandschips og kategorifiltre ligger
  ellers eksponert i hovednivået.
- Kjent tett/nestet innhold: stedsresultater har egen `max-h-[260px]` scroll,
  «Flere filtre» er en `Collapsible` inni panelets scrollregion, og dynamiske
  filtervalg kan bruke `Select`/popover. Dette er direkte inngangspunkter for
  fase 2–6, ikke endringer i denne fasen.
- Den datadrevne kontrakten i `CategoryFilter` dekker `select`, `multiselect`,
  `number`, `range`, `boolean`, `text`, `brand_select` og `model_select`.
  `is_primary` og `sort_order` finnes allerede og er tilstrekkelige som
  prioritetsgrunnlag; ingen ny rangeringsmotor er nødvendig.
- Bil og MC bruker blant annet koblet `brand_select`/`model_select`, valg,
  flervalg, boolske felt og tallområder. En generisk kategori bruker samme
  kontrakt uten kjøretøyimport; Båt er et relevant ikke-bil-eksempel med
  `number`, `range`, avhengigheter og valg. Den lokale seed-dataen inneholder
  bare et minimalt e2e-kjøretøysett, så full kategoriinventar må hentes fra
  staging før native QA.
- Eksisterende telemetri registrerer `search_opened`, `search_submitted` og
  `search_zero_results`, men ikke feiltrykk, panelavbrudd eller tid til apply.
  Fase 8 må avklare om aggregerte, ikke-sensitive hendelser dekker dette.

**Lavdetalj-prototype**

```
Filtrer                                      Nullstill   Lukk
7 filtre valgt

Kategori                         Bil                         ›
Sted                             Oslo · 25 km               ›
Pris                             50 000–200 000 kr          ›
Tilstand                         Brukt                       ›

Primære filtre
Merke                            Volvo                       ›
Modell                           XC60                        ›
Årsmodell                        2020–                       ›

Alle filtre                      3 aktive                   ›
Avanserte søkeord                Må inneholde: hybrid       ›

[                    Vis 42 annonser                    ]
```

Undersider representerer alle eksisterende funksjoner: enkeltvalg (Tilstand),
flervalg (Merke) og numerisk område (Pris). Kategori, sted, alle
kategorifiltre og søkeord følger samme oversikt → fullhøyde-undernivå-mønster.

### Fase 1 – oppdater UI-guiden og komponentkontraktene

Status: **Ferdig i kode**  
Ansvarlig: Codex  
Sist oppdatert: 2026-08-13

Arbeid:

- oppdater `docs/UI-GUIDE.md` med normative seksjoner for:
  - knappestørrelser og hele tappbare rader;
  - spacing og visuell tetthet på native;
  - valg av `Select`, valgknapper, `NativeSheet` og søkbar valgliste;
  - sliderstørrelse, treffområde og når slider ikke skal brukes;
  - filteroversikt, filterundersider og fast bunnhandling;
  - skjermleser, fokusretur, tekstskalering og gesturealternativer;
- dokumenter hvilke regler som gjelder globalt og hvilke som kun gjelder
  native/kompakte visningsflater;
- legg kodeeksempler med eksisterende primitiver, ikke hypotetiske API-er som
  ikke skal implementeres i neste fase;
- oppdater dette dokumentets beslutningslogg ved avvik fra designkontrakten.

Akseptansekriterier:

- En agent kan velge riktig kontrolltype fra UI-guiden uten skjønn basert på
  antall valg og formatfaktor.
- Apple 44 pt og Android 48 dp er dekket av Kaupets 48 × 48-minimum.
- Guiden forbyr kompakte dropdown/popover-mønstre i native filterflyt.

Verifisering/statusnotat: UI-guiden er oppdatert med kontrakter som bruker
eksisterende `NativeSheet`, `ResponsiveOverlay`, `Button`, `Checkbox` og
slider-primitivene. Visuell og native enhetsverifisering hører til fase 7 og
er ikke kjørt i denne dokumentasjonsfasen.

### Fase 2 – delte native primitiver

Status: **Ferdig i kode**  
Ansvarlig: Codex  
Sist oppdatert: 2026-08-13

Arbeid:

- revider `buttonVariants` og innfør kun nødvendige komfortable/native
  størrelser; behold kompatibilitet for web/admin;
- revider `Slider` og `RangeSlider`: synlig thumb, 48 × 48 treffområde,
  fokusstil, disabled-state og vertikal gestplass;
- bygg eller utvid én adaptiv valgflate basert på `NativeSheet` for
  enkeltvalg, flervalg, søk, valgte verdier og fast bunnhandling;
- sikre romslige valgradhøyder og at hele raden er tappbar;
- legg inn fokusretur og tilgjengelige navn/statusmeldinger;
- skriv små komponenttester for størrelsesvariant, valgt tilstand,
  tastaturnavigasjon og apply/cancel-semantikk.

Beslutningsport før kode:

- Kan eksisterende `NativeSheet`, `Command` og `Checkbox` komponeres direkte?
  Hvis ja, ikke lag et nytt generelt designsystemlag.
- Skal `Select` endres globalt? Standardvalg er nei: native søkefilter bruker
  adaptiv valgflate, mens desktop beholder `Select`.

Akseptansekriterier:

- Ingen ny produksjonsavhengighet.
- Interaktive native-kontroller oppfyller 48 × 48.
- Valgflaten fungerer med lange etiketter, tom liste, lasting, stor tekst og
  minst 100 alternativer.
- Eksisterende web-/adminflater har ingen observerte regresjoner.

Verifisering/statusnotat: `NativeChoiceSheet` komponerer eksisterende
`NativeSheet`, `Command` og `Checkbox`; `Select` er ikke endret. Komponenttest,
lint og typecheck passerer. Visuell kontroll ved stor tekst, 100+ valg og
native simulator/enhet er ikke kjørt og hører til fase 7.

### Fase 3 – ny filteroversikt og intern navigasjon

Status: **Ikke startet**  
Ansvarlig: –  
Sist oppdatert: 2026-08-13

Arbeid:

- erstatt den kontinuerlige skjemalisten i `SearchFilterSections` med
  sammendragsrader;
- innfør intern navigasjonsstate for oversikt og filterunderside uten å
  endre søkets datamodell;
- vis Kategori, Sted, Pris, Tilstand, primærfiltre, Alle filtre og Avanserte
  søkeord i definert rekkefølge;
- bevar utkast helt til «Vis annonser» brukes;
- implementer tilbake, kantsveip, fokusretur og scrollgjenoppretting;
- behold 60 % oversikt og ekspander til full høyde ved undersider;
- sikre at fast bunnhandling ligger inne i tilgjengelig dialogtre og ikke
  skjules av Radix `aria-hidden`.

Akseptansekriterier:

- Brukeren møter ingen stor kontrollmatrise på første nivå.
- Alle aktive verdier kan forstås fra sammendraget.
- Lukk uten apply forkaster utkast på samme måte som før.
- Apply, cancel, nullstill og system-tilbake har automatiserte tester.

Verifisering/statusnotat: _Fylles ut av agenten._

### Fase 4 – kategori, sted, pris og tilstand

Status: **Ikke startet**  
Ansvarlig: –  
Sist oppdatert: 2026-08-13

Arbeid:

- Kategori: behold hierarki og ikoner, men bruk romslige rader, tydelig
  breadcrumb og stor ferdig-/brukhandling;
- Sted: flytt søkeresultater og posisjon til egen underside; bruk store
  radiusvalg og «Egendefinert» ved behov;
- Pris: prioriter Fra/Til og relevante hurtigvalg; evaluer slider mot
  prototyp/baseline før den beholdes;
- Tilstand: bruk store flervalgskort/-rader med tydelig valgt tilstand;
- gratisannonser: vurder som eget tydelig valg i prisflaten, med forklaring av
  hvordan det påvirker en eventuell minimumspris;
- sikre at søkeresultatrader for sted og clear-knapp oppfyller treffkrav.

Akseptansekriterier:

- Ingen nested scroll-region for sted på hovedoversikten.
- Radius kan velges med ett trykk for vanlige avstander.
- Pris kan fylles ut uten slider.
- Alle handlinger fungerer med tastatur og skjermleser.

Verifisering/statusnotat: _Fylles ut av agenten._

### Fase 5 – kategorifiltre og «Alle filtre»

Status: **Ikke startet**  
Ansvarlig: –  
Sist oppdatert: 2026-08-13

Arbeid:

- vis eksisterende `is_primary`-filtre på oversikten;
- grupper resten tematisk der metadata finnes; hvis metadata mangler, bruk
  eksisterende sortering og dokumenter behovet i «Utenfor omfang» fremfor å
  hardkode kjøretøylogikk i generisk kjerne;
- bygg søkbar «Alle filtre»-flate med aktive grupper først;
- migrer `select`, `multiselect`, `brand_select` og `model_select` til den
  adaptive valgflaten;
- presenter `boolean` som hel tappbar rad;
- presenter `range`/`number` etter reglene i designkontrakten;
- behold avhengigheter som Merke → Modell og Hengerfeste → Hengervekt;
- vis facet-tall uten å redusere lesbarhet eller treffområde;
- test minst Bil, MC og én generisk kategori med alle relevante filtertyper.

Akseptansekriterier:

- Ingen native `SelectContent` eller trang popover brukes i filterflyten.
- Alle datadrevne filtertyper kan åpnes, endres, nullstilles og oppsummeres.
- Generisk annonsekjerne importerer ikke kjøretøyspesifikk logikk.
- Søking i lange valglister mister ikke allerede valgte verdier.

Verifisering/statusnotat: _Fylles ut av agenten._

### Fase 6 – aktive filtre og avanserte søkeord

Status: **Ikke startet**  
Ansvarlig: –  
Sist oppdatert: 2026-08-13

Arbeid:

- erstatt store swipe-rader med kompakt sammendrag og tilgjengelige tokens
  eller redigerbare sammendragsrader;
- behold synlig fjernhandling i tillegg til eventuell swipe;
- redesign regelbyggeren til Må inneholde, Kan inneholde og Skal ikke
  inneholde;
- bruk store valg for regeltype og romslige ordtokens;
- gjør add/remove, duplikater, tom regel og cancel/apply eksplisitt;
- behold eksisterende `TermGroup`-modell og URL-/query-semantikk.

Akseptansekriterier:

- Ingen nødvendig funksjon er kun gesturebasert.
- Brukeren trenger ikke forstå «alle ord/minst ett» eller «inkluder/ekskluder»
  før regelen kan settes opp.
- Eksisterende søkegrupper round-tripper uten datatap.

Verifisering/statusnotat: _Fylles ut av agenten._

### Fase 7 – responsivitet, tilgjengelighet og native QA

Status: **Ikke startet**  
Ansvarlig: –  
Sist oppdatert: 2026-08-13

Automatisert kontroll:

- `bun run lint`
- `bunx tsc --noEmit`
- relevante Vitest-komponenttester og deretter `bun run test`
- relevant Playwright-test med `?forcenative`
- `bun run build` og eventuelt `bun run check:bundle` ved nye komponenter

Manuell matrise:

| Flate                    | Størrelse           | Kontroller                                     |
| ------------------------ | ------------------- | ---------------------------------------------- |
| Mobil web/native-preview | 375×812             | Tetthet, tastatur, ingen horisontal overflow   |
| Android liggende test    | 844×390             | Tastatur/insets og nåbar bunnhandling          |
| Nettbrett                | 820×1180            | Dialogbredde, to kolonner kun når lesbart      |
| Stort nettbrett          | 1024×1366           | Maksbredde og fokusrekkefølge                  |
| iOS-simulator/enhet      | Telefon + nettbrett | Safe area, Dynamic Type, kantsveip, VoiceOver  |
| Android-emulator/enhet   | Telefon + nettbrett | 48 dp, fontskalering, system-tilbake, TalkBack |

Test minst:

- standard, 200 % tekst/tilsvarende største realistiske native tekstnivå;
- lyst og mørkt tema;
- skjermleserrekkefølge og annonsering av valgt/antall/lasting;
- eksternt tastatur og synlig fokus;
- åpne/lukke/avbryte hver underside;
- tom, én, mange og svært lange valglister;
- null treff, treg opptelling og nettverksfeil;
- alle retninger som appens orienteringsregler tillater;
- drag av sheet versus slidergest;
- Android tilbake og iOS-kantsveip gjennom flere nivåer.

Akseptansekriterier:

- Ingen P0/P1 tilgjengelighets- eller navigasjonsfeil.
- Alle treffområder er manuelt eller automatisk bekreftet mot kontrakten.
- Avvik er dokumentert med eier og oppfølgingspunkt.

Verifisering/statusnotat: _Fylles ut av agenten._

### Fase 8 – utrulling og produktmåling

Status: **Ikke startet**  
Ansvarlig: –  
Sist oppdatert: 2026-08-13

Arbeid:

- avklar om kontrollert utrulling/feature flagg er nødvendig ut fra endringens
  størrelse; ikke bygg flagginfrastruktur kun for dette dersom den mangler;
- verifiser på staging, aldri direkte i produksjon;
- mål åpning → filtervalg → apply, tid til apply, bruk av primærfilter, åpning
  av Alle filtre, nulltreff, nullstilling og avbrutt panel;
- ikke logg søketekst eller rå filterverdier som kan være personlige;
- sammenlign med fase 0-baseline etter representativ trafikk;
- prioriter oppfølging ut fra observerte problemer, ikke bare preferanser.

Målhypoteser, som må tallfestes etter baseline:

- kortere median tid fra panelåpning til apply;
- høyere andel søk med minst ett kategorispesifikt filter;
- lavere andel paneler som lukkes uten endring;
- ingen økning i nulltreff eller umiddelbar filterfjerning;
- økt bruk av avanserte søkeord uten økt frafall.

Verifisering/statusnotat: _Fylles ut av agenten._

## 6. Kryssgående akseptansekriterier

Initiativet er ikke ferdig før alle punktene er oppfylt:

- Alle eksisterende filterfunksjoner er bevart eller eksplisitt produktmessig
  besluttet fjernet.
- Hovedoversikten viser sammendrag fremfor hele kontrollsettet.
- Native filterflyt har ingen trange dropdowns eller hoveravhengige mønstre.
- Alle native trykkflater er minst 48 × 48 og har tilstrekkelig avstand.
- Primærhandling er alltid synlig, nåbar og i tilgjengelighetstreet.
- Tekstskalering gir ikke avkorting, overlapp eller skjulte handlinger.
- System-tilbake, kantsveip, fokusretur og sheet-drag er verifisert.
- Web, nettbrett og admin har ingen regresjoner fra delte primitivendringer.
- `docs/UI-GUIDE.md` beskriver den implementerte, ikke bare planlagte,
  løsningen.
- Relevante tester, staging og native enheter er dokumentert nedenfor.

## 7. Arbeidslogg

Legg til nyeste oppføring øverst. Ikke slett historikk; korriger med en ny
oppføring.

| Dato       | Agent | Fase/punkt | Status        | Endring og resultat                                              | Verifisering                                             |
| ---------- | ----- | ---------- | ------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| 2026-08-13 | Codex | Fase 2     | Ferdig i kode | La til delt native valgflate og komfortable slider-/knappemål.   | Komponenttest, lint og typecheck passerer.               |
| 2026-08-13 | Codex | Fase 1     | Ferdig i kode | La til normative native filterkontrakter i UI-guiden.            | Dokumentgjennomgang; enhets-QA er utsatt til fase 7.     |
| 2026-08-13 | Codex | Fase 0     | Ferdig i kode | Kartla eksisterende flyt, filterkontrakt og lavdetalj-prototype. | Kodegjennomgang; native enheter og produktdata gjenstår. |
| 2026-08-13 | Codex | Plan       | Ferdig        | Opprettet designkontrakt og faseplan                             | Dokumentgjennomgang                                      |

## 8. Funn og beslutningslogg

Alle funn som påvirker design, arkitektur, omfang eller rekkefølge registreres
her. Bruk stabil ID slik at arbeidspunkter kan referere til funnet.

| ID    | Dato       | Funn/beslutning                                                                                      | Konsekvens                                                   | Besluttet tiltak                                                         | Status/eier          |
| ----- | ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------- |
| F-001 | 2026-08-13 | SearchPanel er allerede én delt native søkeflate med 60 %/full detent.                               | Ny parallell flate ville duplisere state og navigasjon.      | Videreutvikle SearchPanel med oversikt og undersider.                    | Besluttet            |
| F-002 | 2026-08-13 | `SelectItem` og flere små segment-/checkboxkontroller er for kompakte for native filterbruk.         | Feiltrykk og høy visuell tetthet.                            | Bruk adaptiv native valgflate og hel tappbar rad; behold desktop Select. | Planlagt, fase 2/5   |
| F-003 | 2026-08-13 | `RangeFilterField` viser dobbel slider og to felt for alle numeriske områder.                        | Unødvendig høyde og motorisk belastning for presise verdier. | Velg kontroll etter datatype; tekstfelt/hurtigvalg er primært.           | Planlagt, fase 2/4/5 |
| F-004 | 2026-08-13 | Fast bunnhandling har tidligere hatt risiko for å havne utenfor Radix-dialogens tilgjengelighetstre. | Skjermleser kan miste viktigste handling.                    | Verifiser og løs som eksplisitt akseptansekriterium i fase 3/7.          | Åpen                 |

## 9. Avvik og blokkeringer

Bruk denne tabellen når planen ikke kan følges. Et avvik skal beskrive faktisk
årsak, bruker-/teknisk risiko og hvem som kan beslutte videre retning.

| ID  | Dato | Fase | Avvik/blokkering        | Risiko | Neste handling | Eier/status |
| --- | ---- | ---- | ----------------------- | ------ | -------------- | ----------- |
| –   | –    | –    | Ingen registrerte avvik | –      | –              | –           |

## 10. Anbefalte videre steg fra identifiserte funn

Agenter skal legge til anbefalinger her når et funn er verdifullt, men ikke
inngår i aktiv fase. Hvert punkt skal ha en tydelig utløsende betingelse; ikke
lag en ønskeliste med spekulativt arbeid.

| ID    | Kilde/funn                                                            | Anbefalt steg                                                                 | Når bør det gjøres?                                                       | Prioritet/status |
| ----- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------- |
| V-001 | Bruksdata for filtrene er foreløpig ikke kartlagt.                    | Ranger primærfiltre med aggregert, personvernvennlig bruk etter `is_primary`. | Når redesignets baseline har nok representativ trafikk.                   | Senere           |
| V-002 | Tematisk gruppemetadata finnes ikke nødvendigvis for alle kategorier. | Vurder adminfelt for filtergruppe og hjelpetekst.                             | Kun hvis fase 5 viser at eksisterende sortering gir uforståelige grupper. | Betinget         |
| V-003 | Nulltreff kan ofte løses ved å løsne ett filter.                      | Vurder forklarbare forslag basert på facet-/treffdata.                        | Etter at grunnflyten er målt og nulltreff er et dokumentert problem.      | Betinget         |

## 11. Tiltak utenfor arbeidets omfang

Registrer nødvendige eller nyttige tiltak som ble oppdaget, men som ikke bør
blandes inn i dette initiativet. Oppgi begrunnelse og foreslå eget arbeid.

| ID    | Tiltak                                            | Hvorfor utenfor omfang                                                       | Anbefalt håndtering                                                  | Status       |
| ----- | ------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| O-001 | Generell migrering av alle dropdowns i hele appen | Initiativet gjelder søkefilter; global migrering har større regresjonsflate. | Gjør egen inventar/audit etter at filtermønsteret er verifisert.     | Ikke startet |
| O-002 | Endring av filterdatamodell eller søke-RPC        | Redesign skal først bevise verdi uten backendrisiko.                         | Opprett separat teknisk plan dersom fase 5 avdekker reelt databehov. | Betinget     |

## 12. Verifiseringsjournal

Før nøyaktig kommando, miljø og resultat. «Testet» uten miljø/størrelse er ikke
tilstrekkelig.

| Dato       | Fase | Kontroll/miljø                                                                                        | Resultat                                                | Ikke dekket / merknad                                                                         |
| ---------- | ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2026-08-13 | 2    | `bun run test -- src/components/ui/native-choice-sheet.test.tsx`; `bun run lint`; `bunx tsc --noEmit` | 2 komponenttester, lint og typecheck passerer.          | Ingen 100+-liste, stor tekst eller native simulator/enhet.                                    |
| 2026-08-13 | 1    | Dokumentgjennomgang av `docs/UI-GUIDE.md` mot eksisterende UI-primitiver                              | Kontrolltyper, mål og tilgjengelighetskrav dokumentert. | Ingen nettleser-, simulator- eller enhetskontroll; fase 7 eier QA.                            |
| 2026-08-13 | 0    | Kodegjennomgang av `SearchPanel`, `SearchFilterSections`, filterkontrakten og telemetry               | Baseline, filtertyper og prototype dokumentert.         | Ingen simulator/enhet, skjermbilder/video, stagingdata eller UX-godkjenning i arbeidsmiljøet. |
| –          | –    | –                                                                                                     | Ingen implementeringskontroller kjørt ennå              | Planfase                                                                                      |

## 13. Ferdigdefinisjon for hvert arbeidspunkt

Et punkt kan markeres **Verifisert** først når:

1. kode og UI-guide er konsistente;
2. relevante enhets-/komponenttester er oppdatert;
3. lint og typecheck er kjørt;
4. relevante viewportstørrelser er visuelt kontrollert;
5. iOS/Android-spesifikk oppførsel er kontrollert på simulator/enhet når
   punktet berører safe area, gester, tastatur, tillatelser eller tilbake;
6. funn, avvik, videre steg og utenfor-omfang er oppdatert;
7. statusnotatet sier eksplisitt hva som ikke er verifisert.

## 14. Referanser

- Apple Human Interface Guidelines, Buttons:
  <https://developer.apple.com/design/human-interface-guidelines/buttons>
- Apple Human Interface Guidelines, Accessibility:
  <https://developer.apple.com/design/human-interface-guidelines/accessibility>
- Apple Human Interface Guidelines, Search fields:
  <https://developer.apple.com/design/human-interface-guidelines/search-fields>
- Android Developers, Accessibility:
  <https://developer.android.com/design/ui/mobile/guides/foundations/accessibility>
- Android Developers, Grids and units:
  <https://developer.android.com/design/ui/mobile/guides/layout-and-content/grids-and-units>
- Kaupet UI-guide: `docs/UI-GUIDE.md`
