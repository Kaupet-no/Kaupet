# Infrastruktur

Oversikt over hva Kaupet kjører på, hvor det kjører og hvordan delene henger
sammen. Dokumentet er **beskrivende**: det sier hva som finnes. Reglene for
hvordan kode skal bruke infrastrukturen står i
[ARCHITECTURE.md](ARCHITECTURE.md). Detaljer som allerede har et eget
dokument lenkes til i stedet for å gjentas:

- [STAGING.md](STAGING.md) — staging-miljøet, Cloudflare Access og Auth-innstillinger
- [EPOST.md](EPOST.md) — Resend, avsenderdomene og Supabase Auth-e-post
- [PROFF-API.md](PROFF-API.md) — det offentlige REST-API-et og MCP-serveren
- [secrets/README.md](../secrets/README.md) — SOPS/age-krypterte hemmeligheter
- [README-CAPACITOR.md](../README-CAPACITOR.md) — native bygg

Alt som ikke kan leses ut av repoet (dashbordinnstillinger, DNS, kontoeiere)
er merket **ikke i repoet**. Oppdater dokumentet i samme commit som
infrastrukturen endres.

## 1. Oversikt

```text
 Nettleser / iOS- og Android-app (Capacitor-WebView mot kaupet.no)
        │
        ▼
 Cloudflare (DNS, Workers, Turnstile, Access på staging)
        │
        ├── Worker kaupet-no / kaupet-no-staging  (TanStack Start via Nitro)
        │       ├── Supabase (Postgres, Auth, Realtime, RLS)
        │       ├── Cloudflare R2 (bilder, vedlegg) + Images-binding
        │       └── Eksterne API-er (Vipps, Resend, FCM, Mistral, SVV, …)
        │
        └── bilder.kaupet.no  (offentlig R2-bucket)

 Supabase pg_cron + pg_net ──► /api/public/* på Workeren (jobber og push)
```

## 2. Miljøer

|                    | Produksjon              | Staging                                           | Lokalt                                 |
| ------------------ | ----------------------- | ------------------------------------------------- | -------------------------------------- |
| Branch             | `main`                  | `staging`                                         | —                                      |
| Domene             | `kaupet.no`             | `staging.kaupet.no` (bak Cloudflare Access)       | `localhost:8080`                       |
| Worker             | `kaupet-no`             | `kaupet-no-staging`                               | Vite dev-server                        |
| Supabase-prosjekt  | `efuexbrxdvjznrvoqbsd`  | `zpazmwzhvylptptygzlw`                            | Lokal stack (`supabase start`, Docker) |
| R2-buckets         | Egne produksjonsbuckets | `kaupet-bilder-staging`, `kaupet-vedlegg-staging` | Staging-buckets (se merknad)           |
| Bildedomene        | `bilder.kaupet.no`      | `bilder.staging.kaupet.no`                        | Staging-domenet                        |
| Vipps              | Produksjon              | Alltid `VIPPS_ENVIRONMENT=test`                   | Test                                   |
| GitHub Environment | `production`            | `staging`                                         | —                                      |
| App-ID (native)    | `no.kaupet.app`         | `no.kaupet.app.staging`                           | —                                      |

Merknader:

- **Lokal utvikling skriver til ekte staging-objekter i R2.** `.env` peker på
  staging-buckets, så opplasting og sletting fra `bun run dev` treffer
  Cloudflare.
- `test.kaupet.no`: `src/components/test-env-gate.tsx` stenger hele siden for
  alle utenom demobrukere og administratorer når appen kjører på dette
  domenet. Domenet er et custom domain på produksjons-Workeren `kaupet-no`
  (produksjonsdatabasen, ikke staging), og har ingen Access-policy.
- `.env` sier ikke selv hvilket Supabase-prosjekt den peker på. Sjekk
  prosjektref-en i `SUPABASE_URL` før noe som skriver (se STAGING.md).

## 3. Cloudflare

### Workers

- Konfigurasjon: `wrangler.jsonc` (navn og bindinger). Nitro fyller inn
  `main`, `assets`, `compatibility_date` og `nodejs_compat` ved bygg, og
  `CLOUDFLARE_WORKER_NAME` overstyrer navnet for staging (se `vite.config.ts`).
- Bindinger: `IMAGES` (Cloudflare Images), brukt av
  `src/lib/image-compression.server.ts` kun for serverimporterte bilder
  (API/MCP/Excel). Vanlige bildeopplastinger og 360-opptak bruker
  klientkomprimering før R2-opplasting og kaller ikke Images, av kostnadshensyn.
  Serveren håndhever fortsatt tilgang, størrelse, filsignatur og kvoter.
  JPEG XL-støtte i Images er ikke forutsatt. `bun run dev` emulerer bindingen
  lokalt med Wrangler og `scripts/wrangler.images-dev.jsonc` for importflyten;
  produksjonsbygget beholder Workers-bindingen fra `wrangler.jsonc`.
- Logger: `wrangler tail --name <worker>`. Feil kastet i serverfunksjoner
  logges via `src/start.ts`.
- Custom domains kobles i Cloudflare-dashbordet (**ikke i repoet**).

### R2

| Bucket (prod / staging)                        | Tilgang                    | Innhold                             |
| ---------------------------------------------- | -------------------------- | ----------------------------------- |
| `R2_BILDER_BUCKET` / `kaupet-bilder-staging`   | Offentlig via bildedomenet | Annonsebilder, avatarer, 360-bilder |
| `R2_VEDLEGG_BUCKET` / `kaupet-vedlegg-staging` | Privat, presignerte URL-er | Meldingsvedlegg m.m.                |

Tilgang styres av serverfunksjonene, ikke av bucket-policyer. Sletting går
via en kø i databasen (`r2_delete_queue`) som tømmes av jobben
`r2-cleanup-hourly` (se § 5). Produksjonsbucketenes navn står i GitHub
Environment `production` som `vars` (**ikke i repoet**).

Standard opplastinger fra innloggede brukere (annonsebilder og miniatyrbilder,
avatarer, organisasjonslogoer/kontaktbilder og meldingsvedlegg) bruker en
atomisk databasekvote per bruker: maksimalt 500 objekter og 512 MiB til sammen
i et 24-timers vindu, med en ekstra grense på 60 forespørsler per minutt.
Kvoten reserveres etter tilgangskontroll og filsignaturkontroll, før objektet
sendes til R2; den belaster de faktiske opplastingsbytene. En mislykket
R2-skriving refunderes ikke. Filen må være maksimalt 5 MiB. Serveren bevarer
innsendt format og gjør ingen betalt transformasjon i disse flytene.
Kjøretøyenes 360-opplasting har en egen tokenbasert kvote og grense på 2 MiB.
Filsignaturkontroll beviser ikke at hele bildet er gyldig; dekoding og fjerning
av metadata håndheves ikke på serveren for direkte opplastinger.

Den eksisterende `r2-cleanup-hourly`-jobben sletter også standardopplastinger
fra `standard_upload_objects` når de er eldre enn 24 timer og ikke lenger er
referert i metadata. En ny registrering av et eksisterende `ready`-objekt
starter 24-timersfristen på nytt. Den sletter bare registrerte nøkler; eldre
R2-objekter uten registerrad skannes ikke. Slettefeil blir stående for retry
og manuell oppfølging etter 10 forsøk.

### Turnstile

Bot-beskyttelse på innlogging, registrering, publisering, bedriftsregistrering,
KI-forslag og andre handlinger som kan misbrukes (se kallene til
`verifyTurnstileToken`). Serververifisering i `src/lib/turnstile.server.ts`
mot `TURNSTILE_ALLOWED_HOSTNAMES`. Supabase Auth har også Turnstile-captcha på
for registrering og passordtilbakestilling (dashbordinnstilling, se STAGING.md).

### Access

`staging.kaupet.no` ligger bak Cloudflare Access (engangskode på e-post,
policy «Kaupet team»). Se STAGING.md. Unntak: `staging.kaupet.no/api/public`
har en egen Access-app med Bypass, slik at pg_net og webhooks når Workeren
(se § 5).

## 4. Supabase

- Postgres med RLS, Auth, Realtime (meldinger) og utvidelsene `pg_cron` og
  `pg_net`.
- Skjema: `supabase/migrations/` (append-only). Migrasjoner anvendes av
  Supabase sin GitHub-integrasjon ved push — **ikke** av en jobb i
  `.github/workflows/`. Kjør aldri `supabase db push` manuelt mot et lenket
  prosjekt.
- Klientrollene `anon` og `authenticated` beholder nødvendige DML-rettigheter
  for RLS, men skal ikke ha tabellprivilegiene `TRUNCATE`, `REFERENCES`,
  `TRIGGER` eller (fra PostgreSQL 17) `MAINTAIN`. Migrasjonen setter defaults
  for objekter opprettet av migrasjonsrollen `postgres`; objekter opprettet av
  andre roller via dashboard eller utenfor migrasjonene følger fortsatt deres
  egne default privileges og må kontrolleres separat.
- Auth-innstillinger (passordkrav, HIBP, captcha, redirect-URL-er, SMTP via
  Resend) ligger i dashbordet, se STAGING.md og EPOST.md.
- Sesjonen ligger i informasjonskapsler (`@supabase/ssr`). Nettleserklienten
  (`src/integrations/supabase/client.ts`) er sesjonsløs på serveren; serverkode
  som trenger brukerens sesjon bruker `getSupabaseServerClient()`
  (`session.server.ts`), som lager en ny klient per forespørsel. På Android må
  kapslene flushes eksplisitt (`src/lib/native-cookies.ts`).
- `site_settings` holder funksjonsbrytere som kan endres uten deploy, bl.a.
  `category_suggestion_ai_enabled`.
- `app_settings` holder URL-er og delte hemmeligheter for databasejobbene
  (§ 5).

Proff-integrasjoner har også atomiske dagskvoter per organisasjon: 1 000 nye
annonser og 2 000 nye bildejobber per UTC-døgn. Telleren økes bare ved faktisk
innsetting; oppdateringer, duplikater og omorganisering av eksisterende bilder
bruker ikke kvote, og sletting refunderer den ikke. Én ledger-rad per
organisasjon nullstilles ved første innsetting etter UTC-midnatt. Ved innføring
seedes dagens telling fra annonser, bildejobber og vellykkede importlogger som
fortsatt finnes; eldre slettinger og importlogger som senere ble skrevet om
kan ikke gjenopprettes. Migrasjonen må være anvendt før appkode som leser
`organization_daily_quotas` tas i bruk.

## 5. Planlagte jobber og webhooks

Alle jobber er `pg_cron`-jobber i Supabase. Jobber som trenger Workeren kaller
den med `pg_net` og en delt hemmelighet.

| Jobb                                       | Når            | Gjør                                                  |
| ------------------------------------------ | -------------- | ----------------------------------------------------- |
| `listing-image-jobs-every-minute`          | Hvert minutt   | Kaller `/api/public/images/process` (bildebehandling) |
| `expire-listing-promotions-hourly`         | Hver hele time | Avslutter utløpte promoteringer (kun SQL)             |
| `expire-old-listings-hourly`               | Hver hele time | Utløper gamle annonser (kun SQL)                      |
| `r2-cleanup-hourly`                        | :15 hver time  | Kaller `/api/public/r2/cleanup` (tømmer slettekøen)   |
| `purge-expired-accounts-daily`             | 03:00          | Sletter kontoer etter angrefristen (kun SQL)          |
| `privacy-retention-daily`                  | 03:30          | Sletter data etter lagringstiden (kun SQL)            |
| `endpoint-rate-limit-retention-daily`      | 03:45          | Rydder rate limit-tabellen (kun SQL)                  |
| `organization-api-key-expiry-notice-daily` | 07:20          | Kaller `/api/public/api-keys/expiry-notify`           |

I tillegg kaller databasetriggere `/api/public/push/dispatch` ved nye
meldinger og treff på lagrede søk og kjøpsønsker.

Tidspunktene er UTC (standard for `pg_cron`).

**URL-er:** hver dispatch-funksjon leser URL-en fra `app_settings`
(`image_jobs_url`, `r2_cleanup_url`, `push_dispatch_url`,
`api_key_expiry_url`). Det finnes **ingen fallback**
(`20260928130000_app_settings_url_uten_fallback.sql`). Mangler URL eller
hemmelighet, postes det ikke: push-triggerne (via `dispatch_push()`) skriver
en rad til `push_dispatch_failures`, og cron-funksjonene gir `RAISE WARNING`.
Alle miljø, **også produksjonen**, må derfor ha radene satt til sitt eget
domene. Radene settes manuelt i hvert miljø med SQL (ingen migrasjon eller
seed gjør det), og verdiene står **ikke i repoet**. Lokale stacker og
CI-stacker har ingen rader og poster derfor aldri.

Før 2026-09-28 falt funksjonene tilbake til `https://kaupet.no/...`. Det
gjorde at alle lokale stacker og CI-stacker postet push-kall til
produksjonen (175 avviste 401-kall på én uke i Workerens logger, `pg_net`
fra GitHub Actions-IP-er). Staging hadde i tillegg `push_dispatch_url` satt
til `test.kaupet.no`, som er et custom domain på **produksjons-Workeren**
`kaupet-no`.

**Cloudflare Access:** pg_net har ingen Access-legitimasjon. `staging.kaupet.no/api/public`
har derfor en egen Access-app med en Bypass-policy (endepunktene er beskyttet
av de delte hemmelighetene under). Uten den følger pg_net 302-en til Access
sin innloggingsside og lagrer den som **HTTP 200**, så `cron.job_run_details`
og `net._http_response` ser grønne ut selv om ingenting når Workeren.

**Feilsøking** (i SQL-editoren for riktig prosjekt, se STAGING.md for refs):

```sql
-- Hvilke rader er satt (skriv aldri ut hemmelighetene)
SELECT key, CASE WHEN key LIKE '%\_url' THEN value END AS url
FROM public.app_settings ORDER BY key;
-- Svar fra de siste ~6 timene (pg_net rydder eldre)
SELECT created, status_code, headers->>'content-type', left(content, 80)
FROM net._http_response ORDER BY created DESC LIMIT 20;
-- Push som ikke ble sendt
SELECT kind, error, created_at FROM public.push_dispatch_failures
ORDER BY created_at DESC LIMIT 20;
```

Et `text/html`-svar med «Cloudflare Access» i innholdet betyr at Access
stopper kallet. Et 401 betyr at hemmeligheten i `app_settings` ikke matcher
Worker-secreten.

**Status 2026-09-28** (verdiene kan ha endret seg siden):

| Rad / secret                                         | Staging                                     | Produksjon                     |
| ---------------------------------------------------- | ------------------------------------------- | ------------------------------ |
| `push_dispatch_url` / `_secret`                      | Satt (URL rettet fra `test.kaupet.no`)      | Satt                           |
| `r2_cleanup_url` / `_secret`                         | Satt                                        | Satt (URL lagt inn 2026-09-28) |
| `image_jobs_url` / `_secret`                         | Mangler                                     | Kun URL                        |
| `api_key_expiry_url` / `_secret`                     | Mangler                                     | Kun URL                        |
| Worker: `IMAGE_JOBS_SECRET`, `API_KEY_EXPIRY_SECRET` | Mangler (GitHub Environment-secret mangler) | Mangler                        |

**Bildejobber, kontroll 2026-09-29:** `IMAGE_JOBS_SECRET` er satt på begge
Workerne med samme verdi, lagret kryptert i `secrets/cloudflare.env`.
Staging-prosjektet `zpazmwzhvylptptygzlw` har både `image_jobs_url`
(`https://staging.kaupet.no/api/public/images/process`) og matchende
`image_jobs_secret`. Et autentisert kall mot staging-endepunktet svarte 200
med `claimed: 0` da køen var tom. Produksjonsprosjektet
`efuexbrxdvjznrvoqbsd` har korrekt `image_jobs_url`
(`https://kaupet.no/api/public/images/process`) og en `image_jobs_secret`
som matcher den krypterte kilden. Dette ble kontrollert lesende etter at
raden ble satt; produksjonsendepunktet ble ikke testet. GitHub
Environment-secret `IMAGE_JOBS_SECRET` er satt fra samme krypterte verdi i
både `staging` og `production`, og begge navnene er bekreftet i GitHub.

Bildejobbens kildehenting krever `EXTERNAL_IMAGE_ALLOWED_HOSTS` på Workeren
før funksjonen rulles ut i et miljø. Verdien er en kommaseparert liste med
eksakte ASCII/Punycode-vertsnavn for kilder Kaupet-operatøren har gjennomgått
og stoler på; wildcards, IP-adresser og ikke-standard porter støttes ikke.
Kall og omdirigeringer begrenses til HTTPS og disse vertene. Operatøren må
selv stole på DNS-oppsettet og kildevertene; applikasjonen gjør ingen
DNS-pinning eller DNS-forhåndskontroll. Manglende eller ugyldig policy gir
retry uten utgående kall. Sett samme policy lokalt i `.env` for bildejobber.

**Delte hemmeligheter** — samme verdi må ligge både som Worker-secret og som
`app_settings`-rad:

| Worker-secret           | `app_settings`-rad      | Endepunkt                            |
| ----------------------- | ----------------------- | ------------------------------------ |
| `IMAGE_JOBS_SECRET`     | `image_jobs_secret`     | `/api/public/images/process`         |
| `R2_CLEANUP_SECRET`     | `r2_cleanup_secret`     | `/api/public/r2/cleanup`             |
| `PUSH_DISPATCH_SECRET`  | `push_dispatch_secret`  | `/api/public/push/dispatch`          |
| `API_KEY_EXPIRY_SECRET` | `api_key_expiry_secret` | `/api/public/api-keys/expiry-notify` |

Øvrige offentlige endepunkter: `/api/public/vipps/webhook` (Vipps-callback,
signert med `VIPPS_WEBHOOK_SECRET`), `/api/public/csp-report`, `/api/v1/*`
(Proff-API) og `/api/mcp` (MCP-server).

## 6. Eksterne tjenester

Alle kalles kun fra serveren, med nøkler som Worker-secrets.

| Tjeneste                         | Brukes til                                                                                 | Nøkkel / konfigurasjon                                                                                 | Kode                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Vipps MobilePay (ePayment)       | Betaling for promoteringer                                                                 | `VIPPS_*`, `VIPPS_TEST_*`, `VIPPS_ENVIRONMENT`                                                         | `src/lib/vipps.server.ts`                  |
| Resend                           | Transaksjonell e-post og Supabase Auth-SMTP                                                | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                                                  | `src/lib/email.server.ts`, EPOST.md        |
| Firebase Cloud Messaging         | Push til Android og iOS                                                                    | `FCM_SERVICE_ACCOUNT_JSON`                                                                             | `src/routes/api/public/push/dispatch.ts`   |
| Web Push (VAPID)                 | Push i nettleseren                                                                         | `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                                                                   | samme                                      |
| Mistral AI (EU-endepunkt)        | Kategoriforslag fra bilder (Ministral 3 14B) og fra tittel i ønskes kjøpt (Ministral 3 3B) | `MISTRAL_API_KEY`, `MISTRAL_PHOTO_SUGGESTIONS_ENABLED`, `site_settings.category_suggestion_ai_enabled` | `src/lib/category-suggestion-ai.server.ts` |
| Statens vegvesen, Datautlevering | Kjøretøyoppslag på kjennemerke                                                             | `STATENS_VEGVESEN_API_KEY`                                                                             | `src/lib/vehicle/vehicle-lookup.server.ts` |
| Brønnøysundregistrene            | Oppslag av organisasjonsnummer                                                             | Ingen nøkkel                                                                                           | `src/lib/brreg.server.ts`                  |
| Nominatim (OpenStreetMap)        | Geokoding og omvendt geokoding                                                             | Ingen nøkkel                                                                                           | `src/lib/geocode.ts`                       |
| Kartverket                       | Kartfliser (`cache.kartverket.no`)                                                         | Ingen nøkkel                                                                                           | CSP i `src/lib/security-headers.ts`        |
| Cloudflare Turnstile             | Bot-beskyttelse                                                                            | `VITE_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`                                                      | `src/lib/turnstile.server.ts`              |

Web Push-endepunkter godtas bare fra Google FCM, Mozilla Autopush, Apple Push
og Windows Push (`fcm.googleapis.com`, `updates.push.services.mozilla.com`,
`*.push.apple.com`, `*.notify.windows.com`). Hver bruker kan ha maksimalt 20
push-enheter; fjern en gammel enhet i varselinnstillingene før en ny legges til.

Personopplysninger som sendes til tredjeparter står i
[PERSONVERN-BEHANDLINGSPROTOKOLL.md](PERSONVERN-BEHANDLINGSPROTOKOLL.md).

Produktanalyse sendes ikke til en tredjepart: hendelsene lagres i Supabase via
RPC-en `log_product_event_rate_limited` (`src/lib/product-analytics.functions.ts`).

## 7. Hemmeligheter og konfigurasjon

Tre steder, avhengig av hvem som trenger verdien:

1. **`VITE_*`** — bygges inn i klientbundlen og er offentlige. Kommer fra
   GitHub Environment `vars` ved bygg i CI.
2. **Worker-secrets** — server-only. CI setter R2-verdiene,
   `R2_CLEANUP_SECRET`, `IMAGE_JOBS_SECRET`, `API_KEY_EXPIRY_SECRET` og (i
   produksjon) `STAGING_SUPABASE_*` ved hver deploy. Alle andre
   (`SUPABASE_SERVICE_ROLE_KEY`, Vipps, Resend, Turnstile, FCM, VAPID,
   Mistral, SVV, `RATE_LIMIT_HMAC_SECRET`, `PUSH_DISPATCH_SECRET`,
   `PUBLIC_SITE_URL` m.fl.) er satt manuelt med
   `wrangler secret put <NAVN> --name <worker>`.
3. **`secrets/*.env`** — SOPS/age-kryptert i repoet, for lokal utvikling og
   som kilde til sannhet for staging og Cloudflare-tokenet. Se
   `secrets/README.md`.

Fullstendig liste over variabler med forklaring: `.env.example` og
`.env.staging.example`.

**Doppler-pilot (klargjort, ikke verifisert i staging):**
`.github/workflows/doppler-staging.yml` distribuerer manuelt kun
`MISTRAL_API_KEY` fra prosjekt `kaupet`, konfigurasjon `stg`, til
`kaupet-no-staging`. `DOPPLER_TOKEN` ligger i GitHub Environment `staging`.
Se [pilotbeslutningen](decisions/2026-10-01-doppler-staging-pilot.md) for
kjøring, verifisering og tilbakeføring.

## 8. CI/CD

Én workflow, `.github/workflows/ci.yml`, kjører på pull request og push mot
`main` og `staging`:

| Jobb              | Gjør                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `verify`          | Formatering, grensesjekker, RLS-tabellinventar, lint, typecheck, enhetstester med dekningskrav, bygg og røyktest i `workerd` |
| `rls`             | RLS-tester mot en midlertidig lokal Supabase-stack                                                                           |
| `native-android`  | Android-enhetstester og debug-APK                                                                                            |
| `e2e`             | Playwright mot egen lokal stack. Gater **ikke** deploy                                                                       |
| `staging-gate`    | På PR mot `main`: krever vellykket staging-deploy av samme innhold                                                           |
| `deploy-staging`  | Push til `staging`: bygger og deployer `kaupet-no-staging`                                                                   |
| `deploy`          | Push til `main`: bygger og deployer `kaupet-no`                                                                              |
| `android-release` | Push: legger Android-preview-bygg under GitHub Releases                                                                      |

I tillegg: `codeql.yml` (sikkerhetsskanning), `.github/workflows/release-native.yml`
(produksjonsutgivelser til butikkene, se § 9), og lokale hooks via
`lefthook.yml` (lint før commit, typecheck før push).

Android-preview gjenbruker én GitHub-release per branch. Tittel og beskrivelse
viser tidspunktet APK-en ble bygget i `Europe/Oslo`, og beskrivelsen lenker til
CI-kjøringen. GitHubs opprinnelige publiseringsdato for releasen blir stående.

## 9. Native apper

- Capacitor-skall rundt samme webapp. Produksjonsappen laster
  `https://kaupet.no` (`capacitor.config.ts`, `androidScheme: "https"`), så
  sesjonskapselen er same-origin. Staging-appen setter ikke `server.url`.
- Push: Firebase (`google-services.json` / `GoogleService-Info.plist`).
  Android-filene kommer fra GitHub-secretene `ANDROID_GOOGLE_SERVICES_JSON` og
  `ANDROID_GOOGLE_SERVICES_STAGING_JSON` i CI.
- Distribusjon: App Store og Google Play. `.github/workflows/release-native.yml`
  bygger produksjonsbygg og laster dem opp til Google Play (internal track)
  og TestFlight — trigges kun via `workflow_dispatch` eller et `v*`-tag, aldri
  på vanlige push/PR-er. Krever signeringssecrets i GitHub-miljøet
  `production` (se README-CAPACITOR.md § Publisering til butikkene); uten dem
  feiler jobben raskt med en tydelig feilmelding i stedet for å bygge
  usignerte/uferdige artefakter. Appens første release i hver butikk må
  fortsatt opprettes manuelt (dokumentert samme sted).
- App Links (`assetlinks.json`) er bevisst utsatt.

## 10. Ikke i repoet

Dette må slås opp i de respektive dashbordene:

- DNS og domeneregistrar for `kaupet.no` og underdomenene.
- Administratortilgang til Cloudflare, Supabase,
  Firebase, Apple Developer, Google Play Console, Vipps, Resend og Mistral.
- Supabase-planer, backup og point-in-time recovery.
- Verdiene i `app_settings` i hvert miljø.
