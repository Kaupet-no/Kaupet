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
se og endre hva. En delt `signInWithRetry`-hjelper (øverst i filen) legger på
backoff ved Supabase sin auth-rate-limit — bruk den (ikke en ny lokal
`signInWithPassword`-kall) i alle nye testgrupper, siden en full kjøring nå
gjør 70+ innlogginger i løpet av sekunder.

## Dekket (16 tabeller, verifisert 50/50 grønt mot staging 2026-08-02)

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
- `user_bans` / `user_suspensions` — rammet bruker ser egen sperre, ikke
  andres; kun admin kan sperre
- `ip_bans` — kun admin ser (via `has_role`-policyen); ikke-admin får tom
  liste (RLS-filtrert, ikke tilgangsfeil — se funn under)
- `reports` — hvem som helst kan sende inn egen rapport, ikke på andres
  vegne; ingen (heller ikke rapportøren) kan lese uten admin/moderator-rolle
- `listing_promotions` — kun eier/admin kan lese direkte (se funn under)
- `vipps_webhook_secrets` / `vipps_webhook_events` — bekreftet at ingen
  klientrolle (heller ikke admin) har noen GRANT på disse tabellene
- `listing_sales` — kun kjøper/selger ser handelen; ikke-deltaker kan ikke
  bekrefte salg på andres vegne; kun selger (ikke kjøper) kan angre
- `user_reviews` — alle autentiserte (og faktisk også anonyme, se funn
  under) kan lese; kun en reell part i et bekreftet salg kan opprette en
  anmeldelse, med riktig rolle (håndhevet av trigger)

## Funn fra testarbeidet (ikke bare testfiksinger)

1. **`listing_promotions` har mistet offentlig lesetilgang — bekreftet trygt.**
   Migrasjonen `20260608194322_32f4864e-8c38-4e30-9391-f950a86cc5f4.sql`
   dropper policyen `"Anyone can read active promotions"` uten erstatning.
   Kun eier/admin kan nå lese tabellen direkte — offentlig visning av
   "fremhevet"-status går via `get_featured_listing_ids()`-RPC-en (SECURITY
   DEFINER, bypasser RLS). **Oppfølging avsluttet** (`task_6c53cb70`,
   2026-08-02): frontend-koden bruker konsekvent denne RPC-en der
   fremhevet-status vises til besøkende — ingen direkte tabellspørring
   funnet som ville feilet stille. Ingen kodeendring nødvendig.
2. **`ip_bans`-policyen er en `FOR ALL`-policy, ikke "ingen tilgang".**
   Første antakelse (kun service-role) var feil — admins kan og skal lese
   tabellen direkte via `has_role(auth.uid(), 'admin')`. Ikke-admin får tom
   liste, ikke en tilgangsfeil (RLS default-deny, ingen matchende policy).
3. **Rate limiting er en reell begrensning for videre testarbeid.** Supabase
   sin auth-rate-limit på staging trigges ved ~14+ testgrupper i samme kjøring.
   `signInWithRetry`-hjelperen (backoff, 5 forsøk) løser dette for nå, men
   flere testgrupper i samme fil vil trenge enda mer backoff-margin —
   vurder å dele filen i flere test-filer per tabellgruppe hvis kjøretiden
   blir et problem (hver fil kan kjøres separat med `vitest run <fil>`).
   Ved 16 tabeller/50 tester tar en full kjøring nå ~38 sekunder.
4. **`user_reviews` fikk offentlig lesetilgang tilbake i en senere
   migrasjon.** Samme mønster som `profiles` (myk-sletting) — en
   mellomliggende innstramming (`20260605123044_*.sql`, til
   `TO authenticated`) ble reversert av en enda senere migrasjon
   (`20260610102257_*.sql`, tilbake til `USING (true)` + `GRANT ... TO anon`).
   Generell lærdom: **policyer for samme tabell/navn kan endres flere ganger
   på tvers av migrasjoner** — den kronologisk siste vinner, ikke den du
   fant først eller den som "høres mest riktig ut" for tabellens formål.

## Gjenstående — prioritert rekkefølge

### Middels prioritet

1. **`wtb_listings`** ("ønskes kjøpt"-annonser) — sannsynligvis lik
   `listings`-mønsteret (eier ser egne, andre ser kun aktive).
2. **`vehicle_brands` / `vehicle_models`** — offentlig lesbare, men
   pending-approval-verdier (opprettet via `createVehicleBrand`/
   `createVehicleModel` i `vehicle-confirm`-flyten) bør ikke være synlige/
   brukbare før godkjenning; verifiser denne statusovergangen.
3. **`admin_moderation_log`** — bør være admin/service-role-only (policy
   finnes: `"Admins and moderators read moderation log"`).
4. **`favorite_price_drops` / `favorite_sold_notifications`** — samme
   mønster som `saved_search_notifications` (varsler generert av triggere,
   ingen direkte klient-INSERT).

### Lav prioritet (mindre sikkerhetskritisk, men bør dekkes for fullstendighet)

5. `listing_images`, `listing_360_capture_sessions`, `listing_360_frames`
6. `listing_view_events` / `listing_views` / `search_query_stats` /
   `listing_keyword_stats` / `listing_category_word_stats` — stort sett
   analytics/telemetri, sjekk om de faktisk er lesbare av klienter
7. `categories` / `category_filters` / `category_flows` / `filter_synonyms`
   / `site_settings` / `app_settings` — offentlig lesedata, lite risiko,
   men verifiser at skriving er admin/service-role-only
8. `user_verifications`, `error_log`, `push_dispatch_failures`,
   `vipps_oauth_states`, `system_messages`

## Fremgangsmåte for neste økt

1. For hver tabell: `grep -n "CREATE POLICY\|DROP POLICY" supabase/migrations/*.sql | grep -i "on (public\.)?<tabell>"`
   for å finne gjeldende policyer. **Viktig lærdom fra to runder nå:** ikke
   bare se på første `CREATE POLICY` — sjekk om en senere migrasjon har
   `DROP POLICY`/`CREATE POLICY` for samme navn (policyer kan endres flere
   ganger på tvers av migrasjoner, siste vinner — skjedde med både
   `listing_promotions` og `user_reviews`), og les selve
   policy-definisjonen nøye (`FOR ALL` vs. `FOR SELECT`, hvem den faktisk
   gjelder for) i stedet for å anta ut fra tabellnavn/kontekst alene.
2. Skriv testgruppe(r) etter samme mønster som eksisterende (se
   `src/lib/rls.integration.test.ts`), og bruk `signInWithRetry`, ikke en ny
   lokal `signInWithPassword`.
3. Kjør `bunx tsc --noEmit` og `bunx eslint src/lib/rls.integration.test.ts`
   lokalt — kan verifiseres uten Supabase-tilkobling.
4. Commit + push til staging.
5. Be brukeren kjøre PowerShell-kommandoen over og rapportere resultatet
   tilbake (Claude Code kan ikke selv koble til staging-Supabase i denne
   økten — miljøets sikkerhetsklassifiserer blokkerer det).
6. Fiks eventuelle feil som dukker opp — vurder alltid om feilen er i testens
   antakelse (som med `ip_bans`/`listing_promotions`/`user_reviews` denne
   og forrige runde) eller et reelt RLS-hull, før du "fikser" ved å endre
   forventningen.
