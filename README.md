# Kaupet.no

[![Lisens: AGPL-3.0](https://img.shields.io/badge/lisens-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/Kaupet-no/Kaupet/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaupet-no/Kaupet/actions/workflows/ci.yml)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-ff5f5f.svg?logo=ko-fi&logoColor=white)](https://ko-fi.com/sprudlevann)

**Kaupet.no** er en norsk markedsplass for kjøp og salg av brukte ting, bygget på **åpen** og **fri** kode.

![Kaupet.no — forsiden](docs/images/forside.png)

## Hva er Kaupet?

Kaupet er en alternativ markedsplass der det skal være enkelt å kjøpe, få, selge og gi bort brukte gjenstander.

Det som skiller Kaupet fra andre markedsplasser er hvordan den er bygget:

- **Ingen sporing.** Ingen tredjeparts analyseverktøy, ingen sporingsinformasjonskapsler, ingen adferds- eller markedsføringsdata å selge videre.
- **Personvern først.** Kaupet er bygget for å samle inn minst mulig informasjon om brukerne, og det som ikke samles inn kan heller ikke mistes, selges eller misbrukes. Se [personvernerklæringen](https://kaupet.no/personvern) og [behandlingsprotokollen](docs/PERSONVERN-BEHANDLINGSPROTOKOLL.md).
- **All kode er åpen.** Hele den produksjonssatte kildekoden ligger i dette repoet under [AGPL-3.0](LICENSE). Du kan lese den, kjøre den selv, endre den og distribuere den videre, så lenge endringene dine deles tilbake på samme vilkår.
- **Forbedringer kommer fellesskapet til gode.** Ingen unntak.

Kaupet finnes både som nettside og som app for iOS og Android.

## Funksjoner

### Søk du kan skrive med vanlige ord

Søkefeltet forstår hva du faktisk spør etter. Skriver du `elbil automat under 150000 kr`, plukker Kaupet ut drivstoff, girkasse og prisgrense som ekte filtre. Resten blir stående som fritekst.

![Søket tolker fritekst til filtre](docs/images/sok-tolkning.png)

Søket håndterer blant annet:

- **Egenskaper og synonymer** — `automat`, `hengerfeste`, `4x4` og lignende ord kobles til de riktige filterverdiene i kategorien.
- **Tall med enhet** — `under 150000 kr`, `over 100 hk`, `maks 12000 mil` blir til pris- og tallintervaller.
- **Kategorier og bilmerker** — skriver du et kategorinavn eller et merke, foreslår Kaupet å navigere dit i stedet for å bare søke på ordet.
- **Negasjon** — `sykkel unntatt elsykkel` fjerner treffene du ikke vil ha.
- **Alle tolkninger er synlige og kan fjernes.** Hver tolkning vises som en brikke du kan klikke bort — ingenting skjer i det skjulte.

I tillegg finnes et fullt filterpanel med kategori, tilstand, pris, kategorispesifikke felter, kart og stedssøk med radius (via OpenStreetMap), og «Alle filtre» for avanserte regler. Søk du bruker ofte kan du lagre under [Mine søk](https://kaupet.no/mine-sok) og få **varsel når det kommer nye annonser** som treffer.

Finner du ikke det du leter etter, kan du legge ut et **kjøpsønske** i stedet, med en annonse som beskriver hva du vil ha, slik at selgere kan finne deg.

### Annonseopprettelse med automatisk kategorigjenkjenning

Du starter med å skrive tittelen. Kaupet foreslår kategori automatisk:

1. Først brukes tidligere annonser: har nok folk plassert lignende titler i samme kategori, foreslås den direkte.
2. Mangler et treffsikkert historisk grunnlag, spør serveren en språkmodell (Mistral Small 4) om å velge kategori fra den faktiske kategorilisten. Svaret valideres mot ekte kategorier før det vises.

Kategorien styrer resten av flyten: hvilke steg du får, hvilke felter som er relevante, og hvilke verdier som kan velges. En sykkel spør om rammestørrelse, en bil om girkasse og kilometerstand. Underveis får du:

- **Automatisk lagring av utkast**, så du kan gå ut av flyten og fortsette senere.
- **Bilder med komprimering** i nettleseren før opplasting, og kamera direkte i appen.
- **Sted** valgt i kart (kart fra Kartverket) med den presisjonen du selv velger.
- **Gjennomgang før publisering**, der «Endre» tar deg til riktig steg og tilbake igjen uten å miste data.
- **Bot-beskyttelse** ved publisering (Cloudflare Turnstile).

### Kjøretøysoppslag mot Statens Vegvesen

Skal du selge et kjøretøy, skriver du registreringsnummeret. Kaupet henter dataene fra Statens vegvesens åpne Enkeltoppslag-API og fyller ut annonsen for deg:

- merke, modell, årsmodell og første registrering
- drivstoff, girkasse, effekt (hk), sylindre, slagvolum og motorkode
- hjuldrift, karosseritype, antall seter, farge og vekt
- hengerfeste, bruktimport og frist for neste EU-kontroll

Kjøretøygruppen fra Vegvesenet brukes til å velge riktig kategori i Kaupet (personbil, moped, campingvogn og så videre), slik at annonsen havner der kjøperne leter. Alt som hentes kan overstyres manuelt av brukeren før publisering.

For kjøretøy er det også mulig å ta opp en **360°-visning** ved å gå rundt kjøretøyet med telefonen, appen fanger bilder automatisk mens brukeren beveger seg, og kjøperen kan snurre kjøretøyet rundt i annonsen.

### Meldinger mellom kjøper og selger

Kontakt skjer inne i Kaupet. Ingen grunn til å dele telefonnummer eller e-postadresse med fremmede.

- Én samtale per annonse, med bilde, tittel og pris i innboksen.
- Uleste meldinger markeres, og lest-status ligger i databasen slik at den er lik på tvers av enheter.
- **Push-varsler** på web og i appen ved svar.
- **Blokkering** og rapportering av brukere.
- Når handelen er gjennomført kan selger markere annonsen som solgt, og partene kan **gi hverandre en vurdering**.

Du kan også dele en annonse med en **Kaupet-kode**. Dette er et åttesifret nummer som tar mottakeren rett til annonsen, praktisk å lese opp over telefon eller skrive på en lapp.

### App for iOS og Android

<img src="docs/images/app-hjem.png" alt="Forsiden i Kaupet-appen, med bunnavigasjon" width="320">

Appene deler kode med nettsiden, men er ikke en innpakket nettside: i native kjøring får du en egen layout med bunnavigasjon, egne sidetopper og native flyt for annonseopprettelse. Skallet er bygget med [Capacitor](https://capacitorjs.com), og oppførselen er native der det betyr noe:

- kamera og bildevalg, inkludert 360°-opptak av kjøretøy
- push-varsler for meldinger, lagrede søk og annen aktivitet
- haptisk tilbakemelding, dra-for-å-oppdatere og native navigasjon
- Android systemtilbake og iOS kantsveip følger samme historikk som knappene i appen
- respekterer safe area, skjermrotasjon og systemets tekststørrelse

Se [README-CAPACITOR.md](README-CAPACITOR.md) for hvordan du bygger appene selv.

## Slik kjører du prosjektet lokalt på din egen PC

Du trenger [Bun](https://bun.sh) installert.

```bash
git clone https://github.com/Kaupet-no/kaupet.git
cd kaupet
bun install
bun dev
```

Appen kjører deretter på `http://localhost:8080`.

### Miljøvariabler og lokal backend (Docker)

Backenden (database, auth, filer) leveres av Supabase. Du trenger derimot ikke tilgang til Kaupet sitt Supabase-miljø for å komme i gang. Det enkleste er å kjøre Supabase lokalt i Docker.

Krever [Docker](https://www.docker.com) og [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):

```bash
bunx supabase start   # starter hele Supabase-stacken lokalt (Postgres, Auth, Storage, Studio m.m.)
bun run env:local     # genererer .env med lokale Supabase-nøkler + tomme placeholders for resten
bun dev
```

`supabase start` drar opp en komplett, isolert Docker Compose-stack og kjører migrasjonene i [supabase/migrations](supabase/migrations) automatisk. Nøklene som settes i `.env` er Supabase sine offentlig kjente lokale dev-defaults. Funksjonalitet som er avhengig av tredjeparter (kjøretøyoppslag, AI-kategoriforslag, Vipps, Resend, push-varsler) vil ikke virke før du eventuelt fyller inn egne nøkler manuelt i `.env`.

Stopp stacken med `bunx supabase stop` når du er ferdig. Supabase Studio (lokalt admin-UI) er tilgjengelig på `http://localhost:54323`.

#### Alternativ: kjør mot et eksternt Supabase-prosjekt

Har du tilgang til et eget eller Kaupet sitt Supabase-prosjekt, kan du i stedet kopiere `.env.example` til `.env` og fylle inn verdiene direkte:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

## Teknologi som benyttes

- [TanStack Start](https://tanstack.com/start) (React 19, SSR) + Vite 8
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) komponenter
- [Supabase](https://supabase.com) — database, auth, storage, realtime og RLS
- [Cloudflare Workers](https://www.cloudflare.com/products/workers/) for hosting
- [Capacitor](https://capacitorjs.com) for native iOS og Android-app — se [README-CAPACITOR.md](README-CAPACITOR.md) for oppsett av native build
- [Statens vegvesen (Datautlevering)](https://www.vegvesen.no/om-oss/om-organisasjonen/apne-data/) for kjøretøyoppslag
- [Mistral Small 4](https://mistral.ai) for AI-basert kategoriforslag, som fallback når vote-basert forslag mangler treffsikker historikk
- [Vipps/MobilePay](https://vipps.no) for betaling av promoteringer, og [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) for bot-beskyttelse

Alle kall mot tredjeparter skjer server-side. Arkitekturen er beskrevet i [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Bidra

Vi tar gjerne imot bidrag — store og små. Les [CONTRIBUTING.md](CONTRIBUTING.md) for hvordan du kommer i gang, og [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for hvordan vi snakker sammen.

- Testing: `bun run test` kjører unittester. Se [docs/STAGING.md](docs/STAGING.md) for e2e-tester, RLS-tester og hvordan staging-miljøet fungerer, og [docs/TESTSTRATEGI.md](docs/TESTSTRATEGI.md) for teststrategien.
- Endringer testes aldri direkte i produksjon — push til `staging`-branchen for å teste på **https://staging.kaupet.no**. Detaljer i [docs/STAGING.md](docs/STAGING.md).

Funnet en sårbarhet? Se [SECURITY.md](SECURITY.md) — ikke åpne en offentlig issue.

## Lisens

Kaupet.no og tilhørende kildekode er lisensiert under [GNU Affero General Public License v3.0](LICENSE). Se [NOTICE](NOTICE) for hva det betyr i praksis — særlig at om du gjør endringer eller videreutvikler kildekoden, må du dele all kode tilbake til fellesskapet under samme vilkår. Dette gjelder også for SaaS-tjenester.
