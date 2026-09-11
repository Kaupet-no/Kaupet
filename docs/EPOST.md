# E-post

All e-post Kaupet sender går gjennom **Resend**, fra avsenderdomenet
`varsel.kaupet.no`. Det finnes to uavhengige kanaler, og de blandes ofte
sammen:

| Kanal             | Hvem sender                     | Hva                                             | Kode / oppsett                                 |
| ----------------- | ------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| **Supabase Auth** | Supabase, via Resend SMTP       | Bekreft e-post, tilbakestill passord            | Dashboard per prosjekt + `supabase/templates/` |
| **Applikasjonen** | Kaupet-workeren, via Resend SDK | Varsler til brukere, interne varsler til Kaupet | `src/lib/email.server.ts`                      |

Forskjellen betyr noe: Supabase eier bekreftelseslenken og tokenet, og bruker
Resend kun som transport. Applikasjonens e-post går aldri innom Supabase Auth.

Personvernsiden av dette (Resend som databehandler, overføringsgrunnlag,
lagringstid) er dokumentert i
[PERSONVERN-BEHANDLINGSPROTOKOLL.md](PERSONVERN-BEHANDLINGSPROTOKOLL.md) § 8 —
ikke dupliser den her.

## Felles oppsett

### Avsenderdomene

1. Verifiser `varsel.kaupet.no` (eller et annet avsenderdomene) i Resend.
2. Publiser SPF, DKIM og DMARC som Resend oppgir.
3. Deaktiver Resend click/open tracking. Tracking skriver om lenker i
   e-posten, og det ødelegger Supabases bekreftelseslenke.

### Miljøvariabler

| Variabel            | Brukes av                                      | Merknad                                                    |
| ------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `RESEND_API_KEY`    | Både applikasjonen og lokal Supabase Auth SMTP | Server-only. Legg den aldri i en `VITE_*`-variabel         |
| `RESEND_FROM_EMAIL` | `src/lib/email.server.ts`                      | Faller tilbake til `Kaupet.no <ikkesvar@varsel.kaupet.no>` |

Nøkkelen settes på workeren med
`wrangler secret put RESEND_API_KEY --name <worker>`, eller i Supabases
SMTP-innstilling for auth-kanalen. Aldri i git.

Uten `RESEND_API_KEY` logger `email.server.ts` en feil og hopper over
utsendingen — den kaster ikke. Lokal utvikling sender altså ingenting med
mindre nøkkelen er satt.

## Kanal 1 — Supabase Auth

`supabase/config.toml` og `supabase/templates/confirmation.html` er den lokale,
versjonerte referansen. De hostede prosjektene (staging og produksjon er
separate prosjekter) konfigureres i Supabase-dashboardet og kan ikke
verifiseres fra repoet.

Per prosjekt:

1. **Authentication → Email → SMTP Settings:** `smtp.resend.com`, port `465`
   eller `587`, bruker `resend`, Resend API key som passord, avsender
   `Kaupet.no <ikkesvar@varsel.kaupet.no>`.
2. **Authentication → Email Templates → Confirm signup:** lim inn
   `supabase/templates/confirmation.html`. Behold `{{ .ConfirmationURL }}`.
3. **Authentication → URL Configuration:** se neste avsnitt.

### Redirect-lista

**Site URL:** `https://staging.kaupet.no` — i produksjonsprosjektet
`https://kaupet.no`.

**Redirect URLs:**

- `https://staging.kaupet.no/auth**`
- `https://staging.kaupet.no/tilbakestill-passord`
- `https://staging.kaupet.no/bekreft-epost`

Tilsvarende med `https://kaupet.no/…` i produksjonsprosjektet.

#### Hvorfor `/auth**` og ikke en eksakt URL

Bekreftelseslenken peker ikke lenger på forsiden. `authConfirmationRedirect`
(`src/lib/auth-return.ts`) sender brukeren til
`https://<origin>/auth?mode=signin&returnTo=<urlenkodet>`, slik at en utlogget
gjest som fylte ut en annonse kommer tilbake til utkastet sitt etter
registrering (`resume=auth-publish`). En eksakt oppføring kan ikke dekke den
query-strengen.

Supabase matcher med glob: `*` treffer en sekvens av ikke-separator-tegn, `**`
treffer alt inkludert separatorer, og separatorene er kun `.` og `/`. `?` og
`&` er altså ikke separatorer, og `returnTo` er `encodeURIComponent`-et (`/` →
`%2F`), så query-strengen inneholder normalt ingen separatorer. Skriv ikke `?`
literalt i mønsteret — i glob betyr det «ett vilkårlig tegn».

Hvis `/auth**` ikke godtas eller ikke treffer, bruk `https://<vert>/**`. Den
formen er eksplisitt dokumentert av Supabase. Den er videre, men verten er
fortsatt låst, og `returnTo` saniteres uansett av `safeReturnTo` før den brukes
som navigasjonsmål.

Native-bygg sender alltid `https://kaupet.no` som origin (`webOrigin()` i
`src/routes/auth.tsx`), også når appen ellers peker på staging. Et native
staging-bygg treffer derfor produksjonsprosjektets redirect-liste, ikke
stagings.

#### Verifiser redirect-lista

Supabase kaster ikke feil ved manglende treff — den faller tilbake til **Site
URL**. Registrering ser da ut til å fungere, men brukeren lander på forsiden i
stedet for på `returnTo`-målet, og et gjesteutkast blir aldri gjenopptatt. Lista
må derfor testes, ikke bare settes:

1. Fyll ut en annonse på `/ny-annonse` som utlogget bruker og trykk
   «Logg inn og publiser».
2. Registrer en ny bruker fra `/auth`.
3. Åpne bekreftelseslenken i e-posten.
4. Du skal lande på `/auth?mode=signin&returnTo=…resume%3Dauth-publish` — ikke
   på `/`. Lander du på `/`, er mønsteret ikke truffet.

Samme flyt dekkes automatisk fram til innloggingen av
`e2e/publish-listing-guest.spec.ts`; selve e-postrundturen må testes manuelt.

## Kanal 2 — applikasjonens e-post

`src/lib/email.server.ts` eksporterer to funksjoner. Begge er server-only og
importeres dynamisk på kallstedet.

### `sendNotificationEmail` — varsler til brukere

Kalles fra varselutsendingen i
`src/routes/api/public/push/dispatch.ts`, som e-postgrenen ved siden av
web-push. HTML-en rendres av `renderNotificationEmail` i
`src/lib/email-templates.ts`.

Typene er lukket (`NotificationEmailType`): `message`,
`conversation_created`, `saved_search`, `wtb_match`, `price_drop`, `sold`.
Hver type har fast eyebrow/intro/CTA-tekst i `COPY`-tabellen — legger du til
en ny type, må den registreres der.

Om en bruker får e-post styres av `notification_preferences` per hendelsestype.
Utsendingsfeil logges og svelges, slik at én mislykket e-post ikke stopper
resten av varselutsendingen.

Malene bruker hardkodede hex-farger hentet fra `src/styles.css`, ikke
design-tokens: de fleste e-postklienter støtter ikke `oklch()`. Endrer du
merkefargene i appen, må disse oppdateres manuelt.

### `sendInternalEmail` — varsler til Kaupet

Ren tekst til en Kaupet-innboks (salg, drift). Kalles i dag fra
`src/lib/business.functions.ts` ved bedriftsregistrering. Går bevisst ikke
gjennom `renderNotificationEmail` — de malene er den kundevendte
varseldesignen, ikke et internt format.

## Lokal utvikling

`supabase/config.toml` styrer den lokale stacken. `site_url` og
`additional_redirect_urls` peker på dev-serverens port (`8080`, se
`vite.config.ts`), og redirect-lista har samme glob-form som de hostede
prosjektene — en eksakt URL kan ikke matche bekreftelseslenken.

Lokal Supabase fanger utgående e-post i Inbucket i stedet for å sende den, med
mindre du eksplisitt konfigurerer SMTP. Test derfor den ekte
e-postrundturen i staging, alltid mot en kontrollert adresse.
