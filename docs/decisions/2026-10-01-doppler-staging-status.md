# Doppler staging: migreringsstatus

Oppdatert 1. oktober 2026. Doppler `kaupet/stg` skal være autoritativ kilde.
Produksjonens credentials tilbakekalles ikke. Tilgang som deles med produksjon
skal erstattes av egne staging-credentials før migrering.

| Credential                              | Status                                                                             | Mottaker                                |
| --------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| MISTRAL_API_KEY                         | Distribuert og kontrollert                                                         | Staging Worker                          |
| IMAGE_JOBS_SECRET                       | Separat staging-verdi, distribuert og kontrollert                                  | Worker og Supabase app_settings         |
| PUSH_DISPATCH_SECRET                    | Rotert og kontrollert; gammel verdi avvises                                        | Worker og Supabase app_settings         |
| SUPABASE_SERVICE_ROLE_KEY               | Importert; synkjobb bruker Doppler                                                 | Synkjobb og Worker-serverklient         |
| CLOUDFLARE_API_TOKEN                    | Ny staging-token finnes i Doppler; opprettet staging-widget                        | Deploy/synk, aldri Worker               |
| SUPABASE_ACCESS_TOKEN                   | Ny prosjektavgrenset PAT; Auth-lesing kontrollert                                  | Auth-synk, aldri Worker                 |
| RESEND_API_KEY                          | Ny staging-nøkkel distribuert til Worker/SMTP; SMTP-login kontrollert uten sending | Worker og Supabase Auth SMTP            |
| TURNSTILE_SECRET_KEY                    | Ny staging-widget opprettet; utrulling gjenstår                                    | Worker og Supabase Auth                 |
| VAPID_PRIVATE_KEY                       | Ny staging-pair klargjort; utrulling gjenstår                                      | Worker; offentlig nøkkel i klientbygg   |
| R2_CLEANUP_SECRET                       | Ny staging-verdi klargjort; utrulling gjenstår                                     | Worker og Supabase app_settings         |
| RATE_LIMIT_HMAC_SECRET                  | Ny staging-verdi klargjort; utrulling gjenstår                                     | Worker                                  |
| R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY | Venter på egne credentials begrenset til to staging-buckets                        | Worker                                  |
| VIPPS_TEST_*                            | Eksisterende verdier deles; venter på egne staging/test-credentials                | Worker                                  |
| SVV_API_KEY                             | Eksisterende verdi deles; venter på egen staging-credential                        | Worker                                  |
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
