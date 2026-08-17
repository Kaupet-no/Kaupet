# Manuell test- og QA-plan for annonseopprettelse

Denne planen dekker delene av Fase 6 som krever fysisk enhet, hjelpemiddel,
menneskelig vurdering eller produksjonsnær observasjon. Alle avvik registreres
i `ANNONSEOPPRETTELSE-UX-PLAN.md` med enhet, OS, build, steg, alvorlighet,
forventet/faktisk resultat og skjermopptak.

## Roller og enheter

- Testleder: koordinerer builds, scenarioer og avvik.
- To testere på iOS og to på Android; minst én på hver plattform har ikke
  arbeidet med løsningen.
- Én tilgjengelighetstester bruker stor tekst og skjermleser som primærmodus.
- Produktansvarlig godkjenner språk, tillit og eventuelle P1-avvik.

Minimumsenheter:

- iPhone med nyeste iOS og en mindre støttet iPhone.
- Android med nyeste stabile Android og én eldre støttet versjon.
- iPad og Android-nettbrett med fysisk eller Bluetooth-tastatur.
- Desktop Safari, Chrome og Firefox for webkontroll.

## Testdata og forberedelser

1. Bruk staging-build og egne testbrukere; aldri produksjon.
2. Opprett ett generisk salg, ett kjøretøy, én gratisannonse og ett
   kjøpsønske per tester.
3. Ha ett halvferdig utkast av hver annonsetype på en annen enhet.
4. Klargjør bilder i portrett/landskap, lange filnavn og minst ett stort bilde.
5. Aktiver skjermopptak og noter build-SHA før hver økt.

## Kritiske brukerreiser

For hver reise skal testeren kunne forklare hvor de er, hva som lagres og hva
neste handling gjør:

1. Velg intensjon og publiser en generisk salgsannonse.
2. Publiser et kjøretøy manuelt og via registreringsoppslag når tjenesten er
   tilgjengelig.
3. Publiser et kjøpsønske med og uten kategori, kriterier og varsling.
4. Gå fra review til hver «Endre»-seksjon, endre verdien og bekreft retur til
   review uten datatap.
5. Avbryt, lagre utkast, tvangsavslutt appen og gjenopprett.
6. Bytt kategori etter utfylte kategoriavhengige felt og kontroller
   bekreftelse/opprydding.
7. Forsøk ugyldige felt, manglende bilder/pris og dobbelttrykk på publisering.
8. Mist nett under autolagring og publisering; koble til igjen og prøv på nytt.

Godkjent når ingen P0/P1-feil finnes, ingen data går tapt, og publisering
oppretter høyst én annonse.

## Tilgjengelighet

### VoiceOver og TalkBack

- Naviger hele begge flyter med sveip og utforsk ved berøring.
- Bekreft sidetittel, «Steg X av Y», lagringsstatus, feltetikett, obligatorisk/
  valgfritt, feiltekst og knappetilstand i logisk rekkefølge.
- Utløs feil og bekreft at oppsummeringen annonseres én gang, at fokus kan
  flyttes til feltet, og at dekorative ikoner ikke leses.
- Åpne/lukk kriteriesheet og bekreft fokusfangst og retur til åpningsraden.
- Publiser og bekreft at ventestatus og suksess annonseres uten duplikat.

### Stor tekst, zoom og kontrast

- iOS Dynamic Type og Android font scale på minst 200 %.
- Web ved 200 % zoom og 320 px CSS-bredde.
- Bekreft ingen avkortet eneste verdi, overlapp, skjult primærhandling eller
  horisontal scrolling.
- Test lys/mørk modus, økt kontrast og fargefiltre. Informasjon må ikke være
  avhengig av farge alene.

### Tastatur og bryterkontroll

- Fullfør begge flyter uten peker/berøring.
- Fokusrekkefølge følger leserekkefølge; fokus er alltid synlig.
- Enter/Space aktiverer riktig kontroll uten utilsiktet publisering.
- Escape/system-tilbake lukker detaljflate før siden bak.
- Switch Access/Full Keyboard Access når alle handlinger og har forståelige
  navn.

## Native atferd og livssyklus

- iOS kantsveip og Android system-tilbake går ett composer-steg tilbake.
- Tastaturet dekker aldri aktivt felt eller primærhandling.
- Roter telefon og nettbrett på hvert hovedsteg; state og fokus bevares.
- Send appen til bakgrunnen i 30 sekunder, fem minutter og under opplasting.
- Tvangsavslutt og start på nytt; siste gyldige utkast gjenopprettes.
- Kontroller safe area på enhet med Dynamic Island/notch og Android gesture-
  navigasjon.
- Verifiser at haptikk er diskret og aldri eneste feedback.

## Modererte brukertester

Fem deltakere: minst to iOS, to Android og én som bruker stor tekst eller
skjermleser. Samme deltaker prøver både salg og kjøpsønske.

Oppgaver uten ledende instruksjon:

1. «Legg ut denne gjenstanden for salg.»
2. «Du må avbryte halvveis og fortsette senere.»
3. «Se over annonsen og endre prisen før publisering.»
4. «Lag et kjøpsønske og velg hvilke treff du vil varsles om.»

Observer tid, stopp, tilbakehandlinger, spørsmål, feilretting og forståelse av
utkast/varsling. Etter hver flyt spør: Hva er publisert? Hvem kan se det? Hva
skjer videre? Ikke vurder bare om oppgaven teknisk ble fullført.

## Beslutningsport og utrulling

- P0: datatap, feil brukerdata, blokkert publisering eller duplikat. Stopper
  utrulling.
- P1: kritisk handling utilgjengelig, alvorlig skjermleser-/tekstskalafeil
  eller systematisk misforståelse. Må rettes og retestes.
- P2: tydelig friksjon uten blokkering. Prioriteres før 100 % når rimelig.
- P3: kosmetisk forbedring. Kan føres i backlog.

Etter godkjent staging-QA: intern utrulling, deretter 10/50/100 % dersom
feature-flag/datamodell støtter det. Overvåk fullføring, aktiv tid,
valideringsstopp, publiseringsfeil og duplikater minst én uke eller til
tilstrekkelig volum. Roll back ved P0 eller statistisk/operasjonelt tydelig
forverring.
