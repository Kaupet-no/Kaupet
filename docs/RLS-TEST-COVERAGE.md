# RLS-testdekning — status og gjenstående arbeid

Del av den bredere code assessment-planen (2026-08-01/02). Alle andre punkter i
planen er fullført og pushet til `staging`. Dette dokumentet sporer det ene
gjenstående punktet: å utvide `src/lib/rls.integration.test.ts` til å dekke
flere av de ~47 RLS-aktiverte tabellene i `supabase/migrations/`.

## Hvordan kjøre testene

Krever en dekryptert `secrets/staging.env` (`bun run secrets:decrypt:staging`)
eller en lokal Supabase-stack (`supabase start`, krever Docker).

```powershell
Get-Content .env.staging.local | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { $val = $matches[2].Trim('"'); Set-Item "env:$($matches[1])" $val } }; $env:LOCAL_SUPABASE_URL=$env:SUPABASE_URL; $env:LOCAL_SUPABASE_ANON_KEY=$env:VITE_SUPABASE_PUBLISHABLE_KEY; $env:LOCAL_SUPABASE_SERVICE_ROLE_KEY=$env:SUPABASE_SERVICE_ROLE_KEY; bun run test:rls
```

Testene oppretter ekte, midlertidige testbrukere (`rls-*-<timestamp>@example.com`)
og rydder dem opp i `afterAll`. Se eksisterende testgrupper i filen for mønsteret:
service-role-oppsett, to+ innloggede klienter, verifiser hvem som kan/ikke kan
se og endre hva.

## Dekket (9 tabeller, verifisert grønt mot staging 2026-08-02)

- `conversations` / `messages` — kun deltakere ser samtalen
- `listings` — eier ser egne draft/disabled, andre ser kun aktive; ikke-eier
  kan ikke oppdatere; eier kan ikke reaktivere admin-disabled annonse
- `profiles` — myk-slettet skjules for andre, eier ser fortsatt egen
- `favorites` — privat til eier
- `saved_searches` — privat til eier
- `saved_search_notifications` — kun eier ser; ingen direkte klient-INSERT
  (kun via SECURITY DEFINER-funksjon)
- `push_subscriptions` — privat til eier
- `notification_preferences` — privat til eier
- `user_blocks` — kun blokkerer ser blokkeringen; blokkert bruker skal ikke
  kunne oppdage den via direkte spørring

## Gjenstående — prioritert rekkefølge

### Høy prioritet (betaling og moderasjon — høyest risiko)

1. **`vipps_webhook_secrets` / `vipps_webhook_events`** — betalingsdata,
   sannsynligvis service-role-only med ingen klienttilgang i det hele tatt;
   verifiser at `authenticated`/`anon` ikke har noen grants.
2. **`listing_promotions` / `listing_sales`** — betalingsrelatert
   (fremhevede annonser, salgsbekreftelse). Sjekk `20260610102257_*.sql`
   for `listing_sales`-policyen nevnt i eksisterende migrasjonsgjennomgang.
3. **`user_bans` / `user_suspensions` / `ip_bans`** — moderasjon; bør
   sannsynligvis kun være lesbare av admin/service-role, ikke av vanlige
   brukere (heller ikke banned-brukeren selv).
4. **`reports`** — brukerrapporter av annonser/brukere; sjekk
   `20260628130000_listing_reports_moderator_policies.sql` for gjeldende
   policyer (moderator-tilgang er allerede migrert inn, verifiser med test).

### Middels prioritet

5. **`wtb_listings`** ("ønskes kjøpt"-annonser) — sannsynligvis lik
   `listings`-mønsteret (eier ser egne, andre ser kun aktive).
6. **`user_reviews`** — offentlig lesbar per migrasjon
   `20260610102257_*.sql` (`GRANT SELECT ... TO anon`), men verifiser at
   kun den faktiske kjøperen/selgeren i en fullført handel kan opprette en
   anmeldelse.
7. **`vehicle_brands` / `vehicle_models`** — offentlig lesbare, men
   pending-approval-verdier (opprettet via `createVehicleBrand`/
   `createVehicleModel` i `vehicle-confirm`-flyten) bør ikke være synlige/
   brukbare før godkjenning; verifiser denne statusovergangen.
8. **`admin_moderation_log`** — bør være admin/service-role-only.

### Lav prioritet (mindre sikkerhetskritisk, men bør dekkes for fullstendighet)

9. `listing_images`, `listing_360_capture_sessions`, `listing_360_frames`
10. `listing_view_events` / `listing_views` / `search_query_stats` /
    `listing_keyword_stats` / `listing_category_word_stats` — stort sett
    analytics/telemetri, sjekk om de faktisk er lesbare av klienter
11. `favorite_price_drops` / `favorite_sold_notifications` — samme mønster
    som `saved_search_notifications`
12. `categories` / `category_filters` / `category_flows` / `filter_synonyms`
    / `site_settings` / `app_settings` — offentlig lesedata, lite risiko,
    men verifiser at skriving er admin/service-role-only
13. `user_verifications`, `error_log`, `push_dispatch_failures`,
    `vipps_oauth_states`, `system_messages`

## Fremgangsmåte for neste økt

1. For hver tabell: `grep -n "CREATE POLICY\|DROP POLICY" supabase/migrations/*.sql | grep -i "on (public\.)?<tabell>"`
   for å finne gjeldende policyer (husk at policyer kan være endret i senere
   migrasjoner — bruk siste `CREATE POLICY` for et gitt policy-navn, ikke
   nødvendigvis den første).
2. Skriv testgruppe(r) etter samme mønster som eksisterende (se
   `src/lib/rls.integration.test.ts`).
3. Kjør `bunx tsc --noEmit` og `bunx eslint src/lib/rls.integration.test.ts`
   lokalt — kan verifiseres uten Supabase-tilkobling.
4. Commit + push til staging.
5. Be brukeren kjøre PowerShell-kommandoen over og rapportere resultatet
   tilbake (Claude Code kan ikke selv koble til staging-Supabase i denne
   økten — miljøets sikkerhetsklassifiserer blokkerer det).
6. Fiks eventuelle feil som dukker opp (som regel enten en feil i testen
   selv, eller et reelt funn — begge er verdifulle).
