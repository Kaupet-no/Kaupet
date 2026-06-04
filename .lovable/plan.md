## Mål
Unngå unødvendig cookie-banner gjennom GDPR-kompliant design, og gi brukerne full innsikt i hvilke data som lagres og hvorfor.

## 1. Cookie-minimering

Endre `kaupet_visitor_id` fra persistent `localStorage` til sesjonsbasert `sessionStorage`.

- I `src/routes/annonse.$id.tsx`, linje 159-168: `localStorage.getItem("kaupet_visitor_id")` / `localStorage.setItem(...)` erstattes med `sessionStorage`.
- Dette gjør at det unike besøkende-IDet leve kun innenfor én nettleser-økt. Når fanen lukkes, slettes nøkkelen. Det fjerner behovet for samtykke fordi dataen er teknisk nødvendig (unik besøkstelling per økt for selger-statistikk) og ikke persistent.
- Eksisterende `listing_views`-tabell og SQL-spørringer i `listing_stats` påvirkes ikke; nøkkelen brukes fortsatt som `visitor_key`.

## 2. Personvernerklæring (`/personvern`)

Ny rute `src/routes/personvern.tsx`.

Innhold (på norsk):
- **Introduksjon:** Vi lagrer kun det som er nødvendig for at tjenesten skal fungere. Ingen tredjepartssporing, ingen markedsføringscookies, ingen analyseplattformer.
- **Hva lagres lokalt i nettleseren din:**
  - Supabase-autentiseringssesjon (nødvendig for innlogging).
  - `kaupet_read_<id>` per samtale (når du sist åpnet en chat — brukes til uleste-indikator).
  - `kaupet_viewed_<id>` per fane (unngår dobbel visningslogging ved refresh).
  - `kaupet_session_id` i `sessionStorage` (økt-basert besøkende-ID for anonym statistikk).
- **Hva lagres på serveren (hos databehandler):**
  - Brukerprofil (navn, e-post, profilbilde), annonser, meldinger, favoritter, anonyme visninger.
  - Databehandler: **Supabase**. Data lagres på servere i EU.
  - Lenke til [Supabase sin personvernerklæring](https://supabase.com/privacy).
- **Juridisk grunnlag:** Avtale (nødvendig for å levere tjenesten) og berettiget interesse (selger-statistikk og sikkerhet).
- **Dine rettigheter:** Innsyn, retting, sletting, dataportabilitet. Kontakt oss for å utøve dem.
- **Tredjeparter:** Kun Supabase (databehandler). Google Fonts lastes direkte fra Google (se eget avsnitt).
- **Versjon:** Datert og versjonsnummer for sporbarhet.

## 3. Footer-lenke

I `src/routes/__root.tsx`, erstatt dagens "Bidra på GitHub"-tekst med:
- Lenke til `/personvern` ("Personvern").
- Kort setning: "Vi bruker kun nødvendige cookies. Ingen sporingsbanner nødvendig."

## 4. Bekreftelse: ingen cookie-banner

Siden vi ikke bruker persistente analysecookies, markedsføringscookies eller tredjepartssporing, og den eneste persistente lagringen er autentisering (nødvendig) og uleste-tidsstempler (funksjonelt nødvendig), er en GDPR-cookie-banner unødvendig. Standardvalget for alle brukere er "kun nødvendige cookies".

## Filer som opprettes/endres

**Nye:**
- `src/routes/personvern.tsx`

**Endres:**
- `src/routes/annonse.$id.tsx` — `localStorage` → `sessionStorage` for visitor ID.
- `src/routes/__root.tsx` — footer med lenke til `/personvern`.

## Utenfor scope

- Egne cookie-innstillinger / samtykkepanel (ikke nødvendig uten valgfrie cookies).
- Vilkår for bruk (kan legges til separat om ønskelig).
- Self-hosting av Google Fonts.