# Doppler staging: migreringsstatus

Oppdatert 1. oktober 2026. Doppler `kaupet/stg` skal være autoritativ kilde.
Produksjonens credentials tilbakekalles ikke. Tilgang som deles med produksjon
skal erstattes av egne staging-credentials, unntatt Vipps og SVV: brukeren
har eksplisitt godkjent deling for disse to tjenestene. Vipps staging bruker
fortsatt testmiljøet, med eksisterende VIPPS_TEST_* som også brukes av
produksjonens testflyt. Produksjonens betalingscredentials endres ikke.

| Credential                              | Status                                                                             | Mottaker                                |
| --------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| MISTRAL_API_KEY                         | Distribuert og kontrollert                                                         | Staging Worker                          |
| IMAGE_JOBS_SECRET                       | Separat staging-verdi, distribuert og kontrollert                                  | Worker og Supabase app_settings         |
| PUSH_DISPATCH_SECRET                    | Rotert og kontrollert; gammel verdi avvises                                        | Worker og Supabase app_settings         |
| SUPABASE_SERVICE_ROLE_KEY               | Importert; synkjobb bruker Doppler                                                 | Synkjobb og Worker-serverklient         |
| CLOUDFLARE_API_TOKEN                    | Ny staging-token finnes i Doppler; opprettet staging-widget                        | Deploy/synk, aldri Worker               |
| SUPABASE_ACCESS_TOKEN                   | Ny prosjektavgrenset PAT; Auth-lesing kontrollert                                  | Auth-synk, aldri Worker                 |
| RESEND_API_KEY                          | Ny staging-nøkkel distribuert til Worker/SMTP; SMTP-login kontrollert uten sending | Worker og Supabase Auth SMTP            |
| TURNSTILE_SECRET_KEY                    | Separat staging-widget distribuert via PR 300                                      | Worker og Supabase Auth                 |
| VAPID_PRIVATE_KEY                       | Separat staging-pair distribuert via PR 300                                        | Worker; offentlig nøkkel i klientbygg   |
| R2_CLEANUP_SECRET                       | Separat staging-verdi distribuert via PR 300                                       | Worker og Supabase app_settings         |
| RATE_LIMIT_HMAC_SECRET                  | Separat staging-verdi distribuert via PR 300                                       | Worker                                  |
| R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY | Separate credentials i Doppler; lesetilgang til begge staging-buckets bekreftet    | Worker                                  |
| VIPPS_TEST_*                            | Godkjent deling; importert til Doppler og distribuert til staging Worker           | Worker                                  |
| STATENS_VEGVESEN_API_KEY                | Godkjent deling; importert til Doppler og distribuert til staging Worker           | Worker                                  |
| FCM_SERVICE_ACCOUNT_JSON                | Ikke aktiv i staging; eksisterende kilde bruker produksjonsprosjekt                | Ikke aktiver før staging-oppsett finnes |
| API_KEY_EXPIRY_SECRET                   | Ikke konfigurert i staging                                                         | Ingen migrering av aktiv credential     |
| HF_TOKEN / HF_BOREALIS_ENDPOINT_URL     | Ingen konsument funnet; fjernet fra staging Worker                                 | Ingen                                   |

PR 300 kobler normal deploy til samme synk som manuell rotasjon. Ved utrulling
bygges klienten med nye offentlige Turnstile- og VAPID-nøkler før serverens
hemmeligheter distribueres. Gamle staging push-abonnement må aktiveres på nytt
etter VAPID-rotasjon. Supabase SMTP/captcha oppdateres med en PATCH som bare
inneholder de to hemmelighetene; captcha_enabled beholdes som før (false).
SMTP-, avsender- og providerinnstillinger kontrolleres før skriving.

Synk kontrollerer Worker/DB-jobbhemmeligheter og Auth-innstillinger. Management
API aksepterte SMTP-PATCH, men returnerer hemmelighetsfeltene som 64 hex,
ikke klartekst eller vanlig SHA-256. Direkte sammenligning av Auth-hemmeligheter
kan derfor ikke bekreftes. Workflowen godtar bare eksakt verdi eller dette
observerte skjulte formatet; den rapporterer begrensningen. Ende-til-ende
Auth-e-post og captcha må kontrolleres etter utrulling. R2-cleanup
kontrolleres med database-samsvar og avvisning av ugyldig nøkkel. Positiv
cleanup kjøres ikke, fordi det kan slette objekter. Positiv bildejobbkontroll
kan behandle ventende staging-bildejobber. Push-kontroll validerer autentisering
uten å sende varsler.

Etter vellykket staging-deploy og separat verify fjernes gamle migrerte
GitHub- og staging-SOPS-kopier når alle konsumenter er bekreftet. Det gamle
IMAGE_JOBS_SECRET er allerede fjernet fra GitHub staging. DOPPLER_TOKEN
beholdes som bootstrap. Lokal utvikling og produksjon migreres separat.

Supabase Auth-synk bruker
[Management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config).
Dopplers Supabase-integrasjon for Edge Functions dekker ikke Auth eller
app_settings; den eksisterende eksplisitte synken håndterer disse mottakerne.

## Deling av Vipps og SVV

Brukeren har godkjent samme hemmeligheter mellom staging og produksjon.
De eksisterende staging-kildene er importert under sine faktiske appnavn:
VIPPS_TEST_CLIENT_ID, VIPPS_TEST_CLIENT_SECRET, VIPPS_TEST_SUBSCRIPTION_KEY,
VIPPS_TEST_MSN, VIPPS_TEST_WEBHOOK_SECRET og STATENS_VEGVESEN_API_KEY.
Vipps-token ble hentet fra apitest.vipps.no med vellykket autentisering;
ingen betaling ble opprettet. Staging Workeren er oppdatert fra Doppler,
med VIPPS_ENVIRONMENT=test. Fast synk utvides til samme liste.

Produksjonens credentials og SOPS-kilde beholdes frem til produksjonens
konsumenter migreres. En senere rotasjon av delte leverandørnøkler må
koordineres for alle miljøene som bruker dem. SVV er ikke testet med et
live kjøretøyoppslag i denne migreringen.

## R2-credentials

Separate R2_ACCESS_KEY_ID og R2_SECRET_ACCESS_KEY er lagt inn i Doppler.
Signerte, lesende S3 ListObjectsV2-kall med max-keys=0 ga HTTP 200 for både
kaupet-bilder-staging og kaupet-vedlegg-staging. Ingen objekter ble skrevet,
slettet eller lastet ned. Skrivetilgang er ikke prøvd med et objekt.

PR 301 inkluderer R2-nøklene i den eksplisitte Worker-listen og fjerner
staging-deployens skriver fra GitHub-secrets. Runtime-bytte gjøres først ved
utrulling av denne endringen, slik at gammel deploy ikke overskriver nye
credentials. Gamle GitHub- og staging-SOPS-kopier fjernes etter bekreftet
utrulling; produksjonens kopier beholdes.
