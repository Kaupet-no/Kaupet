# Doppler-pilot i staging

## Kontekst

Hemmeligheter administreres i SOPS, GitHub, Cloudflare og Supabase. Manuell
kopiering gjør rotasjon utsatt for avvik. Piloten prøver Doppler Developer
som autoritativ kilde for pilothemmeligheter dedikert til staging.

## Valgt løsning

Prosjekt `kaupet`, konfigurasjon `stg`, hemmeligheter `MISTRAL_API_KEY` og
`IMAGE_JOBS_SECRET`. Sistnevnte skal være en ny verdi kun for staging.
Et lesetoken avgrenset til konfigurasjonen lagres som `DOPPLER_TOKEN` i
GitHub Environment `staging`. Developer støtter ikke OIDC.

Den manuelt utløste workflowen `doppler-staging.yml` henter bare disse
hemmelighetene gjennom Dopplers API og setter dem på `kaupet-no-staging` med
eksisterende Wrangler. Midlertidige filer slettes og nøkkelen maskeres i
Actions-loggen. Vanlig staging-deploy administrerer ikke disse hemmelighetene.

## Alternativer

SOPS med egen distribusjon, Infisical og Keyshade ble vurdert. Doppler ble
valgt for en avgrenset pilot med eksisterende GitHub/Cloudflare-verktøy.
Team-plan med OIDC vurderes etter piloten.

## Verifisering og reversering

Etter at workflowen finnes på standardbranchen: åpne GitHub Actions,
velg «Doppler-pilot (staging)» og kjør «Run workflow» fra staging-branchen.
Kontroller grønn jobb og test KI-kategoriforslag på staging.kaupet.no med
KI-funksjonen aktivert. Kjør vanlig staging-deploy og gjenta testen.
Ingen produksjonsnøkler skal tilbakekalles i denne piloten.

Før første kjøring sikres en kryptert kopi av eventuell eksisterende
staging-nøkkel. Ved feil: sett en kjent fungerende nøkkel i Doppler og kjør
workflowen på nytt. Er Doppler utilgjengelig, gjenopprett nøkkelen manuelt
med `wrangler secret put MISTRAL_API_KEY --name kaupet-no-staging`.
En tilbakekalt API-nøkkel kan ikke brukes til tilbakeføring.

## Bildejobbhemmeligheten

Workflowen bruker eksisterende `SUPABASE_SERVICE_ROLE_KEY` i GitHub
Environment `staging`. Denne har bred servertilgang; den brukes bare i det
manuelle synksteget, aldri i klientbygg. En egen begrenset databaserolle kan
vurderes når piloten utvides. Ingen nye databasefunksjoner eller migrasjoner
innføres.

Før Worker-oppdateringen kontrolleres at staging-Supabase har `image_jobs_url`
satt til `https://staging.kaupet.no/api/public/images/process`. Prosjekt-URL
og Worker-navn er faste staging-verdier. Jobben oppdaterer først Workeren,
deretter bare `app_settings.image_jobs_secret`. Den leser raden tilbake,
sammenligner uten å skrive ut verdien og kaller bildejobb-endepunktet.
Dette kallet kan behandle opptil fem ventende staging-bildejobber.

Oppdateringene er ikke atomiske. Et kort avbrudd i cron-jobben under rotasjon
aksepteres i staging. Ved delvis feil vises sist vellykkede mottaker i jobbens
oppsummering; kjør samme jobb på nytt med samme Doppler-verdier. Ved
utilgjengelig Doppler må både Worker og database gjenopprettes til samme
kjent fungerende verdi. Ikke gjenopprett den gamle GitHub-kilden i vanlig
deploy.

Etter vanlig staging-deploy: kjør workflowen med `operation=verify`.
Denne modusen endrer ingen hemmeligheter. Den krever at Doppler-verdien
matcher Supabase, at en ugyldig verdi avvises med 401, og at den nye
verdien godtas av bildejobb-endepunktet. Hvis gammel GitHub-verdi fortsatt
finnes, brukes den i den negative testen og må være forskjellig fra den nye.
Etter sletting brukes en tilfeldig ugyldig verdi; dette beviser ikke lenger
at den konkrete gamle verdien avvises. Positivt testkall kan
behandle opptil fem ventende staging-bildejobber.

`operation=sync` distribuerer nye verdier. Standardvalget er `verify`.
Fra CLI: `gh workflow run doppler-staging.yml --ref staging -f operation=verify`.
Hvis Actions-skjemaet ikke viser operasjonsvalget, bruk CLI-kommandoen;
workflowversjonen på main har ennå ikke dette feltet.
Når rotasjon er bekreftet, fjern den gamle `IMAGE_JOBS_SECRET` fra GitHub
Environment `staging`. Produksjonens GitHub-secret og SOPS-verdi beholdes.

Offline-kontroll: `python3 scripts/check-doppler-staging.py` og
`actionlint .github/workflows/doppler-staging.yml`.

## Videre migrering

Doppler skal være eneste autoritative kilde for staging-hemmeligheter.
Worker, GitHub og Supabase har bare nødvendige distribuerte kopier.
Produksjon og lokal utvikling beholder sine kilder til de migreres separat.

GitHub Actions-integrasjonen kan synke til Environment `staging`; avgrens
til Kaupet-repoet og nødvendige hemmeligheter. Ikke aktiver en bred synk
før det er avklart hvilke navn den vil oppdatere, særlig `DOPPLER_TOKEN`.
Cloudflare Workers bruker fortsatt eksisterende Wrangler-synk. Dopplers
Supabase-integrasjon synker Edge Function-secrets, ikke `app_settings` eller
Auth SMTP/captcha; den erstatter derfor ikke jobbhemmelighetenes synk.

`DOPPLER_TOKEN` er bootstrap og må kunne brukes uten først å hente seg selv
fra Doppler. Cloudflare-token og staging service-role kan senere hentes fra
Doppler i samme jobb. De skal aldri inngå i Workerens bulk-payload eller
klientbygg. Behold eksplisitt liste over hemmeligheter per mottaker.

Migrer én gruppe om gangen: avklar staging-avgrensning og konsumenter,
importer eller opprett credentials sikkert, distribuer, kontroller samsvar,
og fjern gammel staging-kilde. En SOPS-verdi som fortsatt brukes av
produksjon eller lokal utvikling skal beholdes. Roter hos leverandøren der
verdien er delt med produksjon, uten å tilbakekalle produksjonens credential.
Sikre fungerende tilbakeføring før tilbakekalling.

Kilder: [GitHub Actions](https://docs.doppler.com/docs/github-actions),
[Cloudflare Workers](https://docs.doppler.com/docs/cloudflare-workers),
[Supabase](https://docs.doppler.com/docs/supabase).
