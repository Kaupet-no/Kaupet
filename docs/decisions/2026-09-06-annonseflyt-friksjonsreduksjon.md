# Forslag: annonseopprettelse med mindre friksjon

**Status:** Forslag — ikke implementert som ny visuell flyt
**Dato:** 2026-09-06

## Problem

Den tidligere femkapittel-omskrivingen endret hovedsakelig presentasjonen av de samme
feltene. Den innførte flere modeller og tre responsive presentasjoner, men ga ikke en
tydelig reduksjon i valg, skriving eller feil for brukeren.

Den eksisterende wizarden har allerede flere riktige byggesteiner:

- kategori- og field-group-registry
- dynamiske kategori-flyter
- kjøretøyspesifikt oppslag
- forhåndsvisning
- `NativeComposerDeck` og system-back
- lokal og serverside autosave for innloggede brukere

Neste forbedring bør derfor fjerne brukerfriksjon uten å erstatte hele wizarden.
Den foreslåtte retningen er en gradvis forbedring av eksisterende flyt, ikke en ny
domene- eller kapittelmodell.

## Prinsipp

> Brukeren skal alltid vite hva som må gjøres nå, hvorfor det trengs, og hva som
> gjenstår før annonsen kan publiseres.

Designet skal være én responsiv flyt med samme informasjonsarkitektur på web og
native. Responsivitet skal endre tetthet og plassering, ikke rekkefølge eller
interaksjonsmodell.

## Foreslått flyt

### 1. Start med intensjon og én kort tittel

Behold inngangen for salg eller kjøpsønske. La tittel være første reelle input når
brukeren kommer fra inngangen med en tittel.

- Vis én tydelig overskrift og ett tittel-felt.
- Bruk eksisterende tittelbaserte kategoriforslag etter at brukeren har skrevet nok.
- Vis forslag som valg, aldri som automatisk kategoribytte.
- Kategoritreet er alltid tilgjengelig som manuell fallback.
- For direkte inngang uten tittel kan kategori fortsatt være første steg.

Dette reduserer tre kategorikl ikk før første tekstinput for brukere som allerede vet
hva de selger, uten å fjerne kontrollen over kategorien.

### 2. Bilder tidlig, men ikke som blokkering

Etter tittel/kategori:

- vis bildeopplasting tidlig fordi bilder er den mest verdifulle annonsedataen
- forklar kort hvorfor bilder hjelper
- la brukeren fortsette uten bilder
- vis ett konkret, kontekstuelt råd i stedet for en egen opplæringsflate

Fotoassistanse fra Mistral skal først kobles på etter DPA, kostnadssjekk og kontrollert
smoke-test. Den skal alltid ha eksplisitt samtykke og manuell fallback.

### 3. Samle bare felt som hører naturlig sammen

Bruk eksisterende field groups og kategori-flow, men grupper dem visuelt i maksimalt
fire forståelige deler:

1. **Vis frem** — bilder, tittel og beskrivelse
2. **Pris og tilstand** — pris, tilstand og relevante egenskaper
3. **Levering og sted** — leveringsmåte og lokasjon
4. **Se over** — oppsummering, forbedringer og publisering

Dette er en visuell forklaring, ikke en ny domene- eller valideringsmodell. Feltrekkefølge
skal fortsatt komme fra kategori-flowen.

### 4. Skill publiseringskrav fra forbedringer

På review skal brukeren se to tydelige nivåer:

- **Må fylles ut** — blokkerer publisering
- **Kan gjøre annonsen bedre** — valgfritt, med direkte redigeringshandling

Valgfrie forbedringer skal aldri ligge i veien for publisering. Dette er viktigere
enn å vise alle mulige felt tidlig.

### 5. Gjestedraft uten overraskelse

En gjest skal kunne fylle ut og lagre lokalt uten konto. Før publisering:

- vis `Logg inn og publiser`
- forklar at utkastet beholdes gjennom innloggingen
- flush localStorage/IndexedDB før redirect
- returner brukeren til review etter auth

Ingen anonym Supabase-session skal brukes til dette.

### 6. Behold én navigasjonsmodell

- Web og native bruker samme steg- og feltrekkefølge.
- `NativeComposerDeck` beholdes på begge flyter.
- System-back og nettleser-back går ett steg tilbake inne i wizarden.
- `Neste` er alltid den primære handlingen på ikke-review-steg.
- På review er én primærhandling synlig: `Publiser annonse` eller `Logg inn og publiser`.

## Visuelt uttrykk

Kaupet skal oppleves minimalistisk og stilrent gjennom hierarki, ikke dekorasjon.

- Bruk eksisterende semantiske design-tokens; ingen hardkodede farger.
- Én hovedkolonne på mobil og en begrenset innholdsflate på web.
- Bruk 4/8-piksel spacing-skala; mindre avstand i en feltgruppe enn mellom grupper.
- La typografi og whitespace bære hierarkiet.
- Unngå parallelle kort, permanente sidepaneler og konkurrerende CTA-er.
- Bruk border eller subtil elevation for struktur, ikke begge samtidig uten grunn.
- Alle knapper og felt skal ha `hover`, `focus-visible`, `disabled`, `loading`, `empty` og `error`.
- Bruk `ResponsiveOverlay` for redigering og `AlertDialog` for destruktive valg.
- Behold synlig autosave-status, men gjør den sekundær: `Lagret nå` / `Utkast lagres`.
- Bevegelse skal være kort og funksjonell, med støtte for `prefers-reduced-motion`.

## Hva som ikke skal bygges nå

- Ingen ny femkapittelmodell oppå field-group-registry.
- Ingen separat guided/tablet/workspace-domenevariant.
- Ingen generell AI-chat eller åpen prompt.
- Ingen automatisk publisering av AI-forslag.
- Ingen obligatorisk bildeopplasting.

## Måling før neste større endring

Før en ny redesign implementeres bør staging/produsjon gi baseline for:

- tid fra start til publisering
- frafall per steg og field group
- valideringsfeil per felt
- andel annonser uten bilder
- gjest → auth → publisering
- forskjell mellom web, native mobil og tablet

En ny løsning bør bare utvides dersom den forbedrer minst én av disse målene uten å
forverre fullføringsrate eller feilrate.
