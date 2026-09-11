# Sikkerhets- og sårbarhetsvurdering — Kaupet

**Opprinnelig vurdering:** 2026-09-02 · **Sist revidert:** 2026-09-09 · **Omfang:** hele repoet, inkludert applikasjonskode, 66 migrasjoner, effektiv lokal database, CI-workflows, native-prosjekter, secrets-oppsett og Git-historikk · **Metode:** manuell kodegjennomgang av tillitsgrenser, automatisert rekonstruksjon av RLS/RPC, dynamiske misbrukstester mot isolert lokal Supabase, avhengighetsrevisjon og konfigurasjonsgjennomgang.

> **Status:** Revisjonen 2026-09-09 nedenfor er gjeldende risikobilde og
> tiltaksplan. Resten av dokumentet bevares som historikk for vurderingen
> 2026-09-02 og implementeringen av dens funn. En tidligere markering som
> «fikset» er ikke nødvendigvis gjeldende dersom revisjonen har gjenåpnet
> kontrollen.

## Revisjon 2026-09-09

### Konklusjon

Sikkerhetsgrunnlaget er godt: alle 68 gjeldende `public`-tabeller har RLS,
ingen effektiv write-policy bruker et ubetinget `true`, gjeldende
`SECURITY DEFINER`-definisjoner setter `search_path`, service-role er
serverisolert, og auth-/adminvaktene er konsekvente.

Tiltakene under er implementert i kode og siste migrasjon `20260909120000`.
Produksjonsklare migrasjoner må kjøres før appkoden deployes. Gjenstående
driftsavhengigheter er eksplisitt listet under.

### Status etter implementering

| #    | Alvorlighet | Funn                                          | Status                                                 |
| ---- | ----------- | --------------------------------------------- | ------------------------------------------------------ |
| R-1  | Høy         | Direkte Data API omgår autoritative regler    | Lukket med kolonnegrants og serverfunksjoner           |
| R-2  | Høy         | Meldingsinnsetting kan forsterkes til push    | Lukket med service-only atomisk, ratebegrenset RPC     |
| R-3  | Høy         | Tunge RPC-er er direkte offentlige            | Lukket med service-only RPC-er og Worker-validering    |
| R-4  | Høy         | Vipps aktiveres før capture                   | Lukket; capture skjer før aktivering                   |
| R-5  | Høy         | GitHub Actions er ikke SHA-pinnet             | Lukket; alle workflow-actions er SHA-pinnet            |
| R-6  | Middels     | Dependency-advisories                         | Lukket; `bun audit --audit-level=high` er grønn        |
| R-7  | Middels     | Profilens systemfelt/avatar kan forfalskes    | Lukket med servermutasjoner og URL-prefix-validering   |
| R-8  | Middels     | Historisk søkestatistikk er anonymt lesbar    | Lukket; statistikk-tabeller er server-only             |
| R-9  | Middels     | Rate-limit-opprydding skanner per forespørsel | Lukket med indeks og separat daglig retention-funksjon |
| R-10 | Middels     | CSP er report-only/loggen er vilkårlig        | Lukket delvis; enforcement og feltbegrenset logging    |
| R-11 | Middels     | Native staging deler prod-identitet/regler    | Lukket delvis; eget app-ID og allowlist                |
| R-12 | Lav         | Rå DB-feil, URL-cache og brede grants         | Lukket for serverfunksjoner; klientlesing er uendret   |
| R-13 | Info        | Staging service-role på produksjons-Worker    | Lukket; synk bruker staging publishable key            |

Produksjon må sette `TURNSTILE_ALLOWED_HOSTNAMES` og
`RATE_LIMIT_HMAC_SECRET`. Staging må sette egne verdier og
`STAGING_SUPABASE_PUBLISHABLE_KEY`. `public/.well-known/assetlinks.json` er
fjernet fordi repositoryet ikke inneholdt produksjonens faktiske
signeringsfingeravtrykk; deploy må generere filen fra den verifiserte
release-sertifikatet før universal links aktiveres.

### R-1 — direkte mutasjoner omgår autoritative regler

`createListing` håndhever Turnstile, feltkrav og timegrense, men RLS
beskytter i hovedsak radidentitet, ikke kolonner eller kvoter. Dynamiske
tester med en vanlig lokal bruker viste:

- elleve aktive WTB-annonser kunne opprettes i ett Data API-kall selv om
  servergrensen er ti per time;
- en selger kunne nullstille administratorfeltet `hidden_from_home`;
- en selger kunne sette `expires_at` til år 2099;
- et listing-utkast kunne opprettes direkte uten serverfunksjonen.

Direkte opprettelse av en aktiv vanlig listing og `draft -> active` ble
blokkert med `permission denied for function
match_listing_to_saved_searches`. Dette er en tilfeldig konsekvens av en
triggergrant, ikke en eksplisitt publiseringsregel, og må ikke regnes som en
stabil sikkerhetskontroll.

Anbefalt grense:

- behold direkte Data API bare for enkle, idempotente lavkostoperasjoner som
  favoritter, lesemarkeringer og varslingspreferanser;
- bruk serverfunksjon eller avgrenset RPC for innhold, status, kvoter,
  systemfelter og eksterne sideeffekter;
- revoke direkte WTB-innsetting;
- bruk kolonnegrants og immutable-trigger på listing-systemfelter;
- kjør moderasjonskontroll ved enhver overgang til `active`.

### R-2 — meldinger kan gi kostnads- og varslingsforsterkning

Klienten skriver direkte til `messages`. Hver rad utløser
`dispatch_push_after_message_insert`, som starter `net.http_post` mot
Workerens push-dispatch. Worker-kallet gjør service-role-oppslag og kan sende
FCM eller Web Push. Det finnes ingen identifisert meldings-rate-limit.

Revoke direkte `INSERT` på `messages` og innfør en atomisk `sendMessage`-bane
med deltakerkontroll, blokkering/moderasjon, rate-limit og klientgenerert
idempotens-ID. Coalesce push per samtale slik at flere meldinger i et kort
intervall ikke lager ett eksternt kall per rad.

### R-3 — offentlig RPC-flate

Følgende kall returnerte HTTP 200 uten innlogging i lokal, ferdig migrert
Supabase:

- `rpc/wtb_match_count`
- `rpc/listing_filter_facet_counts`

Blant offentlig grantede funksjoner finnes også `compute_wtb_matches`,
`attribute_range_bounds`, `attribute_value_suggestions` og flere søke- og
forslagsfunksjoner. `compute_wtb_matches` itererer over aktive WTB-rader og
attributter; fasettfunksjonen bygger dynamisk SQL proporsjonalt med antall
fasettnøkler og aktive attributter.

Revoke `anon`/`authenticated` fra tunge RPC-er som allerede har en
server-wrapper. RPC-er som må være offentlige skal ha harde grenser på tekst,
JSON, nesting, arrays, fasettnøkler, resultater og statement-tid.

### R-4 — Vipps-capture er fail-open

Webhooken setter promotion til `active` før `captureVippsPayment`. Capture-
feil logges og ignoreres, og webhookhendelsen markeres deretter behandlet.
Samme rekkefølge finnes i avstemmingsfunksjonen.

Innfør `capture_pending`; aktiver bare etter bekreftet `CAPTURED`. Ikke sett
`processed_at` ved midlertidig leverandørfeil. Test timeout, avvisning,
duplikate webhooks og krasj mellom ekstern capture og lokal commit.

### R-5 og R-6 — leverandørkjede

21 `uses:`-referanser i workflows bruker flytende versjonstagger; bare to er
SHA-pinnet. Dette inkluderer Actions som kjører før deployhemmeligheter og en
Android-jobb med `contents: write`. Pin alle Actions til full commit-SHA,
sett `contents: read` som standard, og skill test fra publisering.

`bun audit --audit-level=high` feiler på:

- `js-yaml < 4.3.2`, låst til 4.3.1;
- `sharp < 0.35.4`, låst til 0.35.3.

Full audit rapporterer i tillegg to moderate Vitest-funn. Oppdater målrettet
til sikre minimumsversjoner og regenerer lockfilen.

### R-7 — profilfelter

En vanlig bruker kunne dynamisk sette `profiles.created_at` til år 2000 og
`avatar_url` til et eksternt sporingsdomene. Begrens oppdatering til
`display_name` og en validert avatarbane under brukerens storage-prefiks.
`created_at` og `deleted_at` skal være immutable for klientrollen.

### R-8 — historiske orddata

`listing_keyword_stats` og `listing_category_word_stats` er anonymt lesbare.
En dynamisk test viste at et unikt tittelord fortsatt var synlig som `anon`
med `listing_count = 0` etter at annonsen ble arkivert.

Revoke offentlig `SELECT`, bruk terskelstyrte RPC-er for forslag, slett
statistikkrader når telleren når null, og rydd eksisterende null- og
lavfrekvensrader. Applikasjonen har ingen direkte produksjonslesing av disse
tabellene, så offentlig tabelltilgang er ikke nødvendig.

### Andre åpne kontroller

- Flytt `endpoint_rate_limits`-opprydding ut av hver forespørsel, indekser
  `window_started_at`, og HMAC-pseudonymiser IP i stedet for usaltet SHA-256.
- Valider og rate-begrens CSP-rapporter, fjern URL-query/fragment, innfør
  nonce/hash og promoter CSP til enforcement.
- Aktiver tredjepartscookies bare i staging; gi staging egen app-ID og
  vertsallowlist; fjern debug-signing fallback og erstatt
  `SHA256_FINGERPRINT_HER` i `assetlinks.json`.
- Standardiser rå Supabase-feil til stabile klientfeilkoder.
- Nøkle private signed-URL-cacher på principal og tøm dem ved auth-endring.
- Bind Turnstile til forventet `action`, `hostname` og IP.
- Revoke unødvendige tabellprivilegier og legg en allowlist-test på effektive
  grants. Fire applikasjonsfunksjoner var fortsatt grantet til `PUBLIC`
  etter alle migrasjoner, men de sensitive funksjonene hadde interne
  rolle-/eierskapsvakter.

### Prioritert plan

#### P0 — før neste produksjonsdeploy

1. Lås listing-systemkolonner og statusoverganger.
2. Revoke direkte WTB- og meldingsinnsetting; innfør atomiske, rate-begrensede
   serverbaner.
3. Steng eller hardbegrens tunge offentlige RPC-er.
4. Gjør Vipps-capture fail-closed.
5. Oppdater sårbare pakker og SHA-pin GitHub Actions.

#### P1 — neste sprint

6. Begrens profil- og bildemetadata; håndhev storage-referanse og mengde.
7. Fjern offentlig historisk ordstatistikk og rydd restdata.
8. Reparer rate-limit-opprydding og IP-pseudonymisering.
9. Herd og håndhev CSP.
10. Skill native staging og produksjon.

#### P2

11. Saniter klientfeil og principalbind signed-URL-cache.
12. Bind Turnstile-responsen til handling og vert.
13. Fjern staging service-role fra produksjons-Worker.
14. Verifiser dashboardkontroller for Supabase Auth, Cloudflare WAF,
    GitHub environments og API-tokenomfang.

### Verifikasjon 2026-09-09

- `bunx tsc --noEmit` — bestått.
- `bun run lint` — bestått.
- `bun run check:server-boundary` — bestått.
- `bun run test` — 130 filer, 661 bestått, 1 hoppet over.
- `bun run test:rls` — 2 filer, 130 bestått.
- `bun run build` — bestått med bundlebudsjett.
- `bun audit --audit-level=high` — feilet med 2 high.
- Full `bun audit` — 2 high og 2 moderate.
- Alle 66 migrasjoner ble analysert; lokal effektiv database og grants ble
  inspisert.
- Git-historikkens tekstlige tillegg ble skannet uten bekreftet hemmelighet.
- Dynamiske testbrukere og rader ble slettet; lokal Supabase-stack ble
  stoppet. Staging og produksjon ble ikke berørt.

---

## Implementeringsstatus

Fikses steg for steg, én commit per funn, verifisert mot en lokal Supabase-stack der det er relevant.

| #    | Funn                                                  | Status                                    |
| ---- | ----------------------------------------------------- | ----------------------------------------- |
| K-1  | Betalingsmiljø nedgraderes via forfalsket cookie      | ✅ Fikset (`3e36c7a`)                     |
| K-2  | Storage-policyer ikke i versjonskontroll              | ✅ Fikset (`a59eb2e`)                     |
| H-3  | `pull_request_target` + `bun install` med scripts     | ✅ Fikset (`a584b80`)                     |
| M-4  | Ingen affiliasjonskontroll ved bedriftsregistrering   | ✅ Fikset (`ff38743`, minimumsvariant)    |
| M-5  | `organizations` lesbar for `anon` med `USING (true)`  | ✅ Fikset (`859d2e6`)                     |
| M-6  | CSP report-only uten rapportmottaker; mangler HSTS    | ✅ Fikset (`9f5de3a`, delvis — se notat)  |
| M-7  | Ingen serverside lengdegrense på tekstkolonner        | ✅ Fikset (`f66efcf`)                     |
| M-8  | Rate-limiting i minnet per Worker-isolate             | ✅ Fikset (`4cecf32`)                     |
| M-9  | Uautentiserte funksjoner mot betalte/tunge ressurser  | Gjenåpnet 2026-09-09 — direkte RPC-bypass |
| L-10 | Android `allowBackup="true"`                          | ✅ Fikset (`f878a97`)                     |
| L-11 | Maskert kontakt-e-post lekkes uautentisert            | ✅ Fikset (`700f389`)                     |
| L-12 | `listUserReviews` maskerer ikke slettede i hovedstien | ✅ Fikset (`057cb6c`)                     |
| L-13 | `getListingKaupetCodeById` omgår statusfilter         | ✅ Fikset (`287d161`)                     |
| L-14 | Rå databasefeil returneres til klienten               | ✅ Fikset (`059b8eb`, delvis — se notat)  |
| L-15 | Svak passordpolicy                                    | ✅ Fikset (`0aac05d`, delvis — se notat)  |
| L-16 | `@xmldom/xmldom` moderate advisory                    | ✅ Fikset (`6ddca58`)                     |
| I-17 | Stagings service-role-nøkkel på produksjons-Worker    | Ikke gjort — valgfritt, se notat          |

**Delvise fikser / bevisst ikke gjort:**

- **M-6:** `'unsafe-inline'` i `script-src` er ikke fjernet (krever per-request CSP-nonce gjennom SSR-rendringen); promotering til enforcement venter på stille produksjonsrapporter.
- **M-9:** ~~Turnstile er ikke lagt til på `suggestCategoryForTitle`~~ — lukket 2026-09-09: AI-stien er skilt ut av det automatiske kallet. `suggestCategoryForTitle` gjør nå kun det interne stemmeoppslaget (ingen Mistral, ingen kostnad per tastetrykk), mens hvert eksterne KI-kall ligger bak `suggestCategoryForTitleWithAi` / `suggestListingFromPhotos` med Turnstile-verifisering før rate limiter og leverandør. Se notatet under M-9 nedenfor.
- **L-14:** `toClientError()` er kun brukt på de tre eksemplene funnet nevner (`saveDraftListing`, `createBlock`, `createPromotionCheckout`). Resten av `throw error`-forekomstene i handlers gjenstår — funnet selv foreslår inkrementell utrulling.
- **I-17:** urørt. Å flytte til en dedikert read-only Postgres-rolle eller en manuell `workflow_dispatch`-jobb er en infrastrukturendring mot en levende staging-database, forskjellig fra kodeendringene i resten av lista — bør gjøres bevisst, ikke som del av denne gjennomgangen.

**Historisk verifisering 2026-09-02:** alle daværende DB-migrasjoner ble kjørt mot en lokal Supabase-stack med grønne tester og audit. Gjeldende verifikasjon og avvik står i revisjonen 2026-09-09 ovenfor.

---

## Sammendrag

Sikkerhetsgrunnmuren er god: RLS er aktivert på samtlige 65 tabeller, alle 154 `SECURITY DEFINER`-funksjoner setter `search_path`, CSRF-, request-størrelse- og IP-ban-middleware ligger i `src/start.ts`, Vipps-webhooken verifiserer HMAC i konstant tid og feiler lukket, push-dispatch bygger alt innhold fra autoritative DB-rader, det finnes ingen `dangerouslySetInnerHTML`/`innerHTML`/`eval` i produksjonskoden, e-postmaler escaper all brukerinput, open redirect er håndtert og testet, og CI kjører CodeQL pluss et blokkerende `bun audit --audit-level=high`.

De alvorlige funnene ligger i tre klart avgrensede områder:

1. **Betalingsmiljøet velges ut fra en cookie klienten selv kan sette** — gir gratis annonsefremheving i produksjon.
2. **Storage-policyene for fire buckets finnes ikke i repoet** — den faktiske tilgangskontrollen for private bilder og chat-vedlegg er ikke reviewbar og ikke testet.
3. **En `pull_request_target`-workflow med skrivetilgang kjører `bun install` med lifecycle-scripts** på innhold fra en PR.

| #    | Funn                                                                  | Alvorlighet |
| ---- | --------------------------------------------------------------------- | ----------- |
| K-1  | Betalingsmiljø nedgraderes til Vipps test via forfalsket cookie       | **Kritisk** |
| K-2  | Storage-policyer for fire buckets er ikke i versjonskontroll          | **Høy**     |
| H-3  | `pull_request_target` + `contents: write` + `bun install` med scripts | **Høy**     |
| M-4  | Ingen affiliasjonskontroll ved bedriftsregistrering                   | Middels     |
| M-5  | `organizations` lesbar for `anon` med `USING (true)`                  | Middels     |
| M-6  | CSP er report-only uten rapportmottaker; mangler HSTS                 | Middels     |
| M-7  | Ingen serverside lengdegrense på klient-skrevne tekstkolonner         | Middels     |
| M-8  | Rate-limiting i minnet per Worker-isolate                             | Middels     |
| M-9  | Uautentiserte serverfunksjoner mot betalte/tunge ressurser            | Middels     |
| L-10 | Android `allowBackup="true"` med sesjonstokens i WebView              | Lav         |
| L-11 | Maskert kontakt-e-post lekkes til uautentisert oppslag                | Lav         |
| L-12 | `listUserReviews` maskerer ikke slettede profiler i hovedstien        | Lav         |
| L-13 | `getListingKaupetCodeById` omgår statusfilter uten auth               | Lav         |
| L-14 | Rå databasefeil returneres til klienten                               | Lav         |
| L-15 | `secure_password_change = false` / svak passordpolicy                 | Lav         |
| L-16 | `@xmldom/xmldom` moderate advisory (byggtid)                          | Lav         |
| I-17 | Stagings service-role-nøkkel bor på produksjons-Workeren              | Info        |

---

## K-1 — Betalingsmiljø kan nedgraderes til Vipps test via forfalsket cookie

**Alvorlighet: Kritisk (økonomisk tap i produksjon)**

**Hvor:** `src/lib/env.server.ts:13`, `src/lib/vipps.server.ts:43`, `src/lib/test-mode.functions.ts:30`, `src/lib/promotions.functions.ts:21,189`

**Hva:** `getRequestIsTest()` returnerer `true` hvis forespørselen har cookien `kaupet_test_mode=1`. Cookien settes av `setTestMode`, som riktignok krever rollen `admin` eller `demo` — men cookien er `httpOnly: false`, den er ikke signert, og serveren validerer aldri verdien mot noe. Autorisasjonen i `setTestMode` er dermed rent dekorativ: hvem som helst kan sette cookien selv.

`hostAwareEnv()` i `vipps.server.ts:43` bruker denne verdien til å velge mellom `api.vipps.no` (produksjonsnøkler, ekte MSN) og `apitest.vipps.no` (test-nøkler, testpenger).

**Utnyttelse (uautentisert oppsett, deretter en vanlig innlogget bruker):**

1. På `kaupet.no`: `document.cookie = "kaupet_test_mode=1; path=/"`.
2. Kjøp fremheving. `createPromotionCheckout` → `createVippsPayment` → `hostAwareEnv` ser cookien → betalingen opprettes i Vipps **testmiljø**.
3. Betal med Vipps testapp (ingen ekte penger).
4. Retur til `/bekrefter/:id` → `reconcilePromotionPayment`. Nettleseren sender samme cookie, så `getVippsPayment` spør igjen testmiljøet, får `AUTHORIZED`, og raden i `listing_promotions` settes til `active` med full varighet.

Resultat: betalte fremhevinger gratis, i produksjon, uten admin-rolle.

**Forsterkende svakhet:** en `listing_promotions`-rad lagrer ikke hvilket miljø betalingen tilhører. `reconcilePromotionPayment`, `captureVippsPayment`, `refundVippsPayment` og webhook-håndtereren utleder miljøet på nytt fra den _inneværende_ forespørselen. Samme `vipps_reference` kan derfor behandles i to ulike miljøer avhengig av hvem som trigger den, og admin-refusjon (`adminRefundPromotion`) kan treffe feil miljø.

**Anbefalt løsning**

1. **Fjern cookien fra miljøvalget.** `hostAwareEnv()` skal bare se på `VIPPS_ENVIRONMENT` og `isTestHost(host)`. Dette er den korte, riktige fiksen og fjerner hele angrepsflaten.
2. **Persister miljøet på transaksjonen.** Legg til kolonnen `vipps_mode text not null check (vipps_mode in ('test','production'))` på `listing_promotions`, sett den i `createPromotionCheckout`, og la reconcile/capture/refund/webhook lese den kolonnen i stedet for å utlede miljø fra forespørselen.
3. **Hvis test-modus for demo-brukere skal beholdes** (den brukes også av `useIsTestEnv` til bannere i UI): gjør den serverautoritativ. Enten slå opp `user_roles` per forespørsel i stedet for å lese cookien, eller sett en signert cookie (`HMAC(secret, userId + utløp)`), `httpOnly: true`, og verifiser signaturen i `getRequestIsTest()`. Uansett skal en cookie aldri alene kunne endre hvilket betalings-API som brukes.
4. **Test:** en enhetstest på `hostAwareEnv` som setter `kaupet_test_mode=1` på en produksjonshost og fastslår `mode === "production"`, samt en test som fastslår at reconcile bruker den lagrede `vipps_mode`.

---

## K-2 — Storage-policyene for fire buckets finnes ikke i versjonskontroll

**Alvorlighet: Høy**

**Hvor:** `src/lib/storage.ts:79,121,199` (klientopplasting), `supabase/migrations/20260604073223_baseline_squash.sql:6730` og `20260809160000_messages_attachment.sql:7` (bucket-oppretting)

**Hva:** Bucketene `listing-images`, `avatars`, `listing-360-frames` og `message-attachments` opprettes i migrasjoner, men **ingen `storage.objects`-policyer for dem finnes i repoet**. Kun `organization-logos` har policyer (`20260901140000_business_accounts.sql:796–850`). Samtidig laster klienten opp direkte med brukerens egen nøkkel (`supabase.storage.from(...).upload(...)`) og signerer nedlastings-URL-er direkte (`createSignedUrls`) — begge deler krever at policyer _finnes_ i den kjørende databasen.

Konsekvenser:

- Den faktiske tilgangskontrollen for private annonsebilder, 360-bilder og **chat-vedlegg** er usynlig for kodegjennomgang, ikke dekket av `bun run test:rls`, og kan ikke gjenskapes i et nytt miljø. Kommentaren i `20260809160000_messages_attachment.sql:2` bekrefter at dette er bevisst, men konsekvensen er at et sikkerhetskritisk lag står utenfor den kontrollen resten av skjemaet har.
- Hvis policyene i produksjon følger det vanlige `bucket_id = 'message-attachments'`-mønsteret uten eier-predikat, kan enhver innlogget bruker signere URL-er til andres chat-vedlegg. Det er ikke mulig å avkrefte fra repoet.
- Bucketene mangler `file_size_limit` og `allowed_mime_types` (kun `organization-logos` har det). `validateImages` i `storage.ts:15` kjører kun i nettleseren og omgås trivielt ved å kalle Storage-API-et direkte.

**Anbefalt løsning**

1. Dump gjeldende policyer fra produksjon (`select * from pg_policies where schemaname='storage'`) og legg dem inn som en ny migrasjon, slik at de er reviewbare og reproduserbare. Rett samtidig opp eventuelle predikater som ikke binder mot eier/samtaledeltakelse — vedlegg bør kreve at `auth.uid()` er deltaker i samtalen `split_part(name,'/',1)` peker på, og annonsebilder at brukeren har lov å se annonsen (`can_view_organization_listing` finnes allerede).
2. Sett `file_size_limit` (5 MB) og `allowed_mime_types` (`image/jpeg,image/png,image/webp`) på alle fire bucketene, slik `organization-logos` allerede har.
3. Utvid `src/lib/rls.integration.test.ts` med samme opp-/nedlastingstester som allerede finnes for `organization-logos` (rundt linje 3908): eier kan laste opp og lese, utenforstående kan ikke, anonym kan ikke.

---

## H-3 — `pull_request_target` med skrivetilgang kjører `bun install` med lifecycle-scripts

**Alvorlighet: Høy (supply chain / CI)**

**Hvor:** `.github/workflows/dependabot-lockfile.yml:8,12,30`

**Hva:** Workflowen kjører på `pull_request_target` — altså i basisrepoets kontekst med et `GITHUB_TOKEN` som har `contents: write` — sjekker ut PR-ens head (`ref: ${{ github.event.pull_request.head.ref }}`) og kjører `bun install`. `bun install` kjører lifecycle-scripts fra avhengighetstreet, og repoet har allerede et `postinstall`-script.

Selv med `if: github.actor == 'dependabot[bot]'` er dette risikabelt: hele poenget med jobben er å installere en _nyoppgradert_ avhengighet, altså kode ingen har rukket å se på. Et kompromittert npm-pakkeslipp får dermed kjøre vilkårlig kode i en jobb som kan pushe til repoet.

**Anbefalt løsning**

1. Kjør `bun install --ignore-scripts`. Lockfile-generering trenger ikke lifecycle-scripts.
2. Flytt `permissions: contents: write` fra workflow-nivå til jobben, og behold ellers `permissions: {}` som standard.
3. Pin actions til commit-SHA i stedet for flytende tags (`actions/checkout@v7`, `oven-sh/setup-bun@v2`, `softprops/action-gh-release@v3`, `dorny/paths-filter@v4`).
4. Vurder å bytte `pull_request_target` mot en `workflow_run`- eller `schedule`-basert jobb som regenererer lockfilen uten å eksekvere PR-innhold i en privilegert kontekst.

---

## M-4 — Ingen affiliasjonskontroll ved bedriftsregistrering

**Alvorlighet: Middels (misbruk/omdømme)**

**Hvor:** `src/lib/business.functions.ts:207,282`, `supabase/migrations/20260902130000_organization_locations_and_billing.sql:512–528` (`handle_new_user`)

**Hva:** Registreringsflyten er: slå opp et hvilket som helst norsk organisasjonsnummer mot Enhetsregisteret (Turnstile-beskyttet), bind din egen e-postadresse til signup-tokenet, registrer deg — og `handle_new_user` gjør deg til `superuser` for organisasjonen. Ingenting knytter personen som registrerer seg til foretaket. Eneste beskyttelse er «førstemann til mølla»: `lookupBusinessOrganization` avviser organisasjoner som allerede er registrert.

Konsekvens: hvem som helst kan overta et hvilket som helst norsk foretaks identitet på Kaupet — publisere annonser under firmanavn, motta henvendelser, og få fakturaadressen satt til sin egen e-post.

**Anbefalt løsning**

Velg minst ett verifikasjonssteg før organisasjonen kan publisere under firmanavn:

- **Enklest:** send bekreftelseslenken til foretakets e-postadresse i Enhetsregisteret (hentes allerede av `fetchOrganizationFromBrreg`, men lagres ikke i dag), ikke til den selvvalgte adressen.
- **Sterkest:** Altinn-rolle eller BankID-basert signering av at brukeren kan representere foretaket.
- **Minimumsvariant hvis begge er for tunge:** la registreringen fullføre, men hold organisasjonen i status `unverified` — ingen offentlig branding, ingen annonser under firmanavn — inntil en manuell godkjenning i admin-panelet. `organizations` har allerede plass til et statusfelt, og `organization_has_proff_access` er et naturlig sted å håndheve det.

---

## M-5 — `organizations` er lesbar for `anon` med `USING (true)`

**Alvorlighet: Middels (forretningssensitiv eksponering)**

**Hvor:** `supabase/migrations/20260901140000_business_accounts.sql:283–286`

**Hva:** Policyen `organizations_public_select` gir `anon` og `authenticated` full radlesing på hele tabellen. Tabellen inneholder ikke bare offentlig branding, men også `selected_plan`, `proff_trial_started_at`, `proff_trial_ends_at`, `proff_trial_cancelled_at` og `proff_access_until`. Hvem som helst kan dermed hente ut hele kundelisten med abonnementsstatus, prøveperioder og oppsigelsestidspunkt for alle bedriftskunder.

**Anbefalt løsning**

Skill offentlig presentasjon fra kommersiell tilstand. Opprett et `security_invoker`-view `organizations_public` med kun `id, display_name, legal_name, organization_number, website_url, logo_path, brand_palette`, gi `SELECT` på viewet til `anon, authenticated`, og stram `organizations_public_select` til å kreve medlemskap (`is_organization_superuser` / aktiv `organization_members`-rad). Klientkoden som i dag leser `organizations` direkte (`src/routes/$kaupetCode.tsx:658`, `business-profile-form.tsx:90`) peker mot viewet i stedet.

---

## M-6 — CSP er report-only uten rapportmottaker, og planlagt enforcement har `'unsafe-inline'`

**Alvorlighet: Middels**

**Hvor:** `vite.config.ts:12–33`

**Hva:** Tre ting:

1. Policyen sendes som `content-security-policy-report-only`, men det er ingen `report-uri`/`report-to` i direktivlisten. Nettleseren har dermed ingen sted å sende rapporter — kommentarens plan om å «promotere til enforcement etter at produksjonsrapporter bekrefter kildeinventaret» kan aldri fullføres, fordi det aldri kommer rapporter.
2. `script-src` inneholder `'unsafe-inline'`. Hvis policyen promoteres som den er, gir den nesten ingen XSS-beskyttelse.
3. `Strict-Transport-Security` mangler helt i `SECURITY_HEADERS`.

Øvrige headere (`nosniff`, `SAMEORIGIN`, `referrer-policy`, `permissions-policy`, `frame-ancestors`, `form-action`, `object-src 'none'`) er riktige.

**Anbefalt løsning**

1. Legg til `Reporting-Endpoints: csp="/api/public/csp-report"` og `report-to csp` i policyen, med en enkel POST-rute som logger til `error_log` (eller til Cloudflare-loggen via `console.error`).
2. Erstatt `'unsafe-inline'` i `script-src` med en per-request nonce på de to inline-scriptene (`public/boot.js` er allerede en ekstern fil; JSON-LD og TanStack-bootstrap trenger nonce eller hash).
3. Legg til `"strict-transport-security": "max-age=31536000; includeSubDomains; preload"` og `upgrade-insecure-requests` i policyen.
4. Promoter til `content-security-policy` når rapportene er stille i et par uker.

---

## M-7 — Ingen serverside lengdegrense på klient-skrevne tekstkolonner

**Alvorlighet: Middels (misbruk/lagringskostnad)**

**Hvor:** `supabase/migrations/20260604073223_baseline_squash.sql:3734` (`messages`), `:3769` (`profiles`), `src/routes/_authenticated/meldinger.$id.tsx:772`

**Hva:** `messages.body` og `profiles.display_name` har ingen `CHECK`-constraint. Grensen på 4000 tegn er kun `maxLength` på et `<textarea>`. Meldinger settes inn direkte via `supabase.from("messages").insert(...)` mot PostgREST, altså utenom Workeren — så `requestBodyExceedsLimit`-middlewaren i `src/start.ts:44` gjelder ikke. En bruker kan legge inn vilkårlig store meldinger.

Det finnes heller ingen rate-limit på meldinger; banntriggerne (`baseline_squash.sql:2642`) hindrer bannlyste brukere, men ikke spam fra en vanlig konto. Til sammenlikning har annonseoppretting en grense (`assertUnderHourlyListingLimit`, `listings.functions.ts:191`).

**Anbefalt løsning**

1. Migrasjon med `ALTER TABLE public.messages ADD CONSTRAINT messages_body_length CHECK (length(body) <= 4000)` og tilsvarende `length(display_name) <= 50` på `profiles` (verdien matcher `signUpSchema` i `auth.tsx:64`). Rydd eventuelle eksisterende rader først.
2. Legg en `BEFORE INSERT`-trigger på `messages` som avviser mer enn N meldinger per bruker per minutt — samme mønster som de eksisterende rate-limit-RPC-ene (`log_product_event_rate_limited`).
3. Gå gjennom øvrige kolonner klienten skriver direkte via `supabase-js` og gi dem tilsvarende constraints; validering som bare finnes i UI er ikke validering.

---

## M-8 — Rate-limiting i minnet per Worker-isolate

**Alvorlighet: Middels**

**Hvor:** `src/lib/feedback.functions.ts:10–19`

**Hva:** `submitFeedback` og `submitCategorySuggestion` begrenses av et `Map` i modulscope: 5 innsendinger per nøkkel per time. På Cloudflare Workers har hver isolate sitt eget minne, isolates opprettes og resirkuleres kontinuerlig, og en angriper treffer i praksis stadig nye. Grensen er derfor nær virkningsløs. Kommentaren beskriver den som «good enough as abuse damping», men på denne kjøretidsmodellen er den det ikke.

(`tokenCache` i `vipps.server.ts` og `ipCache` i `start.ts` har samme egenskap, men de er rene ytelsescacher — der er per-isolate riktig og ufarlig.)

**Anbefalt løsning**

Flytt grensen til databasen, med samme mønster som allerede finnes og fungerer: en `SECURITY DEFINER`-RPC `log_feedback_rate_limited(_key_hash, ...)` som teller mot en tabell med `hashRequestIp()` som nøkkel — nøyaktig slik `log_product_event_rate_limited` og `log_listing_view_rate_limited` gjør det. Alternativt en Durable Object eller KV med TTL hvis DB-treffet er uønsket.

---

## M-9 — Uautentiserte serverfunksjoner mot betalte og tunge ressurser

**Alvorlighet: Middels (kostnad/tilgjengelighet)**

> **Status 2026-09-09 (delvis lukket):** KI-kallene ligger i egne
> POST-boundaries (`suggestCategoryForTitleWithAi`, `suggestListingFromPhotos`)
> som krever ferskt Turnstile-token, deretter `assertNotRateLimited`, og som
> respekterer kill-switchen `site_settings.category_suggestion_ai_enabled`.
> Aggregeringsendepunktene (`getAttributeValueSuggestions`,
> `getAttributeRangeBounds`, `suggestKeywordsForListing` og
> `getListingFacetCounts`) kaller service-only RPC-er og validerer input og
> Worker-rate-limit. Den gjenværende oppfølgingen er kostnadsgrense på Mistral.

**Hvor:** `src/lib/category-suggestion.functions.ts:16` → `src/lib/category-suggestion-ai.server.ts`, `src/lib/business.functions.ts:207`, `src/lib/attribute-suggestions.functions.ts:7`, `src/lib/attribute-bounds.functions.ts:8`, `src/lib/keyword-suggestion.functions.ts:4`

**Hva:**

- `suggestCategoryForTitle` er uten auth, uten Turnstile og uten rate-limit, og kaller ved lav treffsikkerhet Mistral (`api.eu.mistral.ai`) med en prompt som inneholder hele kategorilisten. Hvert kall koster penger. Et enkelt skript kan tømme MISTRAL-budsjettet.
- `lookupBusinessOrganization` er Turnstile-beskyttet, men `verifyTurnstileToken` (`turnstile.server.ts:8`) returnerer stille uten validering når `TURNSTILE_SECRET_KEY` mangler og `NODE_ENV !== "production"`. Verifiser at Worker-runtimen faktisk setter `NODE_ENV=production` — ellers er bot-beskyttelsen av. Hvert kall treffer i tillegg Brreg og skriver en rad i `business_signup_intents`.
- `getAttributeValueSuggestions`, `getAttributeRangeBounds` og `suggestKeywordsForListing` kjører service-role-aggregeringer over `listings` uten auth og uten grense.

**Anbefalt løsning**

1. Legg DB-basert IP-rate-limit (samme RPC-mønster som M-8; `hashRequestIp()` finnes allerede) foran alle fem endepunktene.
2. Krev Turnstile-token på AI-stien i `suggestCategoryForTitle` — den kalles fra en brukerhandling i annonsewizarden, så friksjonen er lav.
3. Legg en hard månedlig kostnadsgrense / kill-switch på `MISTRAL_API_KEY` (feature flag i `site_settings` som slår av AI-fallbacken).
4. Skriv en eksplisitt test på at `verifyTurnstileToken` kaster når secret mangler i produksjonsmodus.

---

## L-10 — Android `allowBackup="true"` med sesjonstokens i WebView

**Hvor:** `android/app/src/main/AndroidManifest.xml:4`

**Hva:** Supabase-sesjonen (access token + refresh token) lagres i WebViewens `localStorage` (`src/integrations/supabase/client.ts:23`). Med `allowBackup="true"` inngår WebView-data i Android auto-backup, som kan hentes ut via `adb backup` eller fra skyens sikkerhetskopi.

**Anbefalt løsning:** sett `android:allowBackup="false"`, eller behold backup men ekskluder WebView-data via `android:dataExtractionRules` (API 31+) og `android:fullBackupContent` (eldre).

---

## L-11 — Maskert kontakt-e-post lekkes til uautentisert oppslag

**Hvor:** `src/lib/business.functions.ts:24,56,229`

**Hva:** Når et organisasjonsnummer allerede er registrert, returnerer `lookupBusinessOrganization` en maskert e-postadresse til superbrukeren (`an***@ka***.no`). To tegn av lokaldel + to tegn av domene + TLD, kombinert med organisasjonsnummeret, er ofte nok til å gjette hele adressen. Endepunktet krever ingen innlogging.

**Anbefalt løsning:** fjern den maskerte adressen fra svaret og henvis kun til `kontakt@kaupet.no`. Hvis kontaktinformasjon er nødvendig for brukeropplevelsen, la support formidle den etter identitetskontroll.

---

## L-12 — `listUserReviews` maskerer ikke slettede profiler i hovedstien

**Hvor:** `src/lib/reviews.functions.ts:208`

**Hva:** Primærspørringen henter `reviewer:profiles!user_reviews_reviewer_id_fkey(id, display_name, avatar_url)` uten `deleted_at`, og maskerer derfor ikke slettede brukere. Fallback-stien (linje 240+) gjør det korrekt. Siden primærstien er den normale, vises slettede brukeres visningsnavn og avatar i vurderingslister — i strid med maskeringen `getPublicProfile` gjør, og med personvernminimeringen i `20260829170000_privacy_minimization_and_retention.sql`.

**Anbefalt løsning:** ta med `deleted_at` i join-utvalget og bruk samme maskering (`"Slettet bruker"`, `avatar_url: null`) i begge stiene — helst ved å trekke maskeringen ut i én delt hjelpefunksjon.

---

## L-13 — `getListingKaupetCodeById` omgår statusfilter uten auth

**Hvor:** `src/lib/listings.functions.ts:595`

**Hva:** Uautentisert serverfunksjon som slår opp `kaupet_code` med service-role for en vilkårlig `listing_id` — også utkast og deaktiverte annonser, som RLS ellers skjuler.

**Anbefalt løsning:** legg på `.eq("status", "active")`, eller krev auth og eierskap hvis funksjonen også må virke for utkast.

---

## L-14 — Rå databasefeil returneres til klienten

**Hvor:** gjennomgående, f.eks. `src/lib/listings.functions.ts:325`, `src/lib/blocks.functions.ts:74`, `src/lib/promotions.functions.ts:44`

**Hva:** Mange handlers gjør `throw error` med et rått PostgREST-feilobjekt. TanStack Start serialiserer det til klienten, som dermed får se constraint-navn, kolonnenavn og interne feilkoder. Bulk-importen viser hvordan det bør gjøres (`safeRowError`, `listing-bulk-import.functions.ts:56`).

**Anbefalt løsning:** én delt `toClientError(fnName, error)` som logger via `logServerError` og kaster en generisk, brukervennlig melding — med en eksplisitt hvitliste for de feilene som _skal_ nå brukeren (f.eks. `23505` → «finnes allerede»). Bruk den i alle `.handler`-blokker.

---

## L-15 — `secure_password_change = false` og svak passordpolicy

**Hvor:** `supabase/config.toml:182,185,228`, `src/lib/auth-schemas.ts:5`

**Hva:** Den lokale konfigurasjonen har `minimum_password_length = 6`, tomme `password_requirements`, `[auth.captcha] enabled = false` og `secure_password_change = false`. Dette er _lokal_ dev-config — produksjonsinnstillingene bor i Supabase-dashbordet og kan ikke verifiseres fra repoet. Men uten reauth ved passordbytte kan en kapret sesjon (stjålet token) endre passordet og låse ut den rettmessige eieren.

**Anbefalt løsning:** verifiser i produksjonsprosjektet at (a) `secure_password_change` er på, (b) Turnstile-captcha er aktivert, (c) «Leaked password protection» (HIBP) er på, og (d) `minimum_password_length` er minst 10 — og hev `passwordSchema` i `auth-schemas.ts` tilsvarende. Dokumentér de forventede produksjonsverdiene i `docs/STAGING.md` eller `AGENTS.md` slik at drift er reviewbart.

---

## L-16 — `@xmldom/xmldom` moderate advisory

**Status 2026-09-09:** `bun audit --audit-level=high` er grønn etter
oppgradering av Vitest/tooling og eksplisitt `js-yaml`-override. Eventuelle
resterende moderate advisories må følges ved neste Capacitor-oppgradering.

---

## I-17 — Staging service-role er fjernet fra produksjons-Workeren

**Status 2026-09-09:** `staging-client.server.ts` bruker
`STAGING_SUPABASE_PUBLISHABLE_KEY` og leser kun offentlige kategoridata.
Workflowen setter ikke lenger staging service-role som produksjonssecret.
Den nye publishable key-en må provisioneres før kategorisynken brukes.

---

Disse ble gjennomgått spesifikt og er i orden — verdt å vite hva som _ikke_ trenger oppmerksomhet:

- **RLS-dekning:** alle 65 tabeller har `ENABLE ROW LEVEL SECURITY`; ingen `DISABLE`. 121 aktive policyer. De 12 med `USING (true)` er alle `FOR SELECT` på offentlige oppslagsdata (kategorier, filtre, kjøretøymerker) — bortsett fra `organizations` (se M-5).
- **`SECURITY DEFINER`:** alle 154 funksjoner setter `SET search_path`. Konsekvent `REVOKE ALL ... FROM PUBLIC, anon` + eksplisitte `GRANT EXECUTE`.
- **Administrativ autorisasjon:** samtlige `admin*`-serverfunksjoner håndhever rolle, enten via `requireAdminRole`/`requireAdminOrModeratorRole`/`assertAdmin` i TypeScript eller via `has_role`-sjekk inne i RPC-en. Ingen hull funnet.
- **Vipps-webhook** (`src/routes/api/public/vipps/webhook.ts`): HMAC-SHA256 med `timingSafeEqual`, feiler lukket ved manglende secret, idempotens via `vipps_webhook_events`, og henter alltid autoritativ betalingstilstand fra Vipps i stedet for å stole på payloaden.
- **Push-dispatch** (`src/routes/api/public/push/dispatch.ts`): delt hemmelighet med `timingSafeEqual`, og all varselinnhold utledes fra DB — en forfalsket forespørsel kan ikke velge mottaker eller innhold.
- **XSS:** ingen `dangerouslySetInnerHTML`, `innerHTML`, `eval` eller `new Function` i produksjonskoden. E-postmaler escaper all interpolert brukerinput (`email-templates.ts:50`).
- **Open redirect:** `safeReturnTo` (`auth-return.ts:5`) avviser absolutte URL-er og protokollrelative stier, med test.
- **Bannlysing:** `is_user_banned`/`is_user_suspended` håndheves av `BEFORE INSERT`-triggere på `listings`, `conversations` og `messages` — også for serverfunksjoner som bruker service-role.
- **360-opptakstoken:** 24 tilfeldige bytes fra `crypto.getRandomValues`, TTL, engangsbruk, magic-byte-validering av opplastede bilder (`vehicle-360.functions.ts`).
- **Hemmeligheter:** `secrets/*.env` er SOPS/age-kryptert, `.env`/`.env.*.local` er gitignorert, og ingen nøkler eller `google-services.json`/`.p8`/`.pem` finnes i git-historikken.
- **Serverside/klientside-grense:** håndheves av `no-restricted-imports`, `check:server-boundary` og TanStack `importProtection` — `supabaseAdmin` kan ikke lekke inn i klientbundelen.
- **CI-sikkerhet:** CodeQL ukentlig og på PR, `bun audit --audit-level=high` som blokkerende steg, Dependabot for både npm og GitHub Actions.

---

## Oppfølging etter implementering

Før produksjonsdeploy:

1. Deploy migrasjon `20260909120000` via repoets Supabase-plugin og verifiser
   `bun run test:rls` mot en isolert staging-stack.
2. Sett `TURNSTILE_ALLOWED_HOSTNAMES` og `RATE_LIMIT_HMAC_SECRET` som
   Worker-secrets. Bruk separate verdier per miljø.
3. Sett `STAGING_SUPABASE_PUBLISHABLE_KEY` på produksjons-Workeren og fjern
   eventuell gammel `STAGING_SUPABASE_SERVICE_ROLE_KEY`.
4. Bygg staging `google-services.json` med klient-ID for
   `no.kaupet.app.staging`, og legg inn korrekt release-fingeravtrykk i
   `.well-known/assetlinks.json` før universal links aktiveres.

Etter deploy:

- Migrer SSR-inline-skript til nonce/hash og fjern `'unsafe-inline'` fra CSP.
- Verifiser Supabase-produksjonsinnstillingene i L-15: reauth ved
  passordbytte, captcha, HIBP-beskyttelse og minimumslengde.
- Behold database-lintens eksisterende false positive for
  `_category_id_map` dokumentert til CLI-en støtter temp-tabeller i
  `SECURITY DEFINER`-funksjoner.
