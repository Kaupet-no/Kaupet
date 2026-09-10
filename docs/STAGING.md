# Staging-miljø

Endringer skal ikke testes direkte i produksjon. Push til `staging`-branchen for å deploye til en egen Cloudflare Worker (`kaupet-no-staging`) koblet til et eget Supabase-prosjekt, tilgjengelig på **https://staging.kaupet.no**.

Domenet ligger bak [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) — alle besøkende møter en innloggingsside (engangskode på e-post) før de når appen, uavhengig av appens egen autentisering. Kun e-postadresser på allowlisten i Access-policyen "Kaupet team" slipper gjennom. Legg til flere testere via Cloudflare Zero Trust-dashbordet → Access → Applications → Kaupet Staging.

Staging kjører mot et eget Supabase-prosjekt. Konfigurasjonen styres av et GitHub Environment kalt `staging`, med egne `vars` (`VITE_SUPABASE_*`) og `secrets` (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ANDROID_GOOGLE_SERVICES_STAGING_JSON`) — se `.env.staging.example` for full liste. Android-secreten skal inneholde hele `google-services.json` fra Firebase-appen for pakken `no.kaupet.app.staging`; CI skriver den til `android/app/google-services.json` kun under staging-bygget. Push til `staging`-branchen trigger CI, som bygger og kjører `bun run deploy` med `CLOUDFLARE_WORKER_NAME=kaupet-no-staging` mot denne separate workeren.

Server-side secrets (`SUPABASE_SERVICE_ROLE_KEY`, Resend API key og avsender, Vipps-test-nøkler inkludert `VIPPS_TEST_WEBHOOK_SECRET`, Turnstile-secret, `RATE_LIMIT_HMAC_SECRET`, FCM service account, VAPID-nøkler og `PUBLIC_SITE_URL`) settes direkte på workeren med `wrangler secret put <NAVN> --name kaupet-no-staging`, siden de ikke bygges inn av CI slik `VITE_*`-variablene gjør. Domenet kobles via `wrangler.jsonc`/Cloudflare Workers custom domains, og Vipps-betalinger i staging skal alltid kjøre mot `VIPPS_ENVIRONMENT=test`. Produksjonens kategori-synk bruker kun `STAGING_SUPABASE_PUBLISHABLE_KEY` for å lese staging-data, aldri staging service-role.

Produksjon (`main`) bruker fortsatt GitHub Environment `production`, men kategorisynken på produksjons-Workeren har ingen staging service-role-nøkkel. Den bruker en staging publishable key med kun offentlige lesetilganger.

## Supabase Auth e-post

Flyttet til [EPOST.md](EPOST.md), sammen med resten av e-postlogikken —
avsenderdomene, Resend-oppsett, redirect-lista under **Authentication → URL
Configuration**, og applikasjonens egne varsel-e-poster. Staging og produksjon
er separate Supabase-prosjekter og må konfigureres hver for seg.

## Auth security (produksjon)

`supabase/config.toml` er kun lokal dev-config — de faktiske innstillingene
for staging/produksjon bor i Supabase-dashbordet (**Authentication →
Sign In / Providers → Email**) og kan ikke verifiseres fra repoet. Forvent
og hold disse verdiene i produksjon (se docs/SIKKERHETSVURDERING.md L-15):

- **`secure_password_change`: på.** Uten reauth ved passordbytte kan en
  kapret sesjon (stjålet token) endre passordet og låse ut den rettmessige
  eieren.
- **Turnstile-captcha: aktivert** for signup/passordtilbakestilling.
- **«Leaked password protection» (HIBP): på.**
- **`minimum_password_length`: minst 10** — matcher `passwordSchema` i
  `src/lib/auth-schemas.ts`.

## Testing

- `bun run test` — kjører unittester (Vitest). Inngår i CI.
- `bun run test:e2e` — kjører Playwright-e2e-tester selvforsynt mot en egen, midlertidig lokal Supabase-stack. Kommandoen leser lokale nøkler uten å overskrive `.env`, oppretter en bekreftet testbruker og deterministiske annonser, og fjerner stacken etterpå. Krever Docker; verken lokal kjøring eller CI berører utviklerens vanlige lokale database, delt staging-data eller eksterne secrets.
- `bun run test:rls` — kjører RLS-integrasjonstester mot en lokal Supabase-stack. Krever Docker:
  ```bash
  supabase start
  bun run test:rls  # leser lokale nøkler automatisk fra `supabase status`
  ```
  `src/lib/rls.integration.test.ts` dekker ~35 RLS-aktiverte tabeller/scenarioer (96 tester) — bruk samme mønster (service-role-oppsett, flere innloggede klienter, verifiser hvem som kan/ikke kan se og endre hva) for å utvide dekningen videre.
