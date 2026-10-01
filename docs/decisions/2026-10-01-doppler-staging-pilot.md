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

Verifiser også en vanlig staging-deploy og gjenta synkjobben etterpå.
Når rotasjon er bekreftet, fjern den gamle `IMAGE_JOBS_SECRET` fra GitHub
Environment `staging`. Produksjonens GitHub-secret og SOPS-verdi beholdes.

Offline-kontroll: `python3 scripts/check-doppler-staging.py` og
`actionlint .github/workflows/doppler-staging.yml`.
