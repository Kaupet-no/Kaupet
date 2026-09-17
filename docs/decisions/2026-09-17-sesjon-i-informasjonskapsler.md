# Supabase-sesjonen i informasjonskapsler, og forespørselsavgrenset serverklient

## 1. Kontekst og problem

Sesjonen lå i `localStorage`. Serveren kunne derfor aldri se hvem brukeren
var: `auth-attacher.ts` festet et bearer-token på hvert serverfunksjonskall,
men serveren holdt aldri en sesjon. Konsekvensen var at `_authenticated` var
satt til `ssr: false` — en side som ikke kan avgjøre innlogget tilstand på
serveren, kan heller ikke server-rendres — og at `/mine-annonser` hadde tom
body til 343 ms (funn F8 i sluttbrukertesten).

To ting gjorde dette til mer enn en flytting av lagringssted:

1. **Lekkasjerisiko.** `client.ts` eksporterer en klient i modulomfang. På
   Cloudflare Workers lever modulomfang på tvers av forespørsler i samme
   isolat. En _sesjonsbærende_ klient der kan servere én brukers sesjon til
   en annen brukers forespørsel. I dag er det umulig fordi serverklienten
   aldri har en sesjon; endringen gjør feilklassen mulig.
2. **CSRF.** Kapsler sendes automatisk. CSRF-middlewaren i `src/start.ts`
   unntar bevisst GET fordi GET skal være lesende. En muterende GET var
   ufarlig så lenge bearer-tokenet aldri ble sendt automatisk — med kapsler
   er den det ikke.

## 2. Valgt løsning

`@supabase/ssr` (ny avhengighet), delt i to klienter:

- **Nettleser** (`client.ts`): `createBrowserClient`, som lagrer sesjonen i
  en kapsel med `Secure` og `SameSite=Lax`. På serveren returnerer samme
  modul en bevisst **sesjonsløs** klient, slik at modulomfanget aldri holder
  en sesjon — sikkerhetsegenskapen fra før migrasjonen er altså uendret.
- **Server** (`session.server.ts`): `getSupabaseServerClient()` oppretter en
  **ny** klient per kall og leser kapsler fra den ambiente forespørselen
  (TanStack Start holder den i AsyncLocalStorage). Ingen singleton, ingen
  cache med brukernøkkel — en slik cache ville hatt isolatets levetid og
  dermed samme problem. `session.server.test.ts` feiler hvis noen senere gjør
  den om til en singleton.

I tillegg: ESLint-regelen `no-restricted-syntax` i `eslint.config.js` sperrer
`.insert/.update/.upsert/.delete` inne i en `createServerFn({ method: "GET" })`.

### `SameSite=Lax`, ikke `Strict`

Bekreftelse av e-post, passordtilbakestilling og bedriftsinvitasjon kommer
inn som en top-level navigasjon fra et _annet_ nettsted (lenke i e-post).
`Strict` ville holdt kapselen tilbake på nettopp den første navigasjonen, så
serveren ville rendret siden som utlogget for en bruker som faktisk har en
gyldig sesjon. `Lax` sender kapselen på top-level GET — som er det SSR
trenger — men ikke på kryssopprinnelses-POST eller underressurser.
Skriveveier er dessuten dekket av den globale CSRF-middlewaren, og muterende
GET av ESLint-regelen over.

### Avvik: ikke `HttpOnly`

Oppgaven ba om `HttpOnly`. Det er ikke forenlig med denne arkitekturen.
`createBrowserClient` leser sesjonen fra `document.cookie`; med `HttpOnly`
ser nettleserklienten ingen sesjon, og de 36 direkte `.from()`-spørringene,
72 `.rpc()`-kallene, 15 storage-kallene og realtime-abonnementet på meldinger
slutter å virke. Å få dem til å virke under `HttpOnly` betyr å rute alt
gjennom serveren — en langt større endring enn denne.

En delt modell (`HttpOnly` refresh-token + kortlevd access-token seedet til
nettleseren) ble vurdert og forkastet, se § 3.

**Hva dette betyr:** sesjonen er JS-lesbar. Det er ingen regresjon mot
`localStorage`, som er like JS-lesbart, men det er heller ingen forbedring på
den aksen. Ved XSS er sesjonen kompromittert, som før.

## 3. Alternativer som faktisk ble vurdert

- **Delt modell: `HttpOnly` refresh-kapsel + access-token i minnet.** Ville
  gitt en reell gevinst — XSS kunne stjålet et én-times access-token, men
  ikke den langlevde sesjonen. Forkastet fordi supabase-js sitt
  `accessToken:`-alternativ slår av hele auth-manageren, og de 37
  `supabase.auth.*`-kallene i 23 filer (innlogging, utlogging, registrering,
  passordtilbakestilling, e-postbekreftelse, invitasjon) måtte blitt
  serverendepunkter. Alternativet — en håndrullet storage-adapter med
  plassholder-refresh-token og et eget fornyelsesendepunkt — er bespoke
  sesjonsmekanikk nøyaktig der sporadiske utlogginger oppstår. Avveiningen
  ble: tryggere mot en sjeldnere trussel (XSS-tyveri av refresh-token), mer
  utsatt for en vanligere feil (ødelagt sesjonshåndtering for ekte brukere).
- **Beholde `localStorage` og bare akseptere 343 ms.** Fullt forsvarlig, og
  det tryggeste. Forkastet fordi gevinsten er reell på autentiserte sider,
  særlig på mobilnett, og fordi kapsler er en forutsetning for at
  `_authenticated` i det hele tatt kan server-rendres.
- **Kun flytte sesjonen, uten SSR.** Forkastet: det gir null målbar gevinst
  (se § 1) og innfører lekkasjerisikoen uten å innløse noe.

## 4. Konsekvenser og reverseringsstrategi

**Konsekvenser**

- Sesjonen sendes på hver same-origin forespørsel. Derfor ESLint-vernet mot
  muterende GET; uten det er GET-gjennomgangen ferskvare.
- Serverkode som trenger brukerens sesjon _må_ bruke
  `getSupabaseServerClient()`. `supabaseAdmin` (service-role) er fortsatt
  kun for operasjoner som bevisst skal omgå RLS.
- `_authenticated` har SSR på. De ni søskenrutene setter selv `ssr: false`
  inntil de er gjennomgått, så bare `/mine-annonser` server-rendres nå.
  Å slå på SSR for de øvrige krever at hver rute verifiseres server-side.
- Rot-loaderen leser sesjonen på hver side. Den bruker `getClaims()` (lokal
  JWT-verifisering mot JWKS), ikke `getUser()` — med `getUser()` kostet
  forsiden 74–266 ms, med `getClaims()` 12 ms.
- Native: produksjon kjører WebViewen på `https://kaupet.no` med
  `androidScheme: "https"`, så kapselen er same-origin.
  `MainActivity.java:69` skrur på tredjepartskapsler kun for staging; den
  avveiningen er ikke rørt.

**Reversering**

Ingen migrasjon og ingen skjemaendring, så tilbakerulling er ren kode.
Å revertere commitene gir `localStorage` tilbake. Merk at innloggede brukere
da må logge inn på nytt én gang: sesjonen ligger i en kapsel som den gamle
koden ikke leser. Det gjelder begge veier, også ved utrulling.
