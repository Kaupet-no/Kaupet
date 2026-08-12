# UX-implementering: baseline og beslutninger

Opprettet 2026-08-12 før den tverrplattformlige UX-implementeringen. Dokumentet
er en kort, etterprøvbar kontrakt for fasene og skal oppdateres når en måling
eller beslutning endres.

## Kritiske brukerreiser

1. Åpne søk → avgrense → se treff → åpne annonse.
2. Åpne annonse → vurdere tillit → favoritt eller kontakt → fortsette etter
   eventuell innlogging.
3. Starte annonse → legge til bilder og fakta → gjenoppta utkast → publisere.
4. Installere app → forstå verdien → gi relevante tillatelser → lande i riktig
   konto-/produktkontekst.

## Måleprinsipper

- Kun førstepartsdata og en liten, eksplisitt hendelsesliste.
- Ingen søketekst, meldingsinnhold, annonsetittel, rå IP eller stabil bruker-ID.
- Tilfeldig sesjons-ID lagres i `sessionStorage` og forsvinner med sesjonen.
- Hendelser er best effort og får aldri blokkere en brukerhandling.
- Ratebegrensning skjer på en irreversibel IP-hash; rå IP lagres ikke.
- Råhendelser slettes etter 90 dager.

Primære produktmål er fullføringsgrad og frafall mellom stegene i de fire
reisene. Sekundære mål er nulltreff, tid til første relevante annonse og andel
utkast som gjenopptas. Baseline kan først tallfestes etter at migrasjonen har
vært aktiv i et representativt tidsrom.

## Verifiseringsmatrise

Alle kritiske flyter skal minst sjekkes på:

| Flate   | Størrelser          | Særskilt kontroll                               |
| ------- | ------------------- | ----------------------------------------------- |
| Web     | 1440×900, 390×844   | Tastatur, fokus, tilbakeknapp, responsiv layout |
| iOS     | Telefon + nettbrett | Safe area, Dynamic Type, tillatelser, kantsveip |
| Android | Telefon + nettbrett | System-tilbake, tillatelser, tastatur, offline  |

Native-grener kan røykprøves med `?forcenative` i utvikling, men tillatelser,
safe area og OS-navigasjon må godkjennes i simulator eller på fysisk enhet.

Automatisert E2E kjører alle generelle spesifikasjoner som både desktop-web og
mobil-web. Native-spesifikasjoner bruker i tillegg `?forcenative`; OS-spesifikke
tillatelser og safe area forblir en simulator-/enhetsport. `check:bundle`
håndhever 650 KiB per JavaScript-fil og 180 KiB per CSS-fil etter bygg.
