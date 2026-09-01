# Bedriftskontoer med nullable organisasjonseierskap og verifisert oppslag

## Kontekst og problem

Kaupet skal fortsatt støtte privat registrering og private annonser uendret, men også tilby bedriftskontoer. En bedriftskonto trenger verifisert organisasjonsnummer, en superbruker, inviterte medlemmer, plan/entitlement og en offentlig bedriftsidentitet på annonser. Proff skal kunne utløpe uten at privatkontoer, medlemsdata eller lagret profilering slettes.

Organisasjonsdata må hentes fra Brønnøysundregistrene ved registrering. Oppslaget må skje på serversiden for å begrense manipulering og for å unngå lagring av mer virksomhetsinformasjon enn nødvendig.

## Valgt løsning

- `listings.organization_id` er nullable og peker til `organizations`. `seller_id` beholdes som den personlige oppretteren og revisjonseieren. Private rader beholder `organization_id = null`; bedriftsrader har begge feltene.
- `organization_members` kobler en Kaupet-bruker til maksimalt én organisasjon og skiller `superuser` fra `member`, med status for invitasjon, aktiv tilgang og entitlement-basert deaktivering.
- Databasefunksjonene `organization_has_proff_access`, `sync_organization_entitlements`, `is_organization_superuser` og `can_act_for_organization` er den autoritative tilgangsgrensen. Klienten bruker samme entitlement-kontrakt til å vise og skjule Proff-funksjoner, men avgjør aldri tilgang med egen klokke alene.
- Bedriftsregistreringen verifiserer organisasjonsnummeret på serversiden mot Enhetsregisteret hos Brønnøysundregistrene. Bare organisasjonsnummer, juridisk navn og valgt postnummer/by lagres; gateadresse, e-post, telefon og nettside fra registeret lagres ikke.
- Nye bedriftskontoer oppretter organisasjon og superbrukermedlemskap i samme transaksjon som auth-opprettelsen etter at e-posten er bundet til en kortlivet signup-intent.
- Den eksisterende `handle_new_user()`-triggeren beholder privat profilinnsetting og oppretter organisasjon/superbrukermedlemskap atomisk når den mottar en gyldig business-signup-intent. Ugyldig eller utløpt intent ruller auth-opprettelsen tilbake.

## Alternativer vurdert

- **Erstatt `seller_id` med organisasjonseier.** Forkastet: samtaler, vurderinger, revisjonseierskap og eksisterende private annonser er personlige kontrakter. Å erstatte feltet ville kreve en bred og risikabel migrasjon, og ville gjøre det uklart hvem som faktisk utførte handlingen.
- **Kopier organisasjonsdata til hver listing.** Forkastet: profilendringer ville kreve masseoppdateringer og kunne gi sprik mellom annonser. Live-relasjon fra listing til organisasjon gjør at én profilendring vises konsistent.
- **La klienten slå opp Brønnøysundregistrene direkte.** Forkastet: klienten kan manipuleres, feilhåndteringen blir inkonsistent, og mer responsdata enn nødvendig eksponeres i registreringsflyten.

## Konsekvenser

- Private brukere og eksisterende annonser beholder nullable `organization_id` og dagens `seller_id`-semantikk.
- Superbrukeren kan administrere organisasjonens annonser og meldinger, mens en vanlig medlemshandling fortsatt har personlig `seller_id`. Ved fjerning av medlem overføres organisasjonens annonser til superbrukeren før medlemskapet slettes.
- Proff gir én umiddelbar, ikke-fornybar prøveperiode på 30 dager. Ved avbrudd eller utløp skjules branding og andre Proff-funksjoner, og ekstra medlemmer deaktiveres. Data beholdes slik at en fremtidig betalingsløsning kan gjenoppta tilgang uten datatap.
- En ny ekstern avhengighet til Brønnøysundregistrene gir behov for timeout-, 404-, rate-limit- og serverfeilhåndtering samt tester uten ekte nettverkskall.
- Den offentlige organisasjonstabellen inneholder bare annonse-/planpresentasjon. E-post- og betalingsdata ligger ikke i den offentlige modellen.

## Rollback

Migrasjonen kan rulles tilbake før appkoden tas i bruk. Private listing-rader beholdes ved rollback; den nullable organisasjonskoblingen og de nye organisasjonstabellene fjernes samlet. Dersom bedriftsdata allerede er tatt i bruk, må rollback først planlegges som en separat migrasjon med eksplisitt eksport/sletting av organisasjoner, medlemskap og bedriftsannonser. Brønnøysund-avhengigheten fjernes samtidig fra servergrensen; privat signup og private listing-flyter skal ikke endres.
