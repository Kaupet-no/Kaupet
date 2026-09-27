# Kaupet Proff-API (v1)

Dette er utviklerdokumentasjonen for Proff-kunders REST-API mot Kaupet:
opprette, oppdatere, fornye og lese status på annonser maskinelt — fra et
lagersystem, en nettbutikk eller et eget skript. Samme tjenestelag som denne
dokumentasjonen beskriver brukes også av Excel/CSV-importen i
bedriftskonsollet, så oppførselen (idempotens, valideringsregler,
bildekomprimering) er identisk uansett kanal.

Maskinlesbar spesifikasjon: **`GET /api/v1/openapi.json`** (OpenAPI 3.1, ingen
autentisering nødvendig).

## Kom i gang

1. Logg inn som superbruker for organisasjonen og åpne
   **Bedriftskonsoll → Integrasjoner**.
2. Opprett en API-nøkkel: gi den et navn, velg lokasjon (brukes som
   standardlokasjon for annonser du oppretter via API-et), scope
   (`listings:read`/`listings:write`) og varighet.
3. **Kopier nøkkelen med det samme** — den vises kun denne ene gangen og kan
   aldri hentes frem igjen. Lagre den et sted appen/skriptet ditt kan lese den
   fra (miljøvariabel, secret manager), aldri i kildekode som committes.
4. En organisasjon kan ha maks 2 aktive nøkler samtidig. Roter ved å opprette
   en ny nøkkel **før** du tilbakekaller den gamle, slik at integrasjonen ikke
   får nedetid.

## Autentisering

Alle kall (unntatt `GET /api/v1/openapi.json`) krever en
`Authorization`-header med nøkkelen som Bearer-token:

```
Authorization: Bearer kpt_live_...
```

En nøkkel er ugyldig (`401`) hvis den er tilbakekalt eller utløpt. Den slutter
også å virke (`403`) hvis brukeren den ble opprettet av ikke lenger er et
aktivt medlem av organisasjonen, eller organisasjonens Proff-abonnement ikke
lenger er aktivt. Sett opp et nytt varsel før nøkkelen utløper — Kaupet sender
selv en e-post til organisasjonens superbrukere 14 og 3 dager før utløp.

Hvert kall krever ett av to scope, satt på nøkkelen ved opprettelse:

| Scope            | Kreves av                                                                 |
| ---------------- | ------------------------------------------------------------------------- |
| `listings:read`  | Alle `GET`-endepunkter                                                    |
| `listings:write` | `PUT`/`POST`-endepunktene (opprette/oppdatere/fornye/endre status/bilder) |

## Grenser

Grensene skal verne mot løpske integrasjoner og misbruk, ikke begrense vanlig
lagersynk — normal bruk er få, store kall. De faktiske tallene står i
**Bedriftskonsoll → Integrasjoner**, under samme nøkkel, sammen med ditt
forbruk akkurat nå (så tallene her aldri kan bli utdaterte i praksis):

- **Lesekall** (`GET`) — grense per time, per nøkkel.
- **Skrivekall** (`PUT`/`POST` på én annonse: opprett/oppdater/status/bilder)
  — grense per time, per nøkkel.
- **Batch-kall** (`POST /listings/batch`, `POST /listings/renew`) — egen,
  lavere grense per time, per nøkkel.
- **Nye annonser opprettet** — grense per døgn, per organisasjon, på tvers av
  Excel/API/MCP. Eksisterende annonser kan fortsatt oppdateres selv om
  grensen er nådd.
- **Nye bilder sendt til komprimering** — grense per døgn, per organisasjon.
  Overskrides den for én rad i et batch-kall, lagres annonsen likevel — bare
  bildene for den raden hoppes over (se `warning` i svaret) og legges til ved
  neste synk.

Hvert svar har headerne `X-RateLimit-Limit`, `X-RateLimit-Remaining` og
`X-RateLimit-Reset` (Unix-tidsstempel). Ved `429 Too Many Requests` kommer i
tillegg `Retry-After` (sekunder). Vent til grensen tilbakestilles før du
prøver igjen — ikke poll tettere enn det.

Maks antall rader i ett `POST /listings/batch`-kall og maks antall
`externalRefs` i `POST /listings/renew` står også i openapi-dokumentet
(`x-rate-limits`).

## Idempotens og `externalRef`

Hver annonse identifiseres av en **`externalRef`** du velger selv (varenummer,
SKU eller lager-ID) — unik i din organisasjon. `PUT /listings/{externalRef}`
er idempotent: samme kall sendt på nytt med samme innhold gir `unchanged`, et
endret felt gir `updated`, og en referanse som ikke finnes fra før gir
`created`. En annonse kan ikke opprettes direkte som `sold`/`archived` — den
må finnes fra før.

## Fornyelse (annonser utløper etter 30 dager)

Som i wizarden utløper en aktiv annonse automatisk 30 dager etter siste
aktivering. Hvert vellykkede maskinelle kall som berører en annonse (upsert,
batch, `renew`) forlenger `expires_at` med nye 30 dager — også når innholdet
er uendret. En utløpt annonse som fortsatt sendes inn som aktiv,
reaktiveres automatisk. Unntak: en annonse en moderator har deaktivert
(`disabled`), eller som du selv har satt til `sold`/`archived` i Kaupet,
endres kun hvis kallet eksplisitt sender `status: "active"`.

To måter å holde lageret fornyet på:

- Send **hele det aktive lageret** gjennom `PUT`/`POST /listings/batch` minst
  én gang per 30 dager (den enkleste strategien hvis du uansett synker jevnlig).
- Eller kall **`POST /listings/renew`** med bare listen over `externalRef`-er
  som fortsatt skal være aktive — nyttig hvis integrasjonen din bare vet om
  _endringer_, ikke hele lageret.

## Bilder

Send bilde-URL-er (`images`/`urls`), ikke filer — Kaupet henter dem selv.
Hver URL må være `https://`, peke til et faktisk bilde (jpeg/png/webp/jxl,
maks 20 MB opplastet), og behandles asynkront i en kø:

- Bildet komprimeres på **akkurat samme måte som i veiviseren**: WebP, EXIF-
  retting, maks 1600 px / 0,6 MB for hovedbildet og maks 480 px / 0,1 MB for
  miniatyrbildet. Målstørrelsen er et mål, ikke et krav — et bilde som ikke
  når den etter noen forsøk lagres likevel, akkurat som i veiviseren.
- `GET /listings/{externalRef}` og svaret fra
  `PUT /listings/{externalRef}/images` viser status per bilde-URL:
  - **`pending`/`processing`** — «Behandles». Dette dekker også feil Kaupet
    selv eier (bildetjenesten nede, midlertidig nettverksfeil) — jobben
    prøves på nytt automatisk, og vises aldri som en feil hos deg.
  - **`done`** — ferdig, med offentlig `url`.
  - **`failed`** — en feil du kan rette, med en konkret `error`-tekst (f.eks.
    «Bildet finnes ikke på adressen (HTTP 404)», «Adressen svarer ikke med et
    bilde», «Bildet er større enn 20 MB», «Bildet kunne ikke leses»).
- `PUT /listings/{externalRef}/images` **erstatter hele bildesettet** — send
  alle URL-ene du vil beholde, ikke bare de nye. Samme regel gjelder
  `images`-feltet i en upsert: det er utelatt/tomt som betyr «ikke rør
  bildene», en oppgitt liste (også tom `[]`) erstatter settet.
- Multipart-filopplasting (rå bytes) støttes **ikke** i v1 — et slikt kall
  får `415 Unsupported Media Type`. Last bildet opp et sted som gir deg en
  `https://`-URL (egen nettbutikk, R2/S3, o.l.) og send URL-en i stedet.

## Feilformat

Alle feil har samme form:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Tittelen må ha minst 5 tegn.",
    "field": "title"
  }
}
```

- `message` er alltid norsk og trygg å vise til et menneske.
- `code` er en stabil, engelsk maskinkode — bygg feilhåndteringen din på
  `code`, ikke på `message`-teksten, som kan endres.
- `field` er kun med for `validation_error` når feilen gjelder ett bestemt
  felt.

| HTTP  | `code`                                                           | Betydning                                                             |
| ----- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `401` | `missing_key`, `invalid_key`, `revoked`, `expired`               | Ingen/ugyldig/tilbakekalt/utløpt nøkkel                               |
| `403` | `inactive_member`, `no_proff`, `insufficient_scope`, `forbidden` | Nøkkelen er gyldig, men aktøren/organisasjonen/scopet mangler tilgang |
| `404` | `not_found`                                                      | Ukjent `externalRef`/kategori-ID                                      |
| `415` | `unsupported_media_type`                                         | Multipart-opplasting mot `/images` (se over)                          |
| `422` | `validation_error`                                               | Feil i forespørselen (feltnavn i `field` der det er relevant)         |
| `429` | `rate_limited`                                                   | Rategrensen er nådd — se `Retry-After`                                |
| `500` | `internal_error`                                                 | Noe gikk galt hos Kaupet — prøv igjen, kontakt oss om det gjentar seg |

## Endepunkter

Full spesifikasjon: `GET /api/v1/openapi.json`. Kort oversikt:

| Metode + sti                          | Scope            | Beskrivelse                                                                                                                  |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /categories`                     | `listings:read`  | Alle kategorier (id, slug, navn, overkategori)                                                                               |
| `GET /categories/{id}/fields`         | `listings:read`  | Felt/krav/tillatte verdier for kategorien (samme som malens «Kategorifelter»-ark)                                            |
| `GET /locations`                      | `listings:read`  | Organisasjonens lokasjoner du har tilgang til, med standardlokasjon markert                                                  |
| `PUT /listings/{externalRef}`         | `listings:write` | Opprett/oppdater én annonse (idempotent). `?dryRun=true` validerer uten å skrive                                             |
| `POST /listings/batch`                | `listings:write` | Opprett/oppdater flere annonser i ett kall (maks-rader: se openapi)                                                          |
| `POST /listings/renew`                | `listings:write` | Forny `expires_at` for en liste `externalRef`-er                                                                             |
| `GET /listings`                       | `listings:read`  | Paginert liste over organisasjonens maskinelt opprettede annonser (cursor, `limit` ≤ 100, filter på `status`/`updatedSince`) |
| `GET /listings/{externalRef}`         | `listings:read`  | Én annonse: status, `kaupetCode`, offentlig URL, `expiresAt`, bildejobbstatus                                                |
| `POST /listings/{externalRef}/status` | `listings:write` | Sett status (`active`/`sold`/`archived`)                                                                                     |
| `PUT /listings/{externalRef}/images`  | `listings:write` | Erstatt bildesettet (URL-liste)                                                                                              |
| `GET /openapi.json`                   | Ingen auth       | Denne spesifikasjonen                                                                                                        |

`GET /listings`/`GET /listings/{externalRef}` viser kun annonser som har en
`externalRef` — altså annonser opprettet/synket via Excel, API eller MCP.
Annonser opprettet av en ansatt gjennom veiviseren i Kaupet har ikke dette
feltet og vises derfor ikke her.

## Eksempler (curl)

Sett `KAUPET_API_KEY` til nøkkelen din.

**Opprett/oppdater én annonse:**

```bash
curl -X PUT "https://kaupet.no/api/v1/listings/SKU-1042" \
  -H "Authorization: Bearer $KAUPET_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "sykler",
    "title": "Rød hybridsykkel",
    "description": "Lite brukt hybridsykkel med gode bremser og nylig service.",
    "price": 4500,
    "condition": "good",
    "images": ["https://dinbutikk.no/bilder/sku-1042-1.jpg"]
  }'
```

**Valider uten å lagre (`dryRun`):**

```bash
curl -X PUT "https://kaupet.no/api/v1/listings/SKU-1042?dryRun=true" \
  -H "Authorization: Bearer $KAUPET_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "category": "sykler", "title": "x", "description": "for kort", "price": 100 }'
```

**Batch, flere annonser samtidig:**

```bash
curl -X POST "https://kaupet.no/api/v1/listings/batch" \
  -H "Authorization: Bearer $KAUPET_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "upsert",
    "rows": [
      { "externalRef": "SKU-1", "category": "sykler", "title": "...", "description": "...", "price": 1000 },
      { "externalRef": "SKU-2", "category": "sykler", "title": "...", "description": "...", "price": 2000 }
    ]
  }'
```

**Fornye lageret uten å sende alt innholdet på nytt:**

```bash
curl -X POST "https://kaupet.no/api/v1/listings/renew" \
  -H "Authorization: Bearer $KAUPET_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "externalRefs": ["SKU-1", "SKU-2"] }'
```

**Sett status til solgt:**

```bash
curl -X POST "https://kaupet.no/api/v1/listings/SKU-1042/status" \
  -H "Authorization: Bearer $KAUPET_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "status": "sold" }'
```

**Hent status og bildejobber for én annonse:**

```bash
curl "https://kaupet.no/api/v1/listings/SKU-1042" \
  -H "Authorization: Bearer $KAUPET_API_KEY"
```

## MCP (for AI-agenter/LLM-klienter)

**`POST /api/mcp`** er en [MCP](https://modelcontextprotocol.io)-server (Model
Context Protocol) over samme tjenestelag som REST-API-et over — samme
API-nøkkel, samme scope/rategrenser, samme forretningsregler (idempotens,
kategorivalidering, fornyelse, bildekø). Bruk denne når en LLM-klient
(Claude Desktop, Claude Code, andre MCP-verktøy) skal opprette/vedlikeholde
annonser på vegne av deg, i stedet for å implementere REST-kallene selv.

- **Transport**: «Streamable HTTP», **stateless** — ingen sesjon
  (`Mcp-Session-Id`) å opprette/gjenbruke, og alltid ett enkelt JSON-svar
  (ikke SSE). `GET`/`DELETE` gir `405` (ingen strøm å åpne, ingen sesjon å
  avslutte).
- **Autentisering**: samme `Authorization: Bearer kpt_live_…`-header som
  REST-API-et, sendt på **hvert** kall (også `initialize`) — det finnes ingen
  egen MCP-innlogging/OAuth i v1. En manglende/ugyldig nøkkel gir `401` med
  `WWW-Authenticate: Bearer`, før JSON-RPC-meldingen i det hele tatt tolkes.
- **Scope/rategrense**: hvert verktøy krever samme scope som REST-endepunktet
  det speiler, og telles mot samme `read`/`write`/`batch`-bøtte (se
  verktøylisten under). Verktøyfeil — forretningsfeil, valideringsfeil,
  manglende scope, rategrensen nådd — kommer tilbake som et **`tools/call`-
  resultat med `isError: true`** og en norsk feiltekst (aldri som en
  JSON-RPC-protokollfeil), slik at en LLM-klient kan lese og resonnere over
  feilen direkte.

### Koble til fra en MCP-klient

**Claude Desktop / Claude Code** (`claude_desktop_config.json` eller
`.mcp.json`) — en HTTP-basert MCP-server med en fast header, ingen egen
prosess å starte:

```json
{
  "mcpServers": {
    "kaupet-proff": {
      "type": "http",
      "url": "https://kaupet.no/api/mcp",
      "headers": {
        "Authorization": "Bearer kpt_live_..."
      }
    }
  }
}
```

Bytt ut `kpt_live_...` med en nøkkel opprettet i **Bedriftskonsoll →
Integrasjoner** (se «Kom i gang» øverst i dette dokumentet — samme nøkler som
REST-API-et, ingen egen MCP-nøkkeltype).

### Verktøy

| Verktøy               | Scope             | Rategrense | Beskrivelse                                                                |
| --------------------- | ----------------- | ---------- | -------------------------------------------------------------------------- |
| `list_categories`     | `listings:read`   | `read`     | Alle kategorier (id, slug, navn, overkategori)                             |
| `get_category_fields` | `listings:read`   | `read`     | Felt/krav/tillatte verdier for en kategori                                 |
| `list_locations`      | `listings:read`   | `read`     | Organisasjonens lokasjoner                                                 |
| `list_listings`       | `listings:read`   | `read`     | Paginert liste over maskinelt opprettede annonser                          |
| `get_listing`         | `listings:read`   | `read`     | Én annonse, inkludert bildejobbstatus                                      |
| `validate_listing`    | `listings:write`* | `read`*    | Valider en annonse UTEN å lagre (dryRun) — se merknad under                |
| `upsert_listing`      | `listings:write`  | `write`    | Opprett/oppdater én annonse — se «Utkast som default» under                |
| `set_listing_status`  | `listings:write`  | `write`    | Sett status (`active`/`sold`/`archived`) — slik du PUBLISERER et utkast    |
| `renew_listings`      | `listings:write`  | `batch`    | Forny `expires_at` for en liste `externalRef`-er                           |
| `add_listing_images`  | `listings:write`  | `write`    | Erstatt hele bildesettet (URL-liste), asynkron behandling som i veiviseren |

`*` `validate_listing` krever `listings:write` (den kjører nøyaktig de samme
aktør-/kategori-/attributt-sjekkene som en ekte `upsert_listing`), men telles
mot den **lesegrensen**, ikke skrive-/batch-budsjettet — den skriver
ingenting (dryRun stopper før databasen endres), og en organisasjon skal
kunne validere så mye den vil uten å bruke av sitt langt strammere
skrive-budsjett.

Hvert verktøys fulle `inputSchema`/`outputSchema` (JSON Schema) fås fra en
`tools/list`-forespørsel mot serveren — de er konsistente med feltene/
grensene REST-et dokumenterer over (samme `category`/`title`/`description`/
`price`/… felt som `ListingBody` i `GET /api/v1/openapi.json`).

### Utkast som default (viktig sikkerhetsvalg)

`upsert_listing` er bevisst mer forsiktig enn REST-endepunktet når det
kommer til AI-agenter: en **NY** annonse opprettes som **utkast**
(`status: "draft"`, ikke synlig for kjøpere) med mindre kallet eksplisitt
sender `publish: true`. Dette hindrer at en agent ved en feil publiserer noe
til det offentlige markedet uten et bevisst valg fra kunden.

- En **eksisterende** annonse endrer aldri status implisitt — `upsert_listing`
  uten `status`/`publish` lar den beholde statusen den allerede har.
- Svarteksten fra `upsert_listing` sier alltid tydelig om annonsen ble
  opprettet som utkast eller publisert.
- For å publisere en annonse som ligger som utkast: kall `set_listing_status`
  med `{ "externalRef": "...", "status": "active" }`.
- `draft` kan **kun** settes ved opprettelse av en helt ny annonse (via
  `upsert_listing`/`validate_listing`, eksplisitt eller via default-en over)
  — akkurat som REST-et allerede krever at `sold`/`archived` bare kan settes
  på en annonse som finnes fra før, kan en eksisterende annonse ikke settes
  TILBAKE til utkast.

### Ikke støttet i v1

- **OAuth/dynamisk klientregistrering** — kun statiske API-nøkler
  (`Authorization: Bearer`), samme som REST-API-et. Ingen
  `.well-known/oauth-authorization-server`.
- **Sesjoner/SSE** — stateless, ett JSON-svar per kall. `Mcp-Session-Id`
  ignoreres om den sendes.
- **Batch-forespørsler på JSON-RPC-nivå** (en JSON-array med flere kall i
  samme HTTP-forespørsel) — send ett kall per HTTP-forespørsel. Skal du
  opprette/oppdatere mange annonser i ett kall, bruk REST-ets
  `POST /listings/batch` i stedet — det finnes ikke som eget MCP-verktøy i v1.
