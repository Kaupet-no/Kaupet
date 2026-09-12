# Manuell QA — J2–J5 annonseopprettelse

Operasjonell akseptansesjekkliste for staging (`https://staging.kaupet.no`).
Kjør hver reise på web, iOS og Android før release. Bruk testkontoer og syntetiske
data; aldri produksjon eller reell PII.

## Testhode

| Felt                 | Verdi                                       |
| -------------------- | ------------------------------------------- |
| Dato / build / miljø | ______________________________              |
| Tester / observatør  | ______________________________              |
| Testkonto(er)        | ______________________________              |
| Webleser/enhet/OS    | ______________________________              |
| Nettverk             | ☐ normalt ☐ offline-angrep ☐ gjenoppkobling |
| Resultat             | ☐ PASS ☐ FAIL ☐ BLOKKERT                    |

Roller: **tester** utfører reisen og dokumenterer bevis; **observatør** følger
med på data-/a11y-kontrakter; **produktansvarlig** godkjenner avvik. Enhetene
skal minst være Chrome desktop (1440×900 og 320 CSS-px/200 % zoom), iOS med
Safari + VoiceOver og Android med TalkBack.

## Felles pass/fail og bevis

For hver rad fylles `Status` med `PASS`, `FAIL` eller `BLOKKERT`, og `Bevis` med
URL, annonse-/utkast-ID, skjermbilde eller kort video, tidspunkt og eventuelle
konsoll-/nettverksfeil. PASS krever forventet resultat uten datatap, S0/S1 eller
uventet duplikat. Et FAIL registreres etter DEF-mal i TESTSTRATEGI §9.

## J2 — Generisk salgsannonse (CRE-34, CRE-30, CRE-33)

| Steg | Handling                                                                                   | Forventet resultat                                                     | Bevis | Status |
| ---- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ----- | ------ |
| 1    | Logg inn og start ny generisk salgsannonse.                                                | Riktig composer, «Steg X av Y» og fokus på overskrift.                 |       |        |
| 2    | Fyll tittel, beskrivelse, pris 0, bilder og leveranse/lokasjon; bruk norske tegn og emoji. | Validering er forståelig; verdier overlever neste/forrige.             |       |        |
| 3    | Gå til gjennomgang og rett ett felt.                                                       | Alle utfylte felt vises korrekt; «Endre» returnerer uten datatap.      |       |        |
| 4    | Klikk «Publiser» to ganger raskt.                                                          | Knappen går i ventetilstand og nøyaktig én annonse opprettes (CRE-30). |       |        |
| 5    | Gjenta publisering etter simulert timeout/gjenoppkobling.                                  | Retry er idempotent; ingen duplikat (CRE-30/33).                       |       |        |
| 6    | Kontroller publisert detaljside som anonym bruker.                                         | Alle felt/bilder er korrekte og annonsen er synlig.                    |       |        |

## J3 — Kjøretøy manuelt og via regnr (VEH-07, VEH-11, CRE-34)

| Steg | Handling                                             | Forventet resultat                                                          | Bevis | Status |
| ---- | ---------------------------------------------------- | --------------------------------------------------------------------------- | ----- | ------ |
| 1    | Start kjøretøyannonse og skriv ugyldig regnr.        | Feltfeil vises før nettverkskall (VEH-11).                                  |       |        |
| 2    | Gjennomfør én annonse med manuelle kjøretøyfelt.     | Oppslag kan hoppes over/feiler kontrollert; flyten blokkeres ikke (VEH-07). |       |        |
| 3    | Gjennomfør ny annonse med gyldig test-regnr-oppslag. | Merke/modell/år fylles riktig og kan korrigeres manuelt.                    |       |        |
| 4    | Naviger frem/tilbake og publiser med dobbeltklikk.   | Verdier bevares og kun én annonse opprettes (CRE-34/30).                    |       |        |
| 5    | Åpne detaljsiden anonymt.                            | Kjøretøydata og teknisk informasjon er korrekte.                            |       |        |

## J4 — Kjøpsønske (WTB-03, WTB-08)

| Steg | Handling                                                              | Forventet resultat                                                              | Bevis | Status |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----- | ------ |
| 1    | Start «Jeg ønsker å kjøpe» uten kategori.                             | Kriterier kan fylles; mangler forklares ved «Fortsett» (WTB-03).                |       |        |
| 2    | Fyll kategori, prisintervall, lokasjon og kriterier; prøv min > maks. | Ugyldig intervall blokkeres med feltfeil; gyldig verdi overlever navigasjon.    |       |        |
| 3    | Publiser med varsling aktivert.                                       | Ett kjøpsønske publiseres og varslingsvalg bekreftes (WTB-03).                  |       |        |
| 4    | Opprett matchende testannonse fra annen testkonto.                    | Eieren får nøyaktig ett relevant varsel; ingen varsel til feil bruker (WTB-08). |       |        |

## J5 — Avbryt, utkast, tvangsavslutt, gjenopprett (CRE-35, CRE-36, CRE-11)

| Steg | Handling                                                       | Forventet resultat                                                           | Bevis | Status |
| ---- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----- | ------ |
| 1    | Fyll flere felt og avbryt/lukk composeren.                     | Tydelig valg; utkast lagres uten tap (CRE-35).                               |       |        |
| 2    | Start på nytt og velg utkastet.                                | Alle felter, bilder og riktig steg gjenopprettes.                            |       |        |
| 3    | Slå av nett under autolagring, slå på igjen og gjenta.         | Tydelig feil; lokal state beholdes og lagring kan gjentas (CRE-35).          |       |        |
| 4    | Tvangsavslutt app/nettleser midt i flyten; start på nytt.      | Gjenoppretting tilbys med alle utfylte felt (CRE-36).                        |       |        |
| 5    | Åpne samme utkast i to faner/enheter og lagre ulike endringer. | Nyeste versjon vinner deterministisk; ingen stille overskriving (CRE-11/37). |       |        |
| 6    | Gjenopprett og publiser med dobbeltklikk.                      | Én korrekt annonse publiseres; utkastet blir ikke aktivt.                    |       |        |

## Påkrevde feilgjettings- og a11y-angrep

Kjør i hver relevant reise og noter resultatet i stegets bevisfelt:

- Dobbelttrykk på primærhandlinger; nett av/på under lagring og publisering.
- Nettleser-tilbake, systemtilbake og edge-sveip fra hvert åpent overlay.
- Tvangsavslutt midt i flyten; samme handling samtidig i to faner/enheter.
- Tom liste, ett element og mange elementer; lang tekst, emoji, norske tegn,
  RTL-tegn og HTML/SQL-lignende input; pris 0, 999 999 999, år 1900 og km 0.
- Tastatur-only: synlig/logisk fokus, ingen felle, Escape lukker overlay.
- VoiceOver/TalkBack: sidetittel, «Steg X av Y», lagringsstatus, etikett,
  obligatorisk/valgfri, feiltekst og knappetilstand leses én gang i rekkefølge.
- 200 % tekstforstørrelse og 320 px: ingen overlapp, avkutting eller horisontal
  scrolling; lys/mørk kontrast og informasjon må ikke avhenge av farge.

## Funnregister

| Dato | Reise/steg | TC-ID | Alvorlighet | Beskrivelse/bevis | Eier | Status |
| ---- | ---------- | ----- | ----------- | ----------------- | ---- | ------ |
|      |            |       |             |                   |      |        |
