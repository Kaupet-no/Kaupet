# Doppler-pilot i staging

## Kontekst

Hemmeligheter administreres i SOPS, GitHub, Cloudflare og Supabase. Manuell
kopiering gjør rotasjon utsatt for avvik. Piloten prøver Doppler Developer
som autoritativ kilde for pilothemmeligheter dedikert til staging.

## Valgt løsning

Prosjekt `kaupet`, konfigurasjon `stg`, er autoritativ kilde for de migrerte
staging-hemmelighetene. Mottakere og gjenværende oppgaver er ført i
[statusoversikten](2026-10-01-doppler-staging-status.md).

Et lesetoken avgrenset til konfigurasjonen lagres som `DOPPLER_TOKEN` i
GitHub Environment `staging`. Developer støtter ikke OIDC.
`scripts/doppler-staging.sh` brukes både av vanlig staging-deploy og den
manuelle workflowen. Begge deler samme concurrency-gruppe.
Cloudflare-token hentes etter klientbygget. Management-token og
Cloudflare-token inngår aldri i Worker-payloaden. Serverens eksisterende
service-role distribueres fra samme kilde som synkjobben bruker.
Midlertidige filer slettes, og verdiene maskeres i Actions-loggen.

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

Workflowen henter `SUPABASE_SERVICE_ROLE_KEY` fra Doppler. Denne har bred
servertilgang; den brukes bare til Supabase-kontroll og synk, aldri i
klientbygg. Workeren får sin nødvendige service-role for serverklienten
fra samme Doppler-kilde, etter lesende kontroll mot staging-prosjektet. Eksisterende GitHub- og SOPS-kopier
beholdes til den nye flyten er kontrollert og konsumentene er kartlagt. En egen begrenset databaserolle kan
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
fra Doppler. Cloudflare- og Supabase management-token hentes fra Doppler. Disse to
skal aldri inngå i Workerens bulk-payload eller klientbygg. Behold eksplisitt liste over hemmeligheter per mottaker.

Migrer én gruppe om gangen: avklar staging-avgrensning og konsumenter,
importer eller opprett credentials sikkert, distribuer, kontroller samsvar,
og fjern gammel staging-kilde. En SOPS-verdi som fortsatt brukes av
produksjon eller lokal utvikling skal beholdes. Roter hos leverandøren der
verdien er delt med produksjon, uten å tilbakekalle produksjonens credential.
Sikre fungerende tilbakeføring før tilbakekalling.

Kilder: [GitHub Actions](https://docs.doppler.com/docs/github-actions),
[Cloudflare Workers](https://docs.doppler.com/docs/cloudflare-workers),
[Supabase](https://docs.doppler.com/docs/supabase).

Staging service-role ble importert fra SOPS til Doppler 2026-10-01. JWT-rolle
og prosjektref ble kontrollert, lesetilgang til staging `app_settings`
bekreftet, og Doppler-verdien sammenlignet uten verdiutskrift. Importen
roterer ikke nøkkelen og oppdaterer ikke Workerens runtime-kopi.

## Push-rotasjon i staging

`PUSH_DISPATCH_SECRET` er en ny staging-spesifikk verdi i Doppler.
Synkjobben setter den på `kaupet-no-staging` og i
`app_settings.push_dispatch_secret`, etter kontroll av staging-URL-en.
Vanlig deploy skriver ikke denne hemmeligheten.

Ved kartlegging 2026-10-01 matchet fungerende databaseverdi ikke
`PUSH_DISPATCH_SECRET` i SOPS. Før rotasjon sikres derfor den fungerende
staging-verdien i Doppler som `PUSH_DISPATCH_SECRET_PREVIOUS`. Den er bare
en midlertidig tilbakeføringsverdi og inngår aldri i Workerens bulk-payload.
Ingen produksjonsverdier endres eller tilbakekalles.

Kontrollen sammenligner Doppler med databaseverdien. Den sender `{}` til
push-endepunktet: gammel/ugyldig verdi må gi 401, ny verdi må gi 400
fra payloadvalideringen før databaseoppslag og varselutsending. Requesten
bruker JSON og staging Origin. Ingen varsler sendes av denne kontrollen.

Ved tilbakeføring byttes nåværende og forrige verdi i Doppler, og samme
synk kjøres på nytt. Begge runtime-kopier må gjenopprettes; ikke bruk den
avvikende SOPS-kopien. Når tilbakeføringsbehovet er avklart, slettes
`PUSH_DISPATCH_SECRET_PREVIOUS`; kontrollen bruker da en tilfeldig ugyldig
verdi og beviser ikke lenger at den konkrete gamle verdien avvises.

Push-rotasjonen ble distribuert og kontrollert i
[Actions-kjøring 36868040688](https://github.com/Kaupet-no/Kaupet/actions/runs/36868040688).
Gammel verdi ble avvist og ny verdi nådde payloadvalideringen.

## Fortsatt migrering med separate staging-credentials

Brukeren valgte separate staging-credentials 2026-10-01. Eksisterende delte
produksjonscredentials skal ikke kopieres til `kaupet/stg` eller tilbakekalles.

Manuell workflow og vanlig staging-deploy gjenbruker
`scripts/doppler-staging.sh`. Vanlig deploy skriver ikke lenger
`R2_CLEANUP_SECRET` fra GitHub. En ny staging-verdi for R2-jobben er
klargjort i Doppler; gammel fungerende verdi matcher kryptert SOPS-kilde
og beholdes der fordi produksjon fortsatt bruker kilden.
R2-verifisering leser databaseverdien og krever 401 med ugyldig secret.
Den kjører ikke positiv opprydning og beviser derfor ikke alene at en
gyldig request når jobbens sletteoperasjoner.

Nye `RATE_LIMIT_HMAC_SECRET` og `VAPID_PRIVATE_KEY` er staging-spesifikke.
Klientens offentlige VAPID-nøkkel kommer fra staging-byggvariabelen
`VITE_VAPID_PUBLIC_KEY`; produksjon beholder dagens offentlige nøkkel.
Før Worker-oppdatering kontrolleres at det nye VAPID-paret matcher.
Aktivering skjer først ved staging-deploy med den nye klientkoden.
Staging-brukere med gamle web-push-abonnementer må aktivere push på nytt.
HMAC-rotasjon gir nye IP-fingeravtrykk for staging rate-limit-bøtter.

Supabase PAT i SOPS svarte 401. Brukeren opprettet et nytt token direkte
i Doppler med staging-prosjektavgrensning; Auth-lesing svarte 200.
Captcha var deaktivert ved lesingen; migreringen skal ikke aktivere den
ut fra en antakelse. SMTP/passord må komme fra en gyldig ny staging-nøkkel.

Se statuslisten i `docs/decisions/2026-10-01-doppler-staging-status.md`
for gjenstående leverandørtilganger og avsluttende opprydding.
