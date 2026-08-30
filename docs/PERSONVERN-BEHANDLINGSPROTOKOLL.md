# Intern behandlingsprotokoll for personopplysninger

Dette er den autoritative, interne oversikten over hvilke personopplysninger
Kaupet.no behandler, hvorfor, hvor de lagres, hvem de eventuelt deles med, og
hvor lenge de beholdes før sletting. `/personvern` (den brukervendte
personvernerklæringen) skal aldri love mer eller mindre enn det som står her.
Ved motstrid gjelder denne protokollen — rett protokollen og
personvernerklæringen sammen i samme endring.

Behandlingsansvarlig: **Happy Pixel AS**, org.nr. 933 197 867.

## Hvordan bruke dette dokumentet

- Ny tabell, ny ekstern integrasjon eller ny klientlagringsnøkkel som
  inneholder personopplysninger (direkte eller indirekte, inkl. pseudonyme
  ID-er) **skal** legges til her i samme endring som legger den til i koden.
- `slettefrist`-kolonnen skal være en konkret varighet eller utløsende
  hendelse, aldri «så lenge nødvendig». Alle frister under er implementert i
  `public.purge_expired_personal_data()` (kjøres daglig kl. 03:30 UTC via
  `privacy-retention-daily`-cron-jobben, se
  `supabase/migrations/20260829170000_privacy_minimization_and_retention.sql`)
  eller i den eksisterende `public.purge_expired_accounts()`-jobben
  (`purge-expired-accounts-daily`, kl. 03:00 UTC), med mindre noe annet er
  angitt.
- Lokal enhetslagring (localStorage/sessionStorage/IndexedDB) er egen seksjon
  nederst, siden ekomloven § 3-15 stiller egne krav (samtykke/unntak) uavhengig
  av om innholdet er en personopplysning.

## Behandlingsgrunnlag brukt under

- **Avtale** — personvernforordningen art. 6 nr. 1 bokstav b: nødvendig for å
  levere tjenesten brukeren har bedt om.
- **Samtykke** — art. 6 nr. 1 bokstav a: brukeren har aktivt slått på
  funksjonen (f.eks. push-varsler).
- **Berettiget interesse** — art. 6 nr. 1 bokstav f: nødvendig for sikkerhet,
  misbruksforebygging eller drift, avveid mot brukerens interesser.
- **Rettslig forpliktelse** — art. 6 nr. 1 bokstav c: bokføringslov o.l.

## 1. Konto og identitet

| Data                                                                                  | Formål                                          | Grunnlag                       | Lagring           | Slettefrist                                                                                   |
| ------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------ | ----------------- | --------------------------------------------------------------------------------------------- |
| `profiles` (navn, profilbilde, e-post via `auth.users`)                               | Kontoidentitet, offentlig profil                | Avtale                         | Supabase Postgres | Ved kontosletting: navn/bilde anonymiseres til «Slettet bruker», e-post fjernes helt (se § 6) |
| `auth.users` metadata (siste innlogging, e-post bekreftet, vilkårsversjon/-tidspunkt) | Autentisering, dokumentasjon av avtaleinngåelse | Avtale / rettslig forpliktelse | Supabase Auth     | Slettes ved kontosletting                                                                     |
| `user_roles`                                                                          | Admin/moderator-tilgang                         | Berettiget interesse (drift)   | Supabase Postgres | Slettes ved kontosletting (kaskade)                                                           |

## 2. Annonser og kjøpsønsker

| Data                                                           | Formål                                        | Grunnlag | Lagring                              | Slettefrist                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------- | -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `listings` (aktive/publiserte)                                 | Kjernetjenesten: kjøp/salg                    | Avtale   | Supabase Postgres                    | Beholdes til bruker sletter annonsen, kontoen slettes, eller annonsen utløper automatisk (`expire_old_listings`)  |
| `listings` (status `draft`, salgsutkast)                       | La bruker fortsette et påbegynt utkast        | Avtale   | Supabase Postgres                    | **90 dager** uten redigering. Systemvarsel sendes til innboksen 7 dager før sletting (`draft_expiry_notified_at`) |
| `wtb_listings` (aktive «ønskes kjøpt»)                         | Kjernetjenesten                               | Avtale   | Supabase Postgres                    | Beholdes til bruker sletter eller kontoen slettes                                                                 |
| `wtb_listings` (status `draft`)                                | Utkast                                        | Avtale   | Supabase Postgres                    | Samme 90-dagers/7-dagers-varsel-regel som salgsutkast                                                             |
| `listing_images`, `listing_360_frames`                         | Annonseinnhold                                | Avtale   | Supabase Storage + Postgres-metadata | Slettes med annonsen (kaskade)                                                                                    |
| `listing_360_capture_sessions` (opplastingstoken)              | Midlertidig opplastingssesjon for 360°-opptak | Avtale   | Supabase Postgres                    | 7 dager etter `expires_at`                                                                                        |
| Bildeutkast i nettleserens IndexedDB (`kaupet-listing-drafts`) | Vise utkastbilder før publisering             | Avtale   | Enhetens IndexedDB                   | Slettes når brukeren fullfører/forkaster utkastet, eller når det tekstlige utkastet slettes (90 dager)            |

## 3. Kommunikasjon og handel

| Data                                      | Formål                                    | Grunnlag                                   | Lagring           | Slettefrist                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversations`, `messages`               | Kjøper/selger-kommunikasjon               | Avtale                                     | Supabase Postgres | Beholdes til en konto slettes; ved kontosletting fjernes selgerens egne annonser (kaskade fjerner tilhørende samtaler/meldinger for de annonsene), mens meldinger i samtaler brukeren deltok i som kjøper på en **annen** brukers annonse beholdes med avsendernavn anonymisert til «Slettet bruker» |
| `listing_sales`                           | Bekreftet salg, trygghet for begge parter | Avtale                                     | Supabase Postgres | Beholdes til en av partenes konto slettes                                                                                                                                                                                                                                                            |
| `listing_promotions`, `promotion_pricing` | Betalt fremheving av annonse              | Avtale / rettslig forpliktelse (bokføring) | Supabase Postgres | Beholdes til kontoen slettes; betalingsrelaterte felt kan ha lengre lovpålagt oppbevaring hos Vipps, se § 8                                                                                                                                                                                          |
| `vipps_webhook_events`                    | Betalingsbekreftelse                      | Avtale                                     | Supabase Postgres | Server-only, ingen egen sletterutine i dag — **kjent gap, se Vedlegg A**                                                                                                                                                                                                                             |
| `user_reviews`                            | Tillit mellom brukere                     | Avtale / berettiget interesse              | Supabase Postgres | Beholdes til anmelder eller vurdert konto slettes; vurderingen anonymiseres/fjernes tilsvarende meldinger                                                                                                                                                                                            |

## 4. Søk, favoritter og varsler

| Data                                                                                                           | Formål                        | Grunnlag                   | Lagring           | Slettefrist                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `favorites`                                                                                                    | Lagrede favoritter            | Avtale                     | Supabase Postgres | Til bruker fjerner favoritten eller kontoen slettes                                                                                      |
| `saved_searches`                                                                                               | Lagrede søk med varsling      | Avtale/samtykke (varsling) | Supabase Postgres | Til bruker sletter søket eller kontoen slettes                                                                                           |
| `saved_search_notifications`, `favorite_price_drops`, `favorite_sold_notifications`, `wtb_match_notifications` | Varsle om treff/prisfall/salg | Avtale                     | Supabase Postgres | **180 dager** etter at varselet er lest (`read_at`); ulest varsel slettes aldri automatisk (brukeren har ikke fått sjansen til å se det) |
| `system_messages` (inkl. utkastvarsel, personvernendringer)                                                    | In-app-varsling fra systemet  | Avtale                     | Supabase Postgres | 1 år etter lest, ellers 2 år uansett                                                                                                     |

## 5. Varslingskanaler

| Data                                                              | Formål                                           | Grunnlag                     | Lagring                        | Slettefrist                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------ | ---------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification_preferences`                                        | Brukerens valg for push/e-post per hendelsestype | Avtale                       | Supabase Postgres              | Til kontoen slettes                                                                                                                                                  |
| `push_subscriptions` (Web Push-endepunkt+nøkler, eller FCM-token) | Levere push-varsler                              | Samtykke                     | Supabase Postgres              | Slettes når brukeren skrur av varsler, når enheten avregistreres, eller automatisk når leverandøren (nettleser/FCM) rapporterer at abonnementet er ugyldig (404/410) |
| `push_dispatch_failures`                                          | Feilsøke mislykket varselutsending               | Berettiget interesse (drift) | Supabase Postgres              | 30 dager                                                                                                                                                             |
| E-postvarsler sendt via Resend                                    | Levere varsel brukeren har bedt om               | Samtykke                     | Resend (USA, SCC/DPF) — se § 8 | Styres av Resends 30-dagers driftslagring; se § 8 for overføringsgrunnlag                                                                                            |

## 6. Kontosletting

| Data                                          | Formål                                   | Grunnlag                       | Lagring           | Slettefrist                                                                                                                                                                                                                 |
| --------------------------------------------- | ---------------------------------------- | ------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_deletions` (forespørsel, angrefrist) | Dokumentere slettefrist, tillate angring | Avtale / rettslig forpliktelse | Supabase Postgres | Raden slettes når sletting utføres eller angres                                                                                                                                                                             |
| Faktisk sletting (`purge_expired_accounts`)   | Utføre sletting                          | Avtale                         | —                 | 7 dager etter forespørsel: selgerens egne salgs- **og** kjøpsønske-annonser slettes, profil anonymiseres (`display_name` → «Slettet bruker», bilde fjernes), `auth.users`-raden (e-post, innloggingsdata) slettes permanent |

## 7. Sikkerhet, moderering og feilsøking

| Data                            | Formål                                                             | Grunnlag                                          | Lagring           | Slettefrist                                                                                         |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `reports`                       | Håndtere rapporterte annonser/brukere                              | Berettiget interesse                              | Supabase Postgres | 3 år etter `resolved_at`                                                                            |
| `user_blocks`                   | La brukere blokkere andre                                          | Avtale (brukerkontrollert) / berettiget interesse | Supabase Postgres | Til brukeren opphever blokkeringen eller en av kontoene slettes                                     |
| `user_bans`, `user_suspensions` | Håndheve regelbrudd                                                | Berettiget interesse                              | Supabase Postgres | Til kontoen slettes; utestengelse er normalt permanent dokumentasjon av hvorfor kontoen ble fjernet |
| `ip_bans`                       | Blokkere gjentatt misbruk uten konto                               | Berettiget interesse                              | Supabase Postgres | Til en admin opphever blokkeringen                                                                  |
| `admin_moderation_log`          | Sporbarhet for administrative handlinger                           | Rettslig forpliktelse / berettiget interesse      | Supabase Postgres | 3 år                                                                                                |
| `error_log`                     | Feilsøke serverfeil (aldri fritekst/PII, se `server-error-log.ts`) | Berettiget interesse                              | Supabase Postgres | 90 dager                                                                                            |
| `feedback`                      | Produktforbedring                                                  | Berettiget interesse                              | Supabase Postgres | 2 år                                                                                                |

## 8. Kjøretøyoppslag og AI-kategoriforslag

| Data                                                                                               | Formål                                                               | Grunnlag             | Lagring/mottaker                                       | Slettefrist                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registreringsnummer sendt til Statens vegvesen (Datautlevering)                                    | Fylle inn kjøretøydata automatisk                                    | Avtale               | Statens vegvesen (databehandler, norsk offentlig etat) | Ingen lagring hos Kaupet utover `vehicle_lookup_log` under                                                                                                                                                                                           |
| `vehicle_lookup_log` (regnr, bruker-ID, klassifiseringsresultat)                                   | Rate-limiting, varsle ved motstridende klassifisering av samme skilt | Berettiget interesse | Supabase Postgres                                      | 90 dager                                                                                                                                                                                                                                             |
| Første 100 tegn av annonsetittel sendt til Mistral AI (kun når intern kategorimatching er usikker) | AI-basert kategoriforslag                                            | Berettiget interesse | Mistral AI (EU-endepunkt `api.eu.mistral.ai`)          | Mistral lagrer input/output i inntil 30 rullerende dager for misbrukskontroll med mindre Zero Data Retention er aktivert på kontoen (bekreftes i Mistral-adminpanelet, ikke verifisert fra dette repoet). Brukes ikke til modelltrening som standard |

## 9. Betaling, bot-beskyttelse og infrastruktur

| Data                                                                              | Formål                             | Grunnlag             | Mottaker                                                            | Overføringsgrunnlag / lagring hos leverandør                                            |
| --------------------------------------------------------------------------------- | ---------------------------------- | -------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Navn, telefonnummer, betalingsdata ved kjøp av annonsefremheving                  | Gjennomføre betaling               | Avtale               | Vipps/MobilePay (Norge)                                             | Vipps' egen personvernerklæring; norsk selskap, ingen tredjelandsoverføring             |
| IP-adresse, enhets-/nettlesersignaler ved innlogging, registrering og publisering | Bot- og misbruksbeskyttelse        | Berettiget interesse | Cloudflare Turnstile                                                | Cloudflare Data Processing Addendum (SCC)                                               |
| All trafikk til/fra kaupet.no                                                     | Drift, sikkerhet (WAF/DDoS)        | Berettiget interesse | Cloudflare (driftsplattform)                                        | Cloudflare DPA (SCC)                                                                    |
| Database, autentisering, fillagring                                               | Kjernetjenesten                    | Avtale               | Supabase                                                            | Supabase DPA; region bekreftes i Supabase-dashbordet (ikke verifisert fra dette repoet) |
| E-postadresse + varselinnhold for transaksjonelle varsler                         | Sende varsler brukeren har bedt om | Samtykke             | Resend                                                              | Resend DPA, SCC + EU–US Data Privacy Framework. Data lagres i USA                       |
| Enhets-token, varselinnhold for app-push (iOS/Android)                            | Sende push-varsler i appen         | Samtykke             | Google Firebase Cloud Messaging (viderefører til Apple APNs på iOS) | Googles standard personvernbestemmelser (SCC)                                           |

## 10. Anonym produktmåling og annonsevisninger

Disse dataene er bevisst konstruert til **ikke** å inneholde noen klient- eller
brukeridentifikator — se `docs/decisions/2026-08-29-remove-client-side-analytics-identifiers.md`.

| Data                                                                                                            | Formål                                                   | Grunnlag             | Lagring           | Slettefrist                       |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------- | ----------------- | --------------------------------- |
| `product_events` (hendelsesnavn, plattform, rute, kontrollerte egenskaper — **ingen sesjons- eller bruker-ID**) | Forstå bruksmønster i søk/annonsering på aggregert nivå  | Berettiget interesse | Supabase Postgres | 90 dager                          |
| `product_event_rate_limits` (SHA-256-hash av IP)                                                                | Hindre misbruk av målings-endepunktet                    | Berettiget interesse | Supabase Postgres | 1 døgn                            |
| `listing_view_totals` (annonse-ID → antall visninger)                                                           | Vise selger et visningstall                              | Berettiget interesse | Supabase Postgres | Følger annonsen (slettes med den) |
| `listing_view_events` (annonse-ID + tidspunkt, **ingen besøkende-ID**)                                          | Beregne visninger siste 7 dager for «populært nå»        | Berettiget interesse | Supabase Postgres | 90 dager                          |
| `listing_view_rate_limits` (SHA-256-hash av IP + annonse-ID)                                                    | Maks én telling per nettverk per annonse per 30 minutter | Berettiget interesse | Supabase Postgres | 1 døgn                            |

## 11. Lokal enhetslagring (krever samtykke med mindre strengt nødvendig)

Ekomloven § 3-15 gjelder uavhengig av om innholdet er en personopplysning.
Nøklene under regnes som **strengt nødvendige** for funksjonen brukeren
eksplisitt har bedt om, og er derfor unntatt samtykkekravet. Enhver ny
lagringsnøkkel som ikke er strengt nødvendig for en brukerinitiert funksjon,
skal enten fjernes til fordel for en serverløsning eller underlegges et reelt
samtykke før den tas i bruk.

| Nøkkel                                                                                        | Sted                                | Formål                                                  | Forlater enheten?                                                     |
| --------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| Supabase-innloggingssesjon                                                                    | `localStorage`                      | Holde brukeren innlogget                                | Nei                                                                   |
| `kaupet_draft_ny_annonse`, `kaupet_draft_id`                                                  | `localStorage`                      | Utkast til salgsannonse                                 | Nei (kun `id` sendes til server ved lagring)                          |
| `kaupet_draft_want_listing`, `kaupet_draft_want_listing_id`                                   | `localStorage`                      | Utkast til kjøpsønske                                   | Nei                                                                   |
| `kaupet_recent_searches_v1`                                                                   | `localStorage`                      | Egne siste søk (autofullføring)                         | Nei                                                                   |
| `kaupet_view_mode`                                                                            | `localStorage`                      | Rutenett/liste-preferanse                               | Nei                                                                   |
| `kaupet_360_hint_seen`, `kaupet_push_msg_hint_dismissed_v1`, `kaupet_onboarding_completed_v1` | `localStorage`                      | Husk sett veiledning/onboarding                         | Nei                                                                   |
| `kaupet_theme`                                                                                | `localStorage`                      | Lys/mørk/system-tema                                    | Nei                                                                   |
| `kaupet.app.location` (kun app)                                                               | `localStorage`                      | Forhåndsutfylt stedsfilter                              | Koordinatene sendes til Kaupet når brukeren utfører et geografisk søk |
| `kaupet-pending-auth-intent`                                                                  | `sessionStorage`                    | Fullføre en handling (f.eks. favoritt) etter innlogging | Nei                                                                   |
| `kaupet:lastAnnonserSearch`                                                                   | `sessionStorage`                    | Gå tilbake til forrige søkeresultat                     | Nei, slettes når fanen lukkes                                         |
| Bildeutkast                                                                                   | IndexedDB (`kaupet-listing-drafts`) | Mellomlagre bilder under annonseregistrering            | Nei                                                                   |

**Fjernet i denne revisjonen:** `kaupet_visitor_id` (localStorage) og
`kaupet-product-session` (sessionStorage) — begge var klientgenererte
identifikatorer uten et rent funksjonelt unntak fra samtykkekravet.
Visningstelling og produktmåling er erstattet med de aggregerte,
identifikatorløse mekanismene i § 10.

## Vedlegg A — kjente gap (ikke løst i denne revisjonen)

- `vipps_webhook_events` mangler en egen slettefrist. Foreslått: samme frist
  som regnskapsbilag tilsier (bokføringsloven), avklares med regnskapsfører
  før en konkret frist legges inn i `purge_expired_personal_data()`.
- Faktisk Supabase-prosjektregion, Resend-plan/lagringstid og Mistral
  Zero-Data-Retention-status er ikke bekreftet i leverandørdashbordene —
  merket som «ikke verifisert fra dette repoet» over inntil noen med
  kontotilgang bekrefter dem.
