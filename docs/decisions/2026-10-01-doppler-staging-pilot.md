# Doppler-pilot i staging

## Kontekst

Hemmeligheter administreres i SOPS, GitHub, Cloudflare og Supabase. Manuell
kopiering gjør rotasjon utsatt for avvik. Piloten prøver Doppler Developer
som autoritativ kilde for én ny Mistral-nøkkel dedikert til staging.

## Valgt løsning

Prosjekt `kaupet`, konfigurasjon `stg`, hemmelighet `MISTRAL_API_KEY`.
Et lesetoken avgrenset til konfigurasjonen lagres som `DOPPLER_TOKEN` i
GitHub Environment `staging`. Developer støtter ikke OIDC.

Den manuelt utløste workflowen `doppler-staging.yml` henter bare denne
nøkkelen gjennom Dopplers API og setter den på `kaupet-no-staging` med
eksisterende Wrangler. Midlertidige filer slettes og nøkkelen maskeres i
Actions-loggen. Vanlig deploy administrerer ikke denne nøkkelen.

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

Neste trinn er en staging-spesifikk `IMAGE_JOBS_SECRET` med kontrollert
distribusjon til både Worker og Supabase. Dette inngår ikke i første jobb.
