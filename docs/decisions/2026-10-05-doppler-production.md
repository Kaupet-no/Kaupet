# Doppler for produksjon

## Status

Produksjonskonfigurasjonen `kaupet/prd` er fylt og kontrollert ved
tilbakelesing. GitHub production har et read-only `DOPPLER_TOKEN` avgrenset
til denne konfigurasjonen og dagens offentlige `VITE_VAPID_PUBLIC_KEY`.
Worker, Supabase Auth og de tre aktive jobbhemmelighetene er synket fra
Doppler. Separat lesekontroll passerer, og forsiden/sitemap svarer 200.
Den automatiske kodeflyten er aktivert på main: bootstrap, deploy og synk
bestod i [CI-kjøring 37524283187](https://github.com/Kaupet-no/Kaupet/actions/runs/37524283187).
Dette bekrefter deployflyten, ikke leverandørenes brukerreiser. Eldre kilder
beholdes til verifisering av overføring og tilbakeføring er fullført.

## Kilder og kontroller

- Gjeldende Supabase service-role ble hentet fra produksjonsprosjektet
  `efuexbrxdvjznrvoqbsd`, ikke fra den eldre verdien i `secrets/dev.env`.
- Supabase management-token ble hentet fra CLI-innloggingen og validert
  mot produksjonen etter uttrykkelig godkjenning.
- De tre aktive jobbhemmelighetene ble lest fra produksjonens `app_settings`
  og sammenlignet med `secrets/cloudflare.env`; alle tre matchet.
- Vipps, R2, Mistral, SVV og den eldre HF-nokkelen kommer fra
  `secrets/dev.env`. Brukeren bekreftet filen som produksjonskilde.
  Begge produksjonsbucketene svarte 200 pa HEAD, Mistral-modellisten
  svarte 200, og Vipps production/test autentiserte med 200 uten betalinger.
  SVV og HF er importert, men ikke funksjonstestet.
- VAPID-paret fra SOPS matcher klientnokkelen pa main. FCM-kilden i
  `secrets/staging.env` tilhorer Firebase-prosjektet `kaupet-no`, som
  produksjonsappens lokale Firebase-konfigurasjon bruker.
- Android- og iOS-Firebase-filene er importert fra lokale, gitignorede
  filer etter kontroll av prosjekt og pakke/bundle-ID `no.kaupet.app`.
- Turnstile ble hentet fra eksisterende produksjonswidget i Cloudflare.
  HMAC finnes ikke i de tilgjengelige SOPS-revisjonene; ny 256-bit nokkel
  er klargjort etter uttrykkelig godkjenning. Aktivering gir nye IP-hasher
  og nullstiller dermed de lopende IP-baserte rate-limit-vinduene.
- Resends 401 pa domenelesing skyldes en sending-only nokkel og er ikke
  bevis pa ugyldig autentisering. Sende-endepunktet aksepterte nokkelen og
  avviste tom mottakerliste med 422; ingen e-post ble sendt. Begge
  Supabase-miljoer bruker `ikkesvar@varsel.kaupet.no`. Brukerens nye, separate
  produksjonsnokkel erstatter den midlertidige delte nokkelen i prd og er
  synket til Worker og Supabase SMTP. Den nye nokkelen er kontrollert med
  samme tomme mottakerliste; ingen e-post ble sendt.

## Losning

Produksjonsdeployen bruker `scripts/doppler-production.sh`. Den henter bare
en eksplisitt liste fra `kaupet/prd`, validerer verdiene og kontrollerer
produksjonens jobb-URL-er, Auth-oppsett og VAPID-par for deploy.
Management-token og Cloudflare-token sendes aldri til Workeren.

Etter deploy synkes runtime-verdier til `kaupet-no`, SMTP/captcha til
Supabase Auth og delte jobbhemmeligheter til `app_settings`.
`API_KEY_EXPIRY_SECRET` er valgfri fordi den ikke var konfigurert ved
kartleggingen. Hvis den finnes i Doppler, valideres og synkes den ogsa.
Offentlig konfigurasjon beholdes i GitHub-vars.

Den manuelle workflowen `doppler-production.yml` tillater bare main og
deler concurrency-gruppe med produksjonsdeploy. `verify` leser
konfigurasjon og sammenligner databaseverdier; den kaller aldri jobber,
sender varsler eller utforer betalinger. Worker-secrets kan ikke leses
tilbake, og Supabase kan skjule Auth-hemmeligheter. Lesekontrollen beviser
derfor ikke at alle eksterne tjenester virker.

`scripts/doppler-native.sh` eksporterer en plattformspesifikk liste til
GitHub-miljoet med tilfeldige multiline-delimitere. Android-preview henter
bare Firebase-filen. Butikkjobbens signeringsnokler ma opprettes i prd
nar butikkkontoene er klare; disse fantes ikke i GitHub ved migreringen.
Staging-skriptet beholdes fordi staging-kontrollene utforer bildejobber.

## Gjenstår for verifisering

- Funksjonstest innlogging, e-post, push og relevante leverandører i lokalt
  testmiljø; lokale tester beviser ikke hosted konfigurasjon.
- Verifiser tilbakeføring og dokumenter overføringen før eldre kopier fjernes.
- Produksjonsrøyktest er avgrenset til repoets tillatte lesekontroller.

## Tilbakeforing

Gamle GitHub- og SOPS-kilder er beholdt. Reverter workflow-endringen for
a bruke tidligere deployflyt. HMAC-originalen kan ikke hentes tilbake;
behold den nye ved tilbakeforing. Synk til Auth, Worker og database er ikke
atomisk: feil krever at samme verdier synkes pa nytt til alle mottakere.

## Lokale kontroller

`python3 scripts/check-doppler-production.py` og
`python3 scripts/check-doppler-native.py` kjorer offline med falske HTTP-
og Wrangler-kall. De inngar i CI. `actionlint` validerer workflowene.
Ingen av disse kontrollene berorer produksjonen.

Produksjonens bootstrap, sync og separate verify passerer. Alle 24
administrerte runtime-bindinger finnes pa Workeren; Cloudflare skjuler
verdiene, sa direkte tilbakelesing er ikke mulig. Supabase-jobbenes verdier
matcher Doppler. API-et aksepterte Auth-oppdateringen, og captcha-aktivering
og avsender er bevart. Auth-hemmeligheter kan skjules som hash, sa direkte
samsvar kan ikke alltid bekreftes. Bare forsiden/sitemap er royktestet;
innlogging, faktisk e-postutsending, push, SVV og HF er ikke funksjonstestet.
