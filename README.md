# Kaupet

Kaupet er en norsk markedsplass for brukte ting, uten sporende informasjonskapsler eller eksterne analyseverktøy. Det som kjøpes, selges eller søkes etter på Kaupet, blir ikke brukt til markedsføring eller profilering av brukerne. Sånn det burde være.

Dette repoet inneholder kode for Kaupet.no på web, Kaupet-appen på iOS og Android, og verktøy som gjør det enklere for bedrifter å administrere egne annonser.

[Ta en titt på Kaupet](https://kaupet.no) · [Bli med og bygg](CONTRIBUTING.md) · [Integrasjoner](docs/PROFF-API.md)

## Funksjoner

<<<<<<< Updated upstream
**Finn noe.** Bla gjennom annonser, bruk filtrene og lagre favoritter. Lagrede søk gjør det enklere å følge med på det du leter etter.

**Selg noe.** Legg til bilder, skriv litt om det du selger, og fyll inn opplysningene som passer. Blir du avbrutt, kan du fortsette fra et utkast senere.

**Spørr etter noe.** Finner du ikke det du trenger? Legg ut et kjøpsønske, så kan de som har det, finne deg.

**Snakk sammen.** Send en melding, still spørsmål og avtal videre med kjøper eller selger.
=======

**Søk og finn.** Bla gjennom annonser, søk med tekst eller med filtervalg. Lagrede søk gjør det enklere å følge med på det du leter etter. Søkemotoren identifiserer filter basert på ren tekst, slik at eksempelvis søket "under 3000kr" identifiseres som et prisfilter. Det kan også kombineres flere filter i samme søkestreng. Søket "Stasjonsvogn automat ikke el", tolkes som et søk i kategori Bil og oppretter filtre på karrosseritype, girkasse og filtrerer bort biler med el som drivstoff.

**Annonsér.** Last opp bilder og fyll inn opplysningene som passer. Annonseutkastet lagres, slik at du kan fortsette fra et utkast senere. Om ønskelig, kan Kaupet foreslå kategori, tittel og annonseinnhold basert på bildene som lastes opp.

**Kjøp.** Dersom du ikke finner en annonse for det du leter etter, kan du publisere en Ønskes kjøpt-annonse. Dersom noen publiserer en annonse som treffer kriteriene, varsles de med en gang. Selgeren kan se hvor mange som ønsker å kjøpe noe lignende i det annonsen opprettes.

**Chat.** Send en melding, still spørsmål og avtal videre med kjøper eller selger. Meldinger sorteres etter annonse, slik at det er enkelt å få oversikt over hvilke meldinger som hører til hvilke annonser.

> > > > > > > Stashed changes

Bedrifter kan bruke Kaupet Proff til å samarbeide om annonser. Har du allerede varene i et regneark eller et annet system, finnes det Excel-import, REST-API og MCP.

## Under panseret

<<<<<<< Updated upstream
Nettstedet og mobilappene deler brukerflyter og logikk. Capacitor kobler den felles applikasjonen til mobilfunksjoner på iOS og Android.
=======

Nettstedet og mobilappene deler brukerflyter og logikk. Kaupet-appen benytter Capacitor for å knytte web-applikasjonen til mobilfunksjoner på iOS og Android.

> > > > > > > Stashed changes

| Hva                             | Hva vi bruker                       |
| ------------------------------- | ----------------------------------- |
| Applikasjon                     | React, TypeScript og TanStack Start |
| Server                          | Cloudflare Workers                  |
| Database, innlogging og sanntid | Supabase                            |
| Bilder og opplastede filer      | Cloudflare R2                       |
| Mobilapp (iOS og Android)       | Capacitor                           |

<<<<<<< Updated upstream
Vil du vite hvordan delene henger sammen, les [arkitekturguiden](docs/ARCHITECTURE.md). [UI-guiden](docs/UI-GUIDE.md) beskriver hvordan grensesnittet skal fungere på store og små skjermer.
=======

Se [infrastrukturdokumentasjonen](docs/INFRASTRUKTUR.md) for mer detaljer.

> > > > > > > Stashed changes

## Kjør din egen kopi

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
