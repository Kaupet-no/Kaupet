# Staging-miljø

Endringer skal ikke testes direkte i produksjon. Push til `staging`-branchen for å deploye til en egen Cloudflare Worker (`kaupet-no-staging`) koblet til et eget Supabase-prosjekt, tilgjengelig på **https://staging.kaupet.no**.

Domenet ligger bak [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) — alle besøkende møter en innloggingsside (engangskode på e-post) før de når appen, uavhengig av appens egen autentisering. Kun e-postadresser på allowlisten i Access-policyen "Kaupet team" slipper gjennom. Legg til flere testere via Cloudflare Zero Trust-dashbordet → Access → Applications → Kaupet Staging.

Staging kjører mot et eget Supabase-prosjekt. Konfigurasjonen styres av et GitHub Environment kalt `staging`, med egne `vars` (`VITE_SUPABASE_*`) og `secrets` (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) — se `.env.staging.example` for full liste. Push til `staging`-branchen trigger CI, som bygger og kjører `bun run deploy` med `CLOUDFLARE_WORKER_NAME=kaupet-no-staging` mot denne separate workeren.

Server-side secrets (service role key, Vipps-test-nøkler, VAPID-nøkler, `PUBLIC_SITE_URL`) settes direkte på workeren med `wrangler secret put <NAVN> --name kaupet-no-staging`, siden de ikke bygges inn av CI slik `VITE_*`-variablene gjør. Domenet kobles via `wrangler.jsonc`/Cloudflare Workers custom domains, og Vipps-betalinger i staging skal alltid kjøre mot `VIPPS_ENVIRONMENT=test`.

Produksjon (`main`) er uberørt av dette — `deploy`-jobben der bruker fortsatt GitHub Environment `production` som før.

## Testing

- `bun run test` — kjører unittester (Vitest). Inngår i CI.
- `bun run test:e2e` — kjører Playwright-e2e-tester selvforsynt mot en egen, midlertidig lokal Supabase-stack. Kommandoen leser lokale nøkler uten å overskrive `.env`, oppretter en bekreftet testbruker og deterministiske annonser, og fjerner stacken etterpå. Krever Docker; verken lokal kjøring eller CI berører utviklerens vanlige lokale database, delt staging-data eller eksterne secrets.
- `bun run test:rls` — kjører RLS-integrasjonstester mot en lokal Supabase-stack. Krever Docker:
  ```bash
  supabase start
  bun run test:rls  # leser lokale nøkler automatisk fra `supabase status`
  ```
  `src/lib/rls.integration.test.ts` dekker ~35 RLS-aktiverte tabeller/scenarioer (96 tester) — bruk samme mønster (service-role-oppsett, flere innloggede klienter, verifiser hvem som kan/ikke kan se og endre hva) for å utvide dekningen videre.
