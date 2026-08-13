# Native handlingspaneler: analyse av «Ny annonse» og «Meldinger»

> Analyse- og beslutningsgrunnlag for popup-panelene som åpnes fra native
> bunnavigasjon. Dokumentet følger prinsippene fra
> `NATIVE-SEARCH-FILTER-REDESIGN-PLAN.md`, men avgrenser seg til de to panelene
> og foreslår ingen implementasjon i denne fasen.

Opprettet: 2026-08-13

Status: **Analyse ferdig – avventer produkt/UX-beslutning**

## 1. Mål

Panelene skal gi rask tilgang til henholdsvis opprettelse av annonse og nylige
samtaler, uten å oppføre seg som små nettside-popovere inne i native-appen.
Analysen vurderer informasjonsarkitektur, trykkflater, adaptiv presentasjon,
tilgjengelighet, loading/feil/tomtilstand og grensen mellom panel og full rute.

### Ikke-mål

- Ingen redesign av selve annonse-wizarden eller samtalevisningen.
- Ingen endring av database, realtime, rutekontrakter eller ulest-logikk.
- Ingen tredje overlay-primitiv. Eksisterende `ResponsiveOverlay` og
  `NativeSheet` skal gjenbrukes.
- Ingen implementasjon før ønsket omfang og ordlyd er godkjent.

## 2. Dagens løsning

| Panel      | Telefon                                  | Nettbrett                         | Web             | Innhold                                        |
| ---------- | ---------------------------------------- | --------------------------------- | --------------- | ---------------------------------------------- |
| Ny annonse | `ResponsiveOverlay` som bunn-sheet       | Sentrert dialog                   | Sentrert dialog | To valg: selge/gi bort eller ønskes kjøpt      |
| Meldinger  | `NativeSheet`, 60 % detent og full høyde | Sentrert dialog via `NativeSheet` | Ankret popover  | Opptil åtte samtaler og lenke til full innboks |

Felles infrastruktur er allerede på plass: overlay-historikk håndterer Android-
tilbake og iOS-kantsveip, bunn-sheets har Vaul-gester og safe area, og
formatfaktor skiller telefon fra nettbrett. Dette bør videreutvikles, ikke
dupliseres lokalt.

### Sentrale filer

- `src/components/app-bottom-nav.tsx` – åpning og tilstand for «Ny annonse»
- `src/components/ad-picker-options.tsx` – de to annonsevalgene
- `src/components/messages-button.tsx` – trigger, datainnhenting og innhold i
  meldingspanelet
- `src/components/ui/responsive-overlay.tsx` – sheet på telefon, dialog ellers
- `src/components/ui/native-sheet.tsx` – delt panelkontrakt
- `src/components/ui/sheet.tsx` – detents, gester, lukking og safe area
- `src/routes/_authenticated/meldinger.index.tsx` – full innboks
- `src/routes/_authenticated/meldinger.$id.tsx` – full samtale

## 3. Hovedkonklusjon

Behold begge panelene, men ikke gjør dem likere enn oppgaven krever:

- **Ny annonse** er allerede riktig avgrenset. Det trenger primært visuell og
  tilgjengelighetsmessig polering, ikke ny navigasjon eller flere steg.
- **Meldinger** bør fortsatt være en forhåndsvisning, ikke en komplett innboks
  i et sheet. Forbedringen bør konsentreres om lesbarhet, tilstander og en
  tydelig fullbreddehandling til «Alle meldinger».
- **Tekst og luft bør forstørres målrettet i Meldinger-panelet.** «Ny annonse»
  er allerede nær ønsket komfortnivå og trenger ikke en generell oppskalering.
- Del kun primitive egenskaper som faktisk er felles: 48 px trykkflater,
  adaptiv overlay, safe area, historikk og standardiserte tilstander.

## 4. Analyse: «Ny annonse»

### Det som fungerer

- To gjensidig utelukkende valg er riktig mengde innhold for et kort sheet.
- Hele valgraden er tappbar og har romslig padding og et tydelig ikon.
- Valg lukker panelet før ruten åpnes.
- Telefon får sheet, mens nettbrett/web får en begrenset dialog.
- FAB-en er 64 × 64 px og har tydelig åpen/lukket tilstand.

### Funn og risiko

1. Tittelen beskriver inngangen, men ikke valget brukeren skal ta. «Hva vil du
   annonsere?» eller «Velg annonsetype» gir bedre beslutningsstøtte.
2. «Jeg ønsker å kjøpe noe» leder til en egen ønskes-kjøpt-flyt, men teksten
   «Legg ut en ønskes kjøpt-annonse» har svak grammatikk. Anbefalt bokmål er
   «Legg ut en ønskes kjøpt-annonse» bare dersom produktnavnet bevisst er
   «ønskes kjøpt»; ellers «Legg ut en annonse om noe du vil kjøpe».
3. Valgene uttrykker ikke `aria-describedby` eller annen programmatisk kobling
   mellom hovedtekst og forklaring. Knappens samlede tekst leses vanligvis opp,
   men eksplisitt struktur er mer robust ved senere markup-endringer.
4. Panelet har ingen test som låser adaptiv presentasjon, rutemål, tastaturfokus
   eller tilbake-lukking på dette kallstedet.
5. Panelet trenger ikke `expandable`; innholdet er kort og bør ikke få flere
   detents eller intern navigasjon.

### Vurdering av tekststørrelse og luft

Dagens valg bruker 16 px hovedtekst, 14 px hjelpetekst, 20 px innvendig padding,
16 px avstand mellom ikon og tekst og 12 px mellom knappene. Dette er allerede
et komfortabelt native nivå. En generell forstørrelse vil gjøre det korte
panelet unødvendig høyt og gir liten ekstra nytte.

Anbefaling:

- behold 16 px hovedtekst og 14 px hjelpetekst som utgangspunkt;
- behold minst 16 px avstand mellom ikon og tekst;
- bruk 12–16 px mellom valgradene; dagens 12 px er akseptabelt, 16 px kan
  velges dersom visuell baseline viser at kortene oppleves som sammenpresset;
- la teksten bryte og raden vokse ved tekstskalering, fremfor å øke
  standardstørrelsen for alle;
- tittelen kan være 18–20 px gjennom eksisterende `DialogTitle`; den trenger
  ikke en ny panelspesifikk variant.

### Anbefalt designkontrakt

- Behold ett kort nivå med nøyaktig to fullbreddsrader.
- Bruk synlig tittel og eventuelt én kort introduksjon, ikke onboardingtekst.
- Hver rad skal være minst 56 px høy, kunne vokse ved 200 % tekst og ha tydelig
  trykket-, fokus- og valgt respons.
- Lukkeknapp, bakgrunnstrykk, Escape, Android-tilbake og iOS-kantsveip skal
  lukke uten ruteendring.
- Etter valg skal riktig rute åpnes én gang og fokus håndteres av rutemålet.
- Ikke legg kategori, bilder eller andre wizardsteg inn i panelet.

## 5. Analyse: «Meldinger»

### Det som fungerer

- Panelet gir rask tilgang til nylige samtaler og viser ulest-status,
  motpart, annonse, siste melding og relativ tid.
- Ulest-tallet deles med desktop-headeren gjennom eksisterende hook.
- Realtime-innsetting og fokus/visibility oppdaterer forhåndsvisningen.
- 60 % detent gir et raskt overblikk og kan utvides til full høyde.
- Valg av samtale lukker panelet før full samtalerute åpnes.

### Funn og risiko

1. **Loading og feil er usynlige.** Før første svar ser brukeren samme tomtilstand
   som ved null samtaler. Query-feil ender også som «Ingen meldinger ennå».
2. **Den primære viderehandlingen er for liten.** «Se alle meldinger» bruker
   `text-xs` og `py-2`, under native-kontrakten på minst 48 px trykkflate.
3. **Radhøyden er indirekte.** Samtaleraden har `py-2.5`, men ingen eksplisitt
   minimumshøyde. Korte/uvanlige data og tekstskalering bør ikke avgjøre om
   trykkflaten når 48–56 px.
4. **Tett typografi og avkorting.** To linjer på `text-sm`/`text-xs`, relativ tid
   og ulest-prikk konkurrerer på smale telefoner. `line-clamp-1` kan skjule den
   eneste nyttige meldingskonteksten ved stor tekst.
5. **Svakt semantisk headerhierarki.** `NativeSheet` får en skjult tittel, mens
   den synlige «Meldinger» er en `span`. Den synlige tittelen bør være samme
   dialogtittel eller et reelt overskriftselement uten dobbel annonsering.
6. **Ingen eksplisitt oppdateringstilstand.** Ved refetch finnes ingen diskret
   status som forteller at listen oppdateres, og tidligere innhold bør beholdes.
7. **Ingen panelspesifikke tester.** Det mangler dekning for loading, feil, tom
   liste, ulest markering, 8-radersgrense, «Se alle», lukking og native/web-
   grenene.
8. **Datakallet har en kostbar fallback.** FK-join prøves først og ved feil
   gjentas samtalespørringen før profiler hentes separat. Dette er ikke et
   paneldesignproblem og bør bare endres dersom logging viser reelle feil.

### Vurdering av tekststørrelse og luft

Her er det et reelt behov for oppskalering. Dagens panel bruker 14 px for
motpart og header, 12 px for meldingsutdrag, tid og «Se alle meldinger», samt
8–10 px vertikal padding. Det er kompakt web-popover-typografi, ikke en god
standard for en primær native flate.

Anbefalt native baseline:

| Element                   | Dagens nivå                             | Anbefalt nivå                          |
| ------------------------- | --------------------------------------- | -------------------------------------- |
| Synlig paneltittel        | 14 px, middels vekt                     | 18 px, semibold                        |
| Motpart                   | 14 px, medium                           | 16 px, medium/semibold                 |
| Annonse og meldingsutdrag | 12 px                                   | 14 px                                  |
| Relativ tid               | 12 px                                   | 13–14 px, sekundær                     |
| «Se alle meldinger»       | 12 px, ca. 32 px høy                    | 16 px, minst 52–56 px høy              |
| Samtalerad                | Indirekte høyde, 10 px vertikal padding | Minst 64 px, 12–16 px vertikal padding |
| Horisontal sidemarg       | 12 px                                   | 16 px                                  |

Dette er ikke et krav om stor «display»-typografi. Målet er 16 px for det
viktigste og 14 px for sekundærinformasjon, slik at Dynamic Type kan skalere
fra en lesbar base.

Anbefalt luft og separasjon:

- bruk 16 px padding rundt headeren og minst 12 px luft under tittelen;
- gi hver samtalerad 12–16 px vertikal og 16 px horisontal padding;
- bruk 8 px mellom motpart og sekundærtekst når de brytes over flere linjer;
- bruk minst 16 px mellom siste samtalerad og den separate
  «Se alle meldinger»-handlingen, eller skill dem med en tydelig sticky footer;
- dersom retry eller andre sideordnede knapper vises i feiltilstanden, bruk
  minst 12 px mellom dem og ikke mer enn én fylt primærknapp;
- ikke legg ekstra margin mellom alle samtalerader i tillegg til separatorer;
  større radpadding gir nok luft uten å gjøre listen til «kort inni kort».

Oppskaleringen bør avgrenses til native-grenen. Desktop-popoveren på 360 px
kan beholde en tettere variant, men bør fortsatt oppfylle tilgjengelig
trykkflate og bruke minst 14 px for meningsbærende tekst.

### Anbefalt informasjonsarkitektur

Telefonpanelet skal fortsatt være en kort innboksforhåndsvisning:

1. synlig header med «Meldinger», ulest-antall ved behov og lukkeknapp;
2. statusregion for første lasting eller ikke-blokkerende oppdatering;
3. liste over inntil åtte nylige samtaler;
4. tydelig tomtilstand eller feiltilstand med «Prøv igjen»;
5. fast eller lett tilgjengelig fullbreddehandling «Se alle meldinger».

Panelet skal ikke få søk, filtre, arkivering, blokkering, meldingstråd eller
komponist. Slike handlinger hører hjemme i innboks- og samtalerutene.

### Anbefalt radkontrakt

- Hele raden er tappbar og minst 56 px høy.
- På native er 64 px anbefalt baseline for samtaleraden; 56 px er absolutt
  minimum når innholdet er kort.
- Motpart er primærtekst. Annonsetittel og meldingsutdrag er sekundærtekst.
- Ulest uttrykkes med både visuell vekt/prikk og tilgjengelig navn; farge alene
  er ikke nok.
- Relativ tid skal få plass uten å presse bort motparten. Ved stor tekst kan
  den flyttes til egen linje fremfor å avkorte det viktigste innholdet.
- Slettede meldinger og manglende annonse/motpart skal ha forståelige
  fallbacktekster.
- Tidligere liste beholdes under refetch; en liten `role="status"` annonserer
  oppdateringen uten å blokkere navigasjon.

## 6. Felles native kontrakt

- Telefon bruker bunn-sheet; nettbrett bruker sentrert dialog. Webadferden kan
  forbli dialog/popover når trigger og innhold passer.
- Alle interaktive elementer har minst 48 × 48 px effektivt treffområde.
- Primære native handlinger bruker minst 16 px tekst og 52–56 px høyde.
- Hovedtekst i datarike panelrader bruker normalt 16 px; sekundærtekst bruker
  normalt minst 14 px. Mindre tekst er for metadata som ikke bærer handlingens
  eneste mening.
- Bruk 16 px panelsidemarg, 12–16 px vertikal radpadding og minst 12 px mellom
  separate handlinger som standard. Ikke legg avstand mellom listeelementer
  både som margin og separator uten dokumentert behov.
- Synlige overskrifter skal være koblet til dialogens tilgjengelige tittel.
- Ingen hardkodede farger; bruk semantiske tokens.
- Innhold skal fungere ved 200 % tekst uten overlapp eller tap av eneste
  meningsbærende tekst.
- Sheet-primitiven eier safe area, draghåndtak, fokusfelle og historikk.
- Bakgrunnsinnhold skal ikke kunne aktiveres mens panelet er åpent.
- En gesture er aldri eneste måte å lukke eller navigere på.

## 7. Prioritert tiltaksplan

### Fase 0 – baseline og beslutning

- Ta skjermbilder/video på iOS- og Android-telefon samt iPad/Android-nettbrett.
- Verifiser 375 × 812, 844 × 390, 820 × 1180 og 1024 × 1366 med
  `?forcenative`; safe area må i tillegg testes i simulator.
- Mål trykkflater, tekstskalering, fokusrekkefølge og tilbake-lukking.
- Sammenlign dagens Meldinger-panel med 16/14 px typografi, 64 px rader og
  16 px sidemarg før endelig nivå låses.
- Godkjenn tittel/ordlyd og om meldingshandlingen skal være fast i bunnen.

### Fase 1 – «Ny annonse»

- Juster tittel og hjelpetekst etter produktbeslutning.
- Sikre programmatisk tekststruktur og 200 % tekst.
- Behold dagens tekst- og knappestørrelser med mindre baseline viser konkrete
  lese- eller feiltrykkproblemer; vurder kun å øke radgapet fra 12 til 16 px.
- Legg én fokusert komponenttest for åpning, begge rutemål og lukking.

### Fase 2 – «Meldinger»

- Innfør tydelige loading-, feil-, tom- og refetch-tilstander med eksisterende
  `Skeleton`, `EmptyState` og inline statusmønster.
- Gjør header, samtalerader og «Se alle meldinger» i tråd med native mål.
- Bruk 18 px paneltittel, 16/14 px radtypografi, 64 px anbefalt radhøyde og en
  52–56 px fullbreddehandling som startpunkt for native QA.
- Behold forhåndsvisningen avgrenset til åtte samtaler.
- Legg komponenttester for tilstander, ulest, navigasjon og lukking.

### Fase 3 – native QA og måling

- Test Dynamic Type/Android tekstskalering, VoiceOver/TalkBack, ekstern
  tastaturbruk, Android-tilbake, iOS-kantsveip og sheet-drag.
- Kontroller portrait på telefon og begge orienteringer på nettbrett.
- Mål åpning av annonsetype, overgang til wizard, åpning av samtale og overgang
  til full innboks før større produktendringer vurderes.

## 8. Akseptansekriterier

- Begge paneler åpner og lukker korrekt fra bunnavigasjonen på telefon og rail
  på nettbrett.
- Ingen synlig kontroll har mindre enn 48 × 48 px effektivt treffområde.
- Meldinger-panelet har minst 16 px primærtekst, 14 px sekundærtekst og 16 px
  horisontal sidemarg i native-grenen.
- «Se alle meldinger» er minst 52 px høy med 16 px tekst, og separate
  handlinger har minst 12 px visuell avstand.
- «Ny annonse» viser kun de to avtalte valgene og åpner korrekt rute.
- «Meldinger» skiller mellom loading, feil, tom og innhold.
- Samtaler forblir navigerbare og forståelige ved 200 % tekst.
- Android-tilbake og iOS-kantsveip lukker panelet før underliggende rute endres.
- Fokus returneres til utløseren etter lukking.
- Relevante enhets-/komponenttester, lint og typecheck passerer.
- Manuell iOS- og Android-verifisering er journalført før status settes til
  **Verifisert**.

## 9. Beslutninger og avgrensninger

- Gjenbruk `ResponsiveOverlay`/`NativeSheet`; ikke opprett panelspesifikke
  overlay-komponenter.
- Behold «Ny annonse» som et kort valgpanel uten detents.
- Behold «Meldinger» som forhåndsvisning og `/meldinger` som full innboks.
- Ikke optimaliser meldingsspørringen uten målt feil eller ytelsesproblem.
- Evaluer delt header-/footer-støtte i primitiven bare dersom minst to reelle
  kallsteder trenger nøyaktig samme kontrakt; lokale klasser er mindre kode
  inntil da.

## 10. Verifisering utført for analysen

- Lest `AGENTS.md`, `CLAUDE.md`, `docs/UI-GUIDE.md` og hele den eksisterende
  native søkefilterplanen.
- Statisk kartlegging av panelenes kallsteder, overlay-primitiver,
  formatfaktor, historikk, meldingsruter og eksisterende tester.
- Kontrollert arbeidskopien; eksisterende endring i
  `src/components/app-bottom-nav.tsx` er ikke berørt.
- Ingen visuell simulator-/enhetstest eller automatisert test er kjørt, siden
  denne leveransen kun er analyse og dokumentasjon.
