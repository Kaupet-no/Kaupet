# Doppler for produksjon

## Status

Klargjort, men ikke aktivert på `main`. Verifiseringsloggen ligger internt.

## Løsning

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

## Tilbakeføring

Gamle GitHub- og SOPS-kilder er beholdt. Reverter workflow-endringen for
a bruke tidligere deployflyt. HMAC-originalen kan ikke hentes tilbake;
behold den nye ved tilbakeforing. Synk til Auth, Worker og database er ikke
atomisk: feil krever at samme verdier synkes pa nytt til alle mottakere.

## Lokale kontroller

`python3 scripts/check-doppler-production.py` og
`python3 scripts/check-doppler-native.py` kjorer offline med falske HTTP-
og Wrangler-kall. De inngar i CI. `actionlint` validerer workflowene.
Ingen av disse kontrollene berorer produksjonen.
