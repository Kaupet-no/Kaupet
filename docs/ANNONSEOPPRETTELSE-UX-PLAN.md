# UX-evaluering og implementeringsplan: annonseopprettelse

> Levende arbeidsdokument for flytene «selge eller gi bort» og «ønsker å
> kjøpe». Dokumentet er både beslutningsgrunnlag, implementeringsrekkefølge og
> statuslogg. En implementerende agent skal oppdatere status, funn og
> verifisering i dette dokumentet i samme commit som hver fase.

Opprettet: 2026-08-13  
Status: **Fase 4 teknisk fullført – all manuell test og QA er samlet i fase 6**
Primær målflate: iOS- og Android-appene  
Sekundær målflate: responsiv web og nettbrett

## 1. Mandat og ønsket resultat

Kaupet skal ha én gjenkjennelig måte å opprette en annonse på, uansett om
brukeren tilbyr noe eller etterspør noe. Flytene skal oppleves raske,
forutsigbare og trygge, tåle avbrudd og store tekststørrelser, og bruke
plattformkonvensjoner uten å se ut som to forskjellige produkter.

Målet er ikke identiske felt. En salgsannonse trenger bilder, tilstand,
levering og pris; et kjøpsønske trenger toleranser og søkekriterier. Det som
skal være felles, er inngang, skall, progresjon, navigasjon, validering,
lagring, oppsummering, publisering og suksess.

### Suksesskriterier

- Samme bruker forstår den andre flyten uten ny opplæring.
- Ingen utfylt informasjon går tapt ved appbytte, tilbakegest eller krasj.
- Hvert native steg har ett tydelig spørsmål og én primær viderehandling.
- Brukeren ser hva som er obligatorisk, hva som er valgfritt og hvorfor.
- Fremdrift og lagringsstatus er konsekvent og sannferdig.
- Publisering kan ikke skje utilsiktet, og ventetid har tydelig status.
- Flyten fungerer ved 200 % tekst, skjermleser og eksternt tastatur.
- Web bruker samme domenemodell og rekkefølge, men kan gruppere mer innhold.

## 2. Grunnlag og metode

Evalueringen er en heuristisk ekspertgjennomgang av nåværende kode, tilhørende
komponenter og E2E-tester. Følgende er kontrollert:

- `src/routes/_authenticated/ny-annonse.tsx`
- `src/routes/_authenticated/ny-ok-annonse.tsx`
- `src/features/listing-creation/**`
- `src/features/wtb/**`
- `src/components/category-picker.tsx`
- `src/components/ad-picker-options.tsx`
- `e2e/pages/listing-wizard.ts` og publiseringstestene
- `docs/UI-GUIDE.md` og eksisterende UX-planer

Det er ikke gjennomført moderert brukertest eller komplett enhetstest i denne
evalueringsfasen. Dette er derfor en sterk designhypotese som skal valideres
med instrumentering og fem korte brukertester før de mest irreversible
endringene låses.

### Eksterne designprinsipper

Planen bygger særlig på disse offisielle kildene:

- Apple anbefaler å hente eller forhåndsutfylle data når mulig, være tydelig
  på påkrevde data og først gjøre «Fortsett» tilgjengelig når nødvendige data
  er gitt: [Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data).
- Apple anbefaler enkle, korte modale oppgaver, tydelig vei ut og vern mot
  datatap. Komplekse flerstegsoppgaver kan bruke fullskjerm:
  [Modality](https://developer.apple.com/design/human-interface-guidelines/modality).
- Apple anbefaler konsistente, korrekte fremdriftsindikatorer og konkret
  status under arbeid:
  [Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators).
- Apple fremhever konsistente interaksjoner, støtte for større tekst og at
  mening ikke skal uttrykkes med farge alene:
  [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).
- Android krever minst 48 dp effektive trykkflater og en eksplisitt handling
  i tillegg til gester:
  [Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility).
- Android anbefaler tydelig gruppering og konsistent justering:
  [Layout basics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics).
- Material 3 brukes som komponentreferanse, ikke som en visuell kopi:
  [Text fields](https://m3.material.io/components/text-fields/guidelines) og
  [Progress indicators](https://m3.material.io/components/progress-indicators/guidelines).

## 3. Dagens opplevelse

### 3.1 Felles inngang

Native «+»-handling åpner et adaptivt panel med to gode, gjensidig
utelukkende valg: «Jeg selger eller gir bort noe» og «Jeg ønsker å kjøpe
noe». Ordlyden er handlingsorientert og hele raden er tappbar. Dette skal
beholdes.

### 3.2 Selge eller gi bort

Salgsflyten er en kategoriavhengig veiviser. Kategori velges først; deretter
beregnes sider fra `CategoryFlow`. Kjøretøy har registreringsoppslag og flere
egne sider. Flyten har autolagring, gjenoppretting, fast native bunnhandling,
felles `StepIndicator`, validering per side, forhåndsvisning, publiseringsstatus
og vern ved navigasjon.

### 3.3 Ønsker å kjøpe

Kjøpsønsket er en separat, fast trestegsveiviser: kategori, søkekriterier og
detaljer. Den har egen stegindikator, egen navigasjon, ingen autolagring,
ingen forhåndsvisning og ingen fast native bunnhandling. Kriterier vises som
en tett serie kort med avkryssing og kontroll. Etter publisering må brukeren
ta en separat beslutning om varsler.

## 4. Hovedfunn, prioritert

Prioritet: P0 blokkerer en trygg sammenhengende opplevelse, P1 gir stor
brukerverdi, P2 er optimalisering.

### P0 — To forskjellige produktkontrakter

Salgsflyten og kjøpsønsket bruker forskjellige skall, stegindikatorer,
footer-regler, tilbakeoppførsel, status og ferdigtilstand. Forskjellen er
større enn oppgavene krever. Brukeren må lære hvor handlinger finnes på nytt.

**Tiltak:** innfør et delt `ListingComposerShell` og en felles deklarativ
sidekontrakt. Skallet eier header, fremdrift, scroll-til-topp/fokus,
lagringsstatus, fast native footer og avslutningsvern. Innholdsmoduler forblir
domene-spesifikke.

### P0 — Kjøpsønsket kan gå tapt

Salgsflyten autolagrer; kjøpsønsket viser bare et varsel om at endringer vil
gå tapt. På mobil er avbrudd normalt, ikke et avvik. Dette undergraver tillit.

**Tiltak:** generaliser dagens utkastkontrakt til annonsetype, og autolagre
begge flyter lokalt og på konto. Avslutningsdialogen skal tilby «Lagre som
utkast», «Forkast» og «Fortsett å redigere» i begge.

### P0 — Native kjøpsflyt mangler stabil primærhandling

Handlingsraden ligger i dokumentflyten, mens salgsflyten har fast footer over
bunnavigasjonen. På lange kriteriesider må brukeren lete etter «Neste».

**Tiltak:** bruk samme faste footer med én fullbredde `h-14` primærknapp.
Tilbake håndteres i `NativePageHeader`; web viser tilbake i footer.

### P1 — Kriteriesiden gir høy kognitiv og motorisk belastning

Hvert kriterium krever at brukeren forstår både en aktiverings-checkbox og
selve feltet. Mange kort, rammer og kontroller vises samtidig. Det er uklart
om avkryssing eller utfylling er den egentlige handlingen.

**Tiltak:** erstatt kontrollmatrisen med en oversikt av hele, tappbare rader.
Hver rad viser etikett og nåværende verdi («Ingen begrensning» som standard).
Et trykk åpner riktig detaljflate; sletting/nullstilling er eksplisitt. Valgte
kriterier vises først. Dette følger mønsteret som allerede er definert for
native søk og filtre.

### P1 — Kategoriens optionalitet er feil innrammet

«Hopp over – jeg leter etter hva som helst» er teknisk mulig, men semantisk
svært bredt og svekker matching, auto-tittel og varselkvalitet. Handlingen får
dessuten høy visuell konkurranse med selve oppgaven.

**Tiltak:** gjør kategori forventet, men ikke absolutt blokkert. Vis «Usikker
på kategori?» som sekundærhandling som åpner en kort forklaring og valget
«Annet / usikker». Ikke lov «hva som helst» hvis matching i praksis blir svak.

### P1 — Inngangstekst og sidetitler skifter perspektiv

Inngangen bruker førsteperson («Jeg …»), rutene bruker «Ny annonse» og
«Ønskes kjøpt», mens siste knapp bruker «Publiser ønskes kjøpt». Den siste
formuleringen mangler substantiv og lyder som intern domeneterminologi.

**Tiltak:** bruk konsekvent oppgaveorientert bokmål:

| Flate          | Tilbyr                      | Etterspør                      |
| -------------- | --------------------------- | ------------------------------ |
| Inngang        | Selge eller gi bort         | Ønsker å kjøpe                 |
| Tittel         | Hva vil du selge?           | Hva vil du kjøpe?              |
| Primærhandling | Fortsett / Publiser annonse | Fortsett / Publiser kjøpsønske |
| Ferdig         | Annonsen er publisert       | Kjøpsønsket er publisert       |

### P1 — Ulik fremdrift og skiftende forventning

Salgsflyten bruker en lineær fremdriftslinje med navn; kjøpsflyten bruker
nummererte sirkler. Salgsflytens totale antall steg kan først vises etter
kategorivalg, og kategoriavhengige steg gjør eksakt prosent til en modell,
ikke faktisk tidsbruk.

**Tiltak:** bruk felles `StepIndicator` etter kategorivalg. Før kategorivalg
vises kun oppgavenavn. Behold «Steg X av Y» og kort sidetittel; ikke vis
klikkbare steg. Ved dynamisk innsetting skal visningssteg være stabile.

### P1 — Validering og feilplassering er inkonsistent

Salgsflyten bruker både inline-feil og toast. Ekstra feltfeil kan kun vises som
toast selv når årsaken er inne i siden. Kjøpsønsket har `react-hook-form`, men
mangler `mode: "onTouched"`. Deaktivert «Neste» kan mangle forklaring.

**Tiltak:** inline-feil ved feltet, feiloppsummering øverst ved flere feil,
fokus til første feil og `aria-describedby`. Toast reserveres for systemfeil.
En deaktivert knapp må ikke være eneste forklaring; vis hva som gjenstår.

### P1 — Ferdigtilstanden skaper en unødvendig ny beslutning

Varsling er tett knyttet til et kjøpsønske, men tilbys først etter publisering
som et nytt valg. Brukeren kan tro at selve kjøpsønsket allerede varsler.

**Tiltak:** legg «Varsle meg om treff» som en tydelig, forhåndsvalgt innstilling
i oppsummeringssteget, med forklaring og enkel av/på. Publiser annonse og
lagret søk i én idempotent orkestrering. Ved delvis feil beholdes publisert
køpsønske og brukeren kan prøve varsling igjen.

### P1 — Oppsummering er asymmetrisk

Salgsflyten viser en søkeliste-lignende forhåndsvisning. Kjøpsønsket går rett
fra felt til publisering. Det svekker kontroll og feiloppdagelse.

**Tiltak:** begge får et siste «Se over»-steg med kompakt, redigerbar
oppsummering. Hver seksjon har «Endre» som går til riktig steg og returnerer
til oppsummeringen. Full annonseforhåndsvisning kan fortsatt være sekundær i
salgsflyten; kjøpsønsket trenger ikke late som det har et bildebasert kort.

### P2 — Tillit uttrykkes for sent og generisk

Flyten forklarer lite om autolagring, publisering, bildebehandling og hva som
er synlig. Tillit skapes bedre med konkret status enn dekorativ «trygghet».

**Tiltak:** vis «Lagret»/«Lagrer …» på fast sted, forklar kort hvem som ser
telefon/sted ved relevante felt, og vis presis status under oppslag,
bildeopplasting og publisering. Unngå ekstra sikkerhetsmerker uten substans.

### P2 — Web kan utnytte plass bedre uten å bli en annen flyt

Web grupperer allerede flere felt per side, men kjøpsønsket gjør ikke bruk av
en felles sidestruktur. Store skjermer trenger bedre linjelengde og eventuell
oppsummering i sidekolonne, ikke bare bredere felt.

**Tiltak:** samme siderekkefølge og valideringsgrenser på alle plattformer.
På web kan relaterte grupper ligge på samme side, maks innholdsbredde beholdes,
og «Se over»-oppsummeringen kan bli en sticky sekundærkolonne fra 1024 px.

## 5. Foreslått målopplevelse

### 5.1 Felles sekvens

1. **Intensjon:** brukeren velger «Selge eller gi bort» eller «Ønsker å kjøpe».
2. **Hva:** kort fritekst og kategori, med kategoriforslag.
3. **Spesifiser:** kategoriavhengige fakta eller toleranser.
4. **Presenter:** bilder/tilstand/pris for salg; krav/makspris for kjøpsønske.
5. **Praktisk:** levering og sted for salg; rekkevidde og varsling ved behov
   for kjøpsønske.
6. **Se over:** redigerbar oppsummering, synlighet og publiseringsvalg.
7. **Ferdig:** bekreftelse med én anbefalt neste handling og én sekundær.

Kjøretøy kan fortsatt ha flere faktasider. De bruker samme skall og
språkmodell; registreringsoppslaget er en oppgave i «Spesifiser», ikke et
annet veivisersystem.

### 5.2 Native sidekontrakt

Hver side består av:

- `NativePageHeader`: tilbake/avbryt, kort oppgavetittel.
- Sticky statusområde: `StepIndicator` og lagringsstatus.
- Én scrollregion med én hovedoverskrift, eventuell én setning hjelp og
  relaterte kontroller.
- Fast footer over appnavigasjonen med én fullbredde primærhandling.
- Inline status/feil som ikke forsvinner på tid.

Tastaturet skal ikke dekke aktivt felt eller footer. Ved «Fortsett» valideres
siden, fokus flyttes til første feil eller neste sides overskrift, og scroll
starter på toppen. Android tilbake og iOS kantsveip går ett veivisersteg
tilbake før ruten forlates.

### 5.3 Visuell retning

- Rolig, lys bakgrunn; semantiske tokens og få overflater.
- Gruppering med luft og typografi før rammer. Maks ett visuelt kortnivå.
- 16 px sidepadding på telefon, 24 px på nettbrett, innhold maks 768 px.
- 24 px mellom hovedseksjoner, 8–12 px mellom relaterte felt.
- Minimum 48 × 48 px trykkflate, minimum 56 px for valgrader.
- Kun én fylt primærknapp per viewportseksjon.
- Diskré haptikk ved valg, stegskifte og ferdig publisering via eksisterende
  wrappers; aldri haptikk som eneste feedback.
- Bevegelse respekterer redusert bevegelse og brukes for årsak/virkning, ikke
  pynt.

## 6. Teknisk målarkitektur

Dette er en kontrollert konsolidering, ikke en total omskriving.

### Delte byggesteiner

1. `ListingComposerShell`
   - props: `title`, `pages`, `currentPage`, `saveStatus`, `onBack`,
     `onCancel`, `primaryAction`, `secondaryAction`, `busy`;
   - eier layout, fokus, scroll, safe area og plattformgren;
   - inneholder ingen salgs-, kjøretøy- eller WTB-logikk.
2. `ComposerPage`
   - semantisk overskrift, beskrivelse, feiloppsummering og innhold;
   - stabil `pageKey` brukes i analyse og E2E.
3. `useComposerNavigation`
   - bygger videre på `useListingSteps`;
   - historikk, retur til oppsummering og fokusgjenoppretting.
4. `useListingDraft`
   - generaliserer `useDraftAutosave` med `listingKind: "sell" | "want"`;
   - typebestemt serialisering, versjonering og migrering av lokale utkast.
5. `ComposerReview`
   - seksjoner med verdi, tomtilstand og «Endre»;
   - presentasjonen varierer, navigasjonskontrakten er felles.

Ikke flytt kjøretøylogikk inn i den generiske kjernen. Kategoriavhengighet
skal fortsatt uttrykkes gjennom `CategoryBehavior`, flow-registry og
domene-moduler.

## 7. Detaljert implementeringsplan

Hver fase skal være en atomisk commit. Oppdater status og logg nedenfor,
kjør relevante tester og legg skjermbilder/trace i PR-beskrivelsen ved UI-
endringer. Ikke start neste fase før akseptansekriteriene er oppfylt.

### Fase 0 — Baseline, instrumentering og brukertest

Status: **Tilstrekkelig fullført for fase 1**

1. Dokumenter skjermopptak av begge golden paths på iOS, Android og web.
2. Legg analysehendelser på inngang, side vist, valideringsfeil, tilbake,
   utkast gjenopprettet, oppsummering, publiseringsstart/-suksess/-feil.
3. Mål fullføringsgrad, tid per side, frafallsside og feil per felt; ikke logg
   fritekst eller personopplysninger.
4. Registrer avvik i «Funn under implementering». Modererte tester og
   enhets-QA gjennomføres samlet i fase 6.

Beslutningsport: instrumentering, lokal baseline og personverngjennomgang er
tilstrekkelig for den strukturelle fase 1. Reelle traktdata samles etter
deploy. Fem observasjonsnotater er påkrevd før fase 3, der innhold og
informasjonsarkitektur endres.

#### Målekontrakt

Fase 0 gjenbruker den eksisterende, førsteparts og ratebegrensede
`product_events`-kanalen. Det innføres ingen tredjepartsanalyse og ingen ny
migrasjon. `listing_creation_step_completed` brukes som en liten
handlingshendelse med følgende ikke-identifiserende egenskaper:

| Egenskap     | Verdier                                                                                                                        | Formål                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `kind`       | `sell`, `want`                                                                                                                 | Sammenligne intensjonene            |
| `action`     | `viewed`, `completed`, `back`, `validation_failed`, `validation_prompt`, `draft_restored`, `publish_started`, `publish_failed` | Bygge trakt og finne friksjon       |
| `step`       | Stabil intern steg-/gruppenøkkel                                                                                               | Finne frafallsside uten feltinnhold |
| `stepNumber` | Heltall                                                                                                                        | Rekkefølge og tidsbruk              |
| `reason`     | Kontrollert nøkkel, aldri feilmelding                                                                                          | Gruppere valideringsstopp           |

`listing_creation_started` og `listing_published` får samme `kind`. Salg kan i
tillegg sende antall bilder og kjøretøy-boolean ved vellykket publisering.
Kategori-ID/-navn, tittel, beskrivelse, søkeord, registreringsnummer, pris,
sted, bruker-ID og rå feilmeldinger skal aldri sendes.

Følgende baseline beregnes per `kind` og plattform når instrumentert versjon
har nok trafikk:

- start → publisert-konvertering per anonym sesjon;
- median og p75 aktiv tid fra start til publisering;
- siste viste steg i ikke-fullførte sesjoner;
- valideringsstopp per steg og kontrollert årsak;
- tilbakehandlinger per steg;
- andel som gjenoppretter utkast;
- publiseringsfeil per publiseringsforsøk.

Hendelser beholdes i 90 dager. Lavt volum skal rapporteres aggregert; ikke
forsøk å rekonstruere eller identifisere enkeltbrukere fra sesjonsforløp.

#### Lokal baseline 2026-08-13

Gjennomført med autorisert demokonto mot lokal utviklingsserver. Ingen annonse
ble publisert. Målingene nedenfor er layout-/DOM-observasjoner, ikke
produksjonsdata eller modererte brukertester.

| Flate                 | Viewport               | Observasjon                                                                                                                          |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Salg, kategori        | Native-emulert 375×812 | Fast «Fortsett» var synlig ved y=648, 56 px høy og 328 px bred. Ingen horisontal overflow.                                           |
| Kjøpsønske, kategori  | Native-emulert 375×812 | «Neste: Søkekriterier» lå ved y=1040 i en 812 px viewport og krevde scroll før noen utfylling. Knappen var 48 px høy og 189 px bred. |
| Salg, etter kategori  | Native-emulert 375×812 | Viste «Steg 2 av 4: Tittel» og konkret «Utkast lagret»-status. Primærhandlingen forble fast og fullbredde.                           |
| Kjøpsønske, kriterier | Native-emulert 375×812 | Viste nummerert lokal indikator, ingen lagringsstatus og dokumentflyt-footer. Autofokus landet korrekt i tittelfeltet.               |
| Salg, kategori        | Web 1280×720           | «Neste» lå ved y=924; scrolling er nødvendig på kort desktop-viewport.                                                               |
| Kjøpsønske, kategori  | Web 1280×720           | «Neste» lå ved y=843; scrolling er nødvendig på kort desktop-viewport.                                                               |

Baseline bekrefter dermed P0-funnet om ustabil native primærhandling med
målbar evidens. Den viser også at begge webflytene forventer dokumentscroll,
som er akseptabelt, men bør vurderes sammen med en senere sticky
oppsummering/handling på korte skjermer.

### Fase 1 — Felles skall uten innholdsendring

Status: **Teknisk fullført – QA flyttet til fase 6**

1. Ekstraher `ListingComposerShell`, `ComposerPage` og felles footer fra
   salgsruten.
2. Migrer salgsflyten uten å endre rekkefølge eller validering.
3. Migrer kjøpsønsket til samme header, `StepIndicator`, sticky status og
   native footer.
4. Behold separate skjemaer og mutasjoner i denne fasen.
5. Erstatt håndrullet `window.history` med én delt navigasjonskontrakt som
   dokumenterer samspill med `useBlocker`.
6. Legg stabile `data-testid="composer-page-<key>"` kun der rolle/etikett ikke
   er stabil nok.

Akseptanse: dagens golden paths gir samme data som før; fysisk tilbake går
ett steg; footer respekterer safe area og tastatur; ingen horisontal overflow
ved 320 px eller 200 % tekst.

### Fase 2 — Utkast og datatapsvern for begge typer

Status: **Teknisk fullført – QA flyttet til fase 6**

1. Legg annonsetype og skjemaversjon til utkastkontrakten.
2. Del en versjonert utkastkontrakt; behold separate hooks fordi salg har en
   egen bilde-store og flytene ellers har ulike domenedata.
3. Autolagre kjøpsønske med debounce og eksplisitt `saving/saved/error`.
4. Implementer gjenoppretting, forkasting og konfliktregel mellom lokal og
   serverversjon (nyeste gyldige versjon vinner, men aldri automatisk overskriv
   et nyere lokalt utkast).
5. Gjør avslutningsdialogene like og forklar hva som skjer.

Akseptanse: begge flyter gjenopprettes etter hard reload og appdrept prosess;
feil ved serverlagring sletter ikke lokalt utkast; publisering rydder riktig
utkast og aldri den andre annonsetypen.

### Fase 3 — Ny informasjonsarkitektur og språk

Status: **Teknisk fullført – QA flyttet til fase 6**

1. Innfør felles sidemetadata med oppgaveorienterte titler og hjelpetekster.
2. Endre kjøpsønskets kriterier til oversiktsrader + detaljflater på telefon.
3. Gjenbruk native valgkontrakt fra søkefiltrene; unngå lokal sheet-variant.
4. Plasser valgte kriterier først og bruk «Ingen begrensning» eksplisitt.
5. Revider kategoristeget: tittel/fritekst gir forslag, kategori forventes,
   og «usikker» er en rolig sekundærvei.
6. Samordne bokmål etter tabellen i punkt 4.
7. Behold webkontroller der de er effektive, men med samme domenetilstand og
   rekkefølge.

Akseptanse: ingen kriterium krever både checkbox og felt for samme intensjon;
hele valgraden er tappbar; valgte verdier overlever søk og lukking; alle
handlinger kan utføres uten gest.

### Fase 4 — Felles «Se over», varsling og publisering

Status: **Teknisk fullført – QA flyttet til fase 6**

1. Legg til `ComposerReview` i begge flyter.
2. Hver seksjon viser forståelig verdi og «Endre» med retur til review.
3. Flytt varslingsvalg for kjøpsønske inn i review og gjør konsekvensen klar.
4. Lagre varslingsvalget atomisk med kjøpsønsket og bruk WTB-motorens
   idempotente varsler. Ikke opprett et parallelt lagret søk.
5. Standardiser pending/success/error og haptikk.
6. Ferdigflaten har én anbefalt handling: «Se annonsen»/«Se kjøpsønsket»;
   «Mine annonser» er sekundær. Ikke send brukeren til generisk annonseoversikt
   som primærhandling.

Akseptanse: bruker kan endre hver seksjon uten datatap; dobbelttrykk gir ikke
duplikat; skjermleser annonserer publiseringsstatus; varslingspreferansen
lagres atomisk med kjøpsønsket og gir høyst ett varsel per treff.

### Fase 5 — Validering, tilgjengelighet og robusthet

Status: **Ikke startet**

1. Sett begge skjemaer til `mode: "onTouched"` og felles feilkontrakt.
2. Flytt domenevalidering fra toast til felt eller feiloppsummering; behold
   toast for nettverk/system.
3. Fokus første feil og annonser feiloppsummering med `role="alert"`.
4. Kontroller semantiske overskrifter, etiketter, `aria-describedby`,
   leserekkefølge og at dekorative ikoner er skjult.
5. Sikre støtte for redusert bevegelse, høy kontrast, lys/mørk modus og
   plattformenes tilgjengelighetsinnstillinger. Verifikasjon skjer i fase 6.

Akseptanse: WCAG 2.2 AA for webrelevante krav; ingen avkortet eneste verdi;
alle trykkflater minst 48 px; ingen oppgave avhenger av farge, hover eller
gest alene.

### Fase 6 — Samlet test, QA, utrulling og læringssløyfe

Status: **Ikke startet**

1. Utvid page object til begge annonsetyper og delte composer-handlinger.
2. Test golden path, utkast, tilbake, valideringsfeil, kategoribytte,
   publisering uten nett og retry.
3. Legg visual-regression-snapshots for 375×812, 844×390, 820×1180 og web.
4. Kjør hele testmatrisen i punkt 8, inkludert VoiceOver, TalkBack, Switch
   Access, eksternt tastatur, 200 % tekst, Reduce Motion, høy kontrast,
   lys/mørk modus, tastatur, rotasjon, safe area, suspend/resume og offline.
5. Gjennomfør fem oppgavebaserte brukertester: minst to iOS, to Android og én
   med stor tekst/skjermleser; la samme person prøve begge intensjoner.
6. Dokumenter skjermopptak av begge golden paths på iOS, Android og web, og
   registrer alle avvik i fasejournalen før utrulling.
7. Rull ut bak feature flag til intern/staging, deretter 10/50/100 % dersom
   datamodellen tillater det.
8. Sammenlign baseline etter minst én uke eller tilstrekkelig volum.
9. Fjern gamle skall og flagg først når rollback-vinduet er passert.

Akseptanse: ingen regresjon i fullføring; lavere frafall eller kortere aktiv
tid; feilrate og publiseringsduplikater ikke økt; supportfunn er gjennomgått.

## 8. Testmatrise

| Område                     | iOS                                 | Android                              | Web                    |
| -------------------------- | ----------------------------------- | ------------------------------------ | ---------------------- |
| Telefon, normal/stor tekst | VoiceOver, Dynamic Type, kantsveip  | TalkBack, font scale, system-tilbake | 320/375 px, 200 % zoom |
| Nettbrett                  | portrett/landskap, tastatur         | portrett/landskap, tastatur          | 768/1024/1440 px       |
| Livssyklus                 | suspend, kill, resume               | bakgrunn, kill, resume               | reload, flere faner    |
| Nettverk                   | offline under lagring/publish       | offline under lagring/publish        | throttling og retry    |
| Data                       | generisk, kjøretøy, kategoriendring | samme                                | samme                  |
| Intensjon                  | salg/gratis/kjøpsønske              | samme                                | samme                  |

Relevante automatiske kontroller per fase: `bun run lint`,
`bunx tsc --noEmit`, `bun run test`, målrettede Playwright-tester og ved
databaseregelendringer `bun run test:rls` med lokal Supabase.

## 9. Beslutninger og avgrensninger

- **Besluttet:** én composer-kontrakt, separate domeneinnhold.
- **Besluttet:** native full rute, ikke en veiviser inni et sheet.
- **Besluttet:** kategori først/veldig tidlig, med fritekstassistanse.
- **Besluttet:** autolagring for begge annonsetyper.
- **Besluttet:** review før publisering, men full visuell preview er sekundær.
- **Ikke besluttet:** om «Varsle meg» juridisk/produktmessig kan være
  forhåndsvalgt. Bekreft med produkt/personvern før fase 4.
- **Ikke i planen:** redesign av annonsevisning, søketreff eller Mine annonser,
  utover nødvendige lenker og ferdigtilstander.
- **Ikke i planen:** endring av merkevare, logo eller global fargepalett.

## 10. Funn under implementering

Denne delen skal aldri slettes eller «ryddes» ved ferdigstilling. Legg én rad
per nytt funn, også når funnet løses i samme fase.

| Dato       | Fase       | Flate          | Funn / evidens                                                            | Beslutning                                                           | Status / lenke    |
| ---------- | ---------- | -------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------- |
| 2026-08-13 | Evaluering | Begge          | Skall, fremdrift, utkast og ferdigtilstand er ulike                       | Konsolider struktur, behold domeneinnhold                            | Planlagt          |
| 2026-08-13 | Evaluering | Kjøpsønske     | Ingen autolagring; navigasjon kan gi datatap                              | Inkludert i fase 2                                                   | Planlagt          |
| 2026-08-13 | Evaluering | Kjøpsønske     | Kriterier bruker checkbox + felt i mange kort                             | Oversiktsrad + detaljflate i fase 3                                  | Planlagt          |
| 2026-08-13 | Evaluering | Test           | E2E dekker salg, ikke kjøpsønske                                          | Inkludert i fase 6                                                   | Planlagt          |
| 2026-08-13 | Fase 0     | Analyse        | Personvernvennlig kanal og eventnavn finnes allerede                      | Gjenbruk kanalen; ingen migrasjon/tredjepart                         | Implementert      |
| 2026-08-13 | Fase 0     | Baseline       | Autentiserte lokalruter krevde testinnlogging                             | Bruk autorisert demokonto kun lokalt                                 | Løst              |
| 2026-08-13 | Fase 0     | Kjøpsønske     | Flyten hadde ingen traktmåling                                            | Bruk samme målevokabular som salg                                    | Implementert      |
| 2026-08-13 | Fase 0     | Native-web     | `?forcenative` ga ubehandlet «Keyboard plugin is not implemented on web»  | Skill ut layout-emulering fra native plugin-kall                     | Åpen              |
| 2026-08-13 | Fase 0     | Kjøpsønske     | Native «Neste» lå 228 px under første viewport                            | Fast felles native footer i fase 1                                   | Målt lokalt       |
| 2026-08-13 | Fase 0     | Salg           | Fast handling, fremdrift og lagringsstatus fungerte i 375×812             | Bruk salgsflyten som strukturell baseline                            | Målt lokalt       |
| 2026-08-13 | Fase 0     | Server         | TanStack Start advarte om manglende CSRF-middleware for serverfunksjoner  | Egen sikkerhetsoppgave; ikke blandes inn i UX-fasen                  | Åpen              |
| 2026-08-13 | Fase 1     | Begge          | Samme skall kunne gjenbrukes uten å samle domeneskjemaene                 | Del kun chrome, fremdrift og footer                                  | Implementert      |
| 2026-08-13 | Fase 1     | Kjøpsønske     | Fast footer flyttet «Fortsett» fra y=1040 til y=648 i 375×812             | Behold felles native footer                                          | Verifisert lokalt |
| 2026-08-13 | Fase 1     | Native-web     | Layoutflagget ble tolket som ekte Capacitor-runtime                       | Gate plugin på `nativePlatform()`                                    | Løst              |
| 2026-08-13 | Fase 1     | Navigasjon     | Salg hadde lokal historikkvakt; kjøpsønske manglet stegvakt               | Delt `useComposerHistoryBack` med regresjonstester                   | Implementert      |
| 2026-08-13 | Fase 1     | A11y/Test      | Steg manglet felles fokusmål og stabil composer-sideidentitet             | Fokusoverskrift + `composer-page-<key>`                              | Implementert      |
| 2026-08-13 | Fase 2     | Kjøpsønske     | Datamodellen manglet en privat utkaststatus                               | Utvid WTB-status med `draft`; eksisterende RLS skjuler den for andre | Implementert      |
| 2026-08-13 | Fase 2     | Utkast         | Samlet hook ville koblet salgets bilde-store til WTB uten reell gevinst   | Del kontrakt/type/versjon, behold små domenehooks                    | Implementert      |
| 2026-08-13 | Fase 2     | Konflikt       | Lokal nyere kopi kunne ellers opprette enda et serverutkast               | Behold server-ID, men la nyeste gyldige innhold vinne                | Implementert      |
| 2026-08-13 | Fase 2     | Forkasting     | Lokal sletting alene ville hentet serverutkastet tilbake ved neste besøk  | Slett både lokal og eid serverrad med `draft`-vakt                   | Implementert      |
| 2026-08-13 | Fase 2     | Mine annonser  | Eierens WTB-spørring inkluderer private utkast                            | Vis tydelig «Utkast» og åpne composer via «Fortsett»                 | Implementert      |
| 2026-08-13 | Fase 2     | RLS            | Eksisterende WTB-test beviste ikke privat behandling av `draft`           | Dekk eier, annen bruker, anonym, aktivering og sletting              | Implementert      |
| 2026-08-13 | Fase 2     | Flere enheter  | Flere serverutkast kunne gitt en «Fortsett»-rad som åpnet et annet utkast | Vis kun sist oppdaterte WTB-utkast; behold publiserte rader          | Implementert      |
| 2026-08-13 | Fase 3     | Kriterier      | Checkbox + felt krevde to handlinger og skapte tomme «aktive» kriterier   | Verdi aktiverer kriteriet; tomt betyr «Ingen begrensning»            | Implementert      |
| 2026-08-13 | Fase 3     | Native         | Alle kriteriefelt samtidig ga lange kortstabler og høy skannebelastning   | Oversiktsrader, valgte først og fokusert `NativeSheet`               | Implementert      |
| 2026-08-13 | Fase 3     | Web            | Web har plass og nytte av direkte feltredigering                          | Behold inline-kontroller med samme state og språk                    | Implementert      |
| 2026-08-13 | Fase 3     | Kategori       | Tittel kom etter kategori og kunne ikke hjelpe kategorivalget             | Kort beskrivelse først, kategori-forslag og rolig «usikker»-vei      | Implementert      |
| 2026-08-13 | Fase 3     | Redigering     | Publiserte WTB-annonser brukte fortsatt gammel inline kriteriekontrakt    | Bruk samme native oversikt/detaljflate i opprettelse og redigering   | Implementert      |
| 2026-08-13 | Fase 3     | Salg           | Salgsflyten har allerede kategoriavhengige titler i flow-registryen       | Behold registry som metadatakilde; ikke lag parallell stegmodell     | Implementert      |
| 2026-08-13 | Fase 4     | Begge          | Salg hadde preview, men ingen felles seksjonsvis review-kontrakt          | Delt `ComposerReview` med forståelige verdier og «Endre»             | Implementert      |
| 2026-08-13 | Fase 4     | Kjøpsønske     | Varsling ble først tilbudt etter at annonsen var publisert                | Flytt valget til review og lagre det med kjøpsønsket                 | Implementert      |
| 2026-08-13 | Fase 4     | Varslingskilde | WTB-motor og lagret søk kunne varsle om samme nye annonse                 | Bruk bare attributtbevisst WTB-motor                                 | Implementert      |
| 2026-08-13 | Fase 4     | Kriterieformat | Lagrede søk forventer slug, mens gammel WTB-flyt sendte kategori-ID       | Fjern parallelt søk; WTB-motor sammenligner kategori-ID korrekt      | Implementert      |
| 2026-08-13 | Fase 4     | Idempotens     | Varslingsretry via lagret søk kunne opprette duplikater                   | Atomisk `notify_matches` og eksisterende unik varselkonflikt         | Implementert      |
| 2026-08-13 | Fase 4     | Ferdigflate    | Kjøpsønske sendte primært til generisk annonseoversikt                    | «Se kjøpsønsket» primær; «Mine annonser» sekundær                    | Implementert      |
| 2026-08-13 | Fase 4     | Samtykke       | Forhåndsvalgt varsling er ikke juridisk avklart                           | Varsling er av som standard frem til produkt/juridisk beslutning     | Implementert      |

## 11. Gap og anbefalte videre tiltak

Før opp arbeid som oppdages, men som ikke bør snikes inn i aktiv fase.

| Gap / tiltak                                                         | Hvorfor utenfor                         | Anbefalt eier/tidspunkt         | Status |
| -------------------------------------------------------------------- | --------------------------------------- | ------------------------------- | ------ |
| Modererte brukertester med faktiske markedsplassbrukere              | Krever rekruttering                     | Samlet QA i fase 6              | Åpen   |
| Juridisk vurdering av forhåndsvalgt varsling                         | Samtykke/personvern                     | Produkt/juridisk før fase 4     | Åpen   |
| Samlet informasjonsarkitektur for «Mine annonser» etter publisering  | Egen flate                              | UX etter fase 4                 | Åpen   |
| Android-enhetstest av system-tilbake og tastatur                     | Kan ikke bevises ved kodegjennomgang    | Samlet QA i fase 6              | Åpen   |
| Analyse av bilderåd og bildegjenkjenning                             | Krever produkt/ML-scope                 | Egen discovery                  | Åpen   |
| Gjør `?forcenative` trygg for Keyboard-pluginen i web                | Separat feil i native emuleringsverktøy | Plattform før fase 1-visuell QA | Løst   |
| Avklar og implementer CSRF-beskyttelse for TanStack-serverfunksjoner | Sikkerhetsarkitektur utenfor annonse-UX | Plattform/sikkerhet snarest     | Åpen   |

## 12. Fasejournal

Kopier denne malen ved avslutning av hver fase:

```md
### Fase N — YYYY-MM-DD

- Status: Fullført / Delvis / Blokkert
- Endret:
- Nye funn:
- Avvik fra plan og begrunnelse:
- Kontroller kjørt:
- Manuelt verifisert på:
- Ikke verifisert / risiko:
- Commit/PR:
```

### Fase 0 — 2026-08-13

- Status: Tilstrekkelig fullført for fase 1
- Endret: La til personvernvennlige traktmålepunkter i begge eksisterende
  annonseflyter og dokumenterte målekontrakten.
- Nye funn: Analyseinfrastrukturen og database-allowlisten dekket allerede
  behovet. Kjøpsønsket hadde ingen instrumentering; salg målte bare start og
  vellykket publisering. `?forcenative` utløste dessuten et ubehandlet
  Keyboard-plugin-kall i vanlig nettleser. Lokal server logget også TanStack
  Starts advarsel om manglende CSRF-middleware for serverfunksjoner.
- Avvik fra plan og begrunnelse: Ingen ny eventtype eller migrasjon; den
  eksisterende `listing_creation_step_completed` dekker handlingene med
  kontrollerte egenskaper og gir mindre kode og lavere personvernrisiko.
- Kontroller kjørt: Prettier, TypeScript, målrettet ESLint og 15 målrettede
  Vitest-tester.
- Manuelt verifisert på: Lokal utviklingsserver med autorisert demokonto,
  native-emulert 375×812 og web 1280×720. Begge kategori-/startflater og
  påfølgende generiske innholdssteg ble inspisert; ingen annonse ble publisert.
- Ikke verifisert / risiko: Skjermopptak av golden paths, reelle baseline-tall,
  full gjennomføring av alle steg, iOS/Android-enhetstest og fem brukertester
  gjenstår. Utkastgjenoppretting kan foreløpig bare måles for salg fordi
  kjøpsønsket ennå ikke har utkast.
- Commit/PR: Ikke opprettet.

### Fase 1 — 2026-08-13

- Status: Teknisk fullført; fysisk enhets-QA gjenstår
- Endret: Innførte et generisk `ListingComposerShell`, delte
  `ComposerStepIndicator`, og migrerte både salgs- og kjøpsønskeflyten til
  samme header, sticky fremdrift og adaptiv footer. Rettet `?forcenative` slik
  at Capacitor Keyboard bare kobles til i faktisk native runtime.
- Nye funn: Skallet kan deles uten at skjemaer, feltgrupper, validering eller
  mutasjoner må slås sammen. Kjøpsønskets primærhandling er nå identisk
  plassert med salgsflyten.
- Avvik fra plan og begrunnelse: Sidens indeks/clamping beholdes i de
  eksisterende route-hookene fordi flytene har ulike state-modeller. Den
  plattformkritiske historikkdelen er konsolidert i
  `useComposerHistoryBack`. Dette gir faktisk gjenbruk uten en spekulativ
  navigasjonsabstraksjon.
- Kontroller kjørt: Prettier, TypeScript, målrettet ESLint, full Vitest-suite
  (302 tester, inkludert to nye historikkregresjoner) og `git diff --check`.
- Manuelt verifisert på: Lokal 375×812 med autorisert demokonto. Begge
  startflater har fast 328×56 px «Fortsett» ved y=648, ingen horisontal
  overflow, felles progresjonslinje og ingen Keyboard-plugin-feil.
- Ikke verifisert / risiko: 200 % tekst, nettbrett, full golden path og fysisk
  iOS/Android tilbakegest/system-tilbake gjenstår som QA. Ingen ytterligere
  teknisk implementering er kjent nødvendig i fase 1.
- Commit/PR: Ikke opprettet.

### Fase 2 — 2026-08-13

- Status: Teknisk fullført; samlet manuell QA gjenstår i fase 6
- Endret: Versjonerte salgsutkast med eksplisitt type og innførte lokal og
  konto-basert autolagring, gjenoppretting, forkasting og lagringsstatus for
  kjøpsønsker. Publisering aktiverer samme private serverutkast atomisk. «Mine
  annonser» viser siste private WTB-utkast med en trygg «Fortsett»-handling.
- Nye funn: WTB-tabellen hadde allerede passende eier-RLS, men statusreglen
  manglet `draft`. Nyeste-kopi-regelen må bevare server-ID selv når lokalt
  innhold vinner, ellers kan en konflikt skape duplikatutkast.
- Avvik fra plan og begrunnelse: Utkasthookene ble ikke slått sammen. De deler
  kontrakten `draft_kind`/`draft_version`, mens salgets separate bilde-store og
  ulike domenefelt gjør én generisk hook større og mer risikabel uten å fjerne
  meningsfull duplisering.
- Kontroller kjørt: Prettier, TypeScript, målrettet ESLint, fire målrettede
  Vitest-regresjoner og `git diff --check`. WTB-RLS-suiten er utvidet med eier,
  annen bruker, anonym, aktivering og sletting; lokal kjøring krever Supabase.
- Manuelt verifisert på: Flyttet til samlet fase 6 etter produktbeslutning.
- Ikke verifisert / risiko: Lokal Supabase-stack kjører ikke, så de nye
  RLS-scenarioene er ikke kjørt lokalt. Offline/suspend/kill/reload og fysisk
  iOS/Android inngår i fase 6. Migrasjonen er bekreftet anvendt på staging.
- Commit/PR: `add3fc9`, `099b017`; etterkontrollen er ikke committet.

### Fase 3 — 2026-08-13

- Status: Teknisk fullført; samlet manuell QA gjenstår i fase 6
- Endret: Flyttet kort beskrivelse foran kategorivalget, la til eksplisitt
  kategoriforslag og en rolig «usikker»-vei. Erstattet checkbox + felt med
  verdidrevet kriterietilstand. Native bruker oversiktsrader, valgte først og
  fokusert `NativeSheet`; web beholder inline-kontroller. Samme kontrakt brukes
  når et publisert kjøpsønske redigeres.
- Nye funn: Salgsflytens flow-registry er allerede riktig kilde for dynamiske
  sidetitler. En ny felles metadataabstraksjon ville duplisert denne uten å
  gjøre kjøpsønsket enklere.
- Avvik fra plan og begrunnelse: Det eksisterende `NativeSheet`-mønsteret fra
  søkefiltrene ble gjenbrukt direkte. Kriteriefeltene deles fortsatt med web,
  mens bare presentasjonen varierer per plattform.
- Kontroller kjørt: Prettier, TypeScript, målrettet ESLint og fire målrettede
  Vitest-tester for kriteriepresentasjon og utkast, samt `git diff --check`.
- Manuelt verifisert på: Flyttet til samlet fase 6 etter produktbeslutning.
- Ikke verifisert / risiko: Visuelt hierarki, sheet-høyde, skjermleserfokus,
  lange kategorinavn og fysisk iOS/Android inngår i fase 6.
- Commit/PR: Ikke opprettet.

### Fase 4 — 2026-08-13

- Status: Teknisk fullført; samlet manuell QA gjenstår i fase 6
- Endret: La til delt `ComposerReview` i begge opprettelsesflyter med
  seksjonsverdier og «Endre». Kjøpsønsket har et eget review-steg med
  varslingsvalg. Ferdigflaten prioriterer «Se kjøpsønsket», og salgsflyten
  beholder «Se annonsen» som primærhandling.
- Nye funn: WTB-motoren oppretter allerede dedupliserte varsler og matcher
  strukturerte attributter. Et ekstra lagret søk ville både brukt feil
  kategori-format og kunne gitt dobbeltvarsel.
- Avvik fra plan og begrunnelse: Den planlagte orkestreringen mot
  `saved_searches` ble fjernet før deploy. `notify_matches` lagres atomisk på
  kjøpsønsket og filtreres i WTB-motoren. Varsling er av som standard fordi
  forhåndsvalg ikke er juridisk avklart.
- Kontroller kjørt: Prettier, full ESLint, TypeScript, full Vitest-suite (307
  tester, inkludert ny review-regresjon) og `git diff --check`. RLS-suiten har
  et nytt scenario for inn-/utmeldt WTB-varsling, men krever lokal Supabase.
- Manuelt verifisert på: Flyttet til samlet fase 6 etter produktbeslutning.
- Ikke verifisert / risiko: Ny migrasjon er ikke anvendt lokalt eller staging.
  Varslingspreferansen og skjermleserannonsering inngår i fase 6.
- Commit/PR: Ikke opprettet.
