# Staging-miljø

Endringer skal ikke testes direkte i produksjon. Push til `staging`-branchen for å deploye til en egen Cloudflare Worker (`kaupet-no-staging`) koblet til et eget Supabase-prosjekt, tilgjengelig på **https://staging.kaupet.no**.

Domenet ligger bak [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) — alle besøkende møter en innloggingsside (engangskode på e-post) før de når appen, uavhengig av appens egen autentisering. Kun e-postadresser på allowlisten i Access-policyen "Kaupet team" slipper gjennom. Legg til flere testere via Cloudflare Zero Trust-dashbordet → Access → Applications → Kaupet Staging.

Staging kjører mot et eget Supabase-prosjekt. Konfigurasjonen styres av et GitHub Environment kalt `staging`, med egne `vars` (`VITE_SUPABASE_*`) og `secrets` (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) — se `.env.staging.example` for full liste. Push til `staging`-branchen trigger CI, som bygger og kjører `bun run deploy` med `CLOUDFLARE_WORKER_NAME=kaupet-no-staging` mot denne separate workeren.

Server-side secrets (service role key, Vipps-test-nøkler, VAPID-nøkler, `PUBLIC_SITE_URL`) settes direkte på workeren med `wrangler secret put <NAVN> --name kaupet-no-staging`, siden de ikke bygges inn av CI slik `VITE_*`-variablene gjør. Domenet kobles via `wrangler.jsonc`/Cloudflare Workers custom domains, og Vipps-betalinger i staging skal alltid kjøre mot `VIPPS_ENVIRONMENT=test`.

Produksjon (`main`) er uberørt av dette — `deploy`-jobben der bruker fortsatt GitHub Environment `production` som før.

## Testing

- `bun run test` — kjører unittester (Vitest). Inngår i CI.
- `bun run test:e2e` — kjører Playwright-e2e-tester. Starter selv en lokal dev-server mot Supabase-prosjektet i din `.env` (krever `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, samme variabler som resten av appen bruker server-side, for å opprette en bekreftet testbruker). Ikke en del av vanlig CI; trigges manuelt via `workflow_dispatch` på `e2e`-jobben i `ci.yml`, som kjører mot staging-Supabase-prosjektet. **Forutsetning:** den jobben trenger en `SUPABASE_SERVICE_ROLE_KEY`-secret i GitHub Environment `staging` (ikke satt opp i dag — service role key ligger i dag kun på selve workeren, ikke som GitHub-secret. Legg den til manuelt i repo-innstillingene før jobben kan kjøre).
- `bun run test:rls` — kjører RLS-integrasjonstester mot en lokal Supabase-stack. Krever Docker:
  ```bash
  supabase start
  supabase status   # gir API URL, anon key og service_role key
  LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
  LOCAL_SUPABASE_ANON_KEY=... \
  LOCAL_SUPABASE_SERVICE_ROLE_KEY=... \
  bun run test:rls
  ```
  `src/lib/rls.integration.test.ts` er ett representativt eksempel (synlighet av samtaler/meldinger via RLS) — bruk samme mønster for å dekke flere policyer over tid.
