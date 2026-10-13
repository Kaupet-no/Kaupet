# Kaupet

Kaupet er en norsk markedsplass for brukte ting, uten sporende informasjonskapsler eller eksterne analyseverktøy. Det som kjøpes, selges eller søkes etter på Kaupet, blir ikke brukt til markedsføring eller profilering av brukerne. Sånn det burde være.

Dette repoet inneholder kode for Kaupet.no på web, Kaupet-appen på iOS og Android, og verktøy som gjør det enklere for bedrifter å administrere egne annonser.

[kaupet.no](https://kaupet.no) · [Bidra](CONTRIBUTING.md) · [Integrasjoner](docs/PROFF-API.md)

## Funksjoner

**Søk og finn.** Bla gjennom annonser, bruk filtrene og lagre favoritter. Lagrede søk gjør det enklere å følge med på det du leter etter. Søkemotoren identifiserer filter basert på ren tekst, slik at eksempelvis søket "under 3000kr" identifiseres som et prisfilter. Det kan også kombineres flere filter i samme søkestreng. Søket "Stasjonsvogn med automat ikke el", oppretter filtre på karrosseritype, girkasse og filtrerer bort biler med drivstoff el.

**Annonser.** Last opp bilder, skriv litt om det du selger, og fyll inn opplysningene som passer. Blir du avbrutt, kan du fortsette fra et utkast senere. Om ønskelig, kan Kaupet foreslå kategori, tittel og annonseinnhold basert på bildene som lastes opp.

**Kjøp.** Finner du ikke det du trenger? Legg ut et kjøpsønske, så kan de som har det, finne deg. Dersom noen publiserer en annonse som treffer kriteriene, varsles de med en gang. Selgeren ser allerede mens annonsen lages hvor mange som ønsker å kjøpe noe lignende.

**Chat.** Send en melding, still spørsmål og avtal videre med kjøper eller selger. Meldinger sorteres etter annonse, slik at det er enkelt å få oversikt over hvilke meldinger som hører til hvilke annonser.

Bedrifter kan integrere Kaupet med eksisterende lager- og ERP-systemer gjennom Kaupet Proff. Integrasjoner finnes gjennom Excel-import, REST-API og MCP for agentisk behandling av bedriftens egne annonser.

## Teknologi

Nettstedet og mobilappene deler brukerflyter og logikk. Kaupet benytter Capacitor for å knytte web-applikasjonen til mobilfunksjoner på iOS og Android.

| Funksjon                           | Løsning                             |
| ---------------------------------- | ----------------------------------- |
| Applikasjon                        | React, TypeScript og TanStack Start |
| Server                             | Cloudflare Workers                  |
| Database, autentisering og sanntid | Supabase                            |
| Bilder og brukeropplastede filer   | Cloudflare R2                       |
| Mobilgrensesnitt (iOS og Android)  | Capacitor                           |
| Push-varsler på mobil              | Firebase Cloud Messaging            |
| Epost-varsler                      | Resend                              |
| Bot-beskyttelse                    | Cloudflare Turnstile                |
| KI-funksjoner                      | Mistral AI                          |

Se [infrastrukturdokumentasjonen](docs/INFRASTRUKTUR.md) for mer detaljer.

## Kjør din egen kopi av Kaupet

Du trenger Bun, Node.js og Docker. Bun-versjonen står i `package.json`.

Kjør dette fra repoets rot:

```bash
bun install
bunx supabase start
bun run env:local
bun run dev
```

Din lokale versjon av Kaupet kan da nås på [localhost:8080](http://localhost:8080).

`env:local` lager en `.env` som peker mot den lokale Supabase-stacken. Har du en konfigurasjon du vil beholde, ta vare på den før du kjører kommandoen.

Betaling, e-post, bildelagring og andre eksterne tjenester trenger eget oppsett. Det finner du mer om i [infrastrukturdokumentasjonen](docs/INFRASTRUKTUR.md) og [veiledningen for hemmeligheter](secrets/README.md).

## Vil du bidra?

En liten rettelse er også et bidrag. Det samme er en god feilrapport eller et forslag som gjør Kaupet enklere å bruke.

Skal du endre kode, start med det som allerede finnes, og hold endringen til én ting om gangen. Les [bidragsveiledningen](CONTRIBUTING.md) før du åpner en pull request. Alle kodeagenter du benytter skal i tillegg lese [AGENTS.md](AGENTS.md).

Disse kontrollene kan være et lurt sted å begynne:

```bash
bun run lint
bunx tsc --noEmit
bun run test
bun run build
```

Endrer du hvem som får tilgang til data, eller en viktig brukerreise, kjør også de relevante testene nedenfor. Begge krever Docker:

```bash
bun run test:rls
bun run test:e2e
```

Usikker på hva du bør teste? [Teststrategien](docs/TESTSTRATEGI.md) hjelper deg å velge.

Pull requests går til `staging`. Alle endringer valideres i Staging før de slippes til i produksjon. Se [staging-veiledningen](docs/STAGING.md).

## Hvor finner jeg resten?

| Skal du …                                | Se her                                 |
| ---------------------------------------- | -------------------------------------- |
| Forstå hvordan komponenter henger sammen | [Arkitektur](docs/ARCHITECTURE.md)     |
| Jobbe med utseende og mobiltilpasning    | [UI-guide](docs/UI-GUIDE.md)           |
| Endre sider og navigasjon                | [Routing](src/routes/README.md)        |
| Jobbe med tjenester, miljøer og drift    | [Infrastruktur](docs/INFRASTRUKTUR.md) |
| Teste på staging                         | [Staging](docs/STAGING.md)             |
| Bygge mobilappene                        | [Capacitor](README-CAPACITOR.md)       |
| Koble Kaupet til et annet system         | [Proff-API og MCP](docs/PROFF-API.md)  |
| Jobbe med e-post-varsler og innlogging   | [E-post](docs/EPOST.md)                |

## Lisens og det formelle

Koden er lisensiert under [GNU AGPL v3](LICENSE).

Før bidrag kan merges med eksisterende grener, må du signere [Contributor License Agreement](CLA.md). Fremgangsmåten står i [bidragsveiledningen](CONTRIBUTING.md).
