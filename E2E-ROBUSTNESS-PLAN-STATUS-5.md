# E2E-robusthetsplan, runde 5 — status

Oppfølging av "Anbefalte neste steg" fra
[E2E-ROBUSTNESS-PLAN-STATUS-4.md](E2E-ROBUSTNESS-PLAN-STATUS-4.md). Alle 5
punkter vurdert; to endringer gjort og pushet, tre punkter avsluttet uten
kodeendring (med begrunnelse under).

## 1 — Vurdere å fjerne `REVOKE EXECUTE ... FROM PUBLIC` fra trigger-funksjoner

**Ikke gjort — nedgradert etter nærmere undersøkelse.** Utgangspunktet for
denne anbefalingen var at REVOKE-en var årsaken til bugen i runde 4. Ved
nærmere undersøkelse av hvorfor `20260803130000` (GRANT-migrasjonen) alene
**ikke** løste problemet mens `20260803140000` (SECURITY DEFINER) gjorde
det, ble det klart at `supabase_auth_admin` sannsynligvis aldri manglet
EXECUTE i utgangspunktet (GRANT-migrasjonen var trolig et virkningsløst
tillegg) — det var mangelen på `SECURITY DEFINER` (og dermed RLS-blokkering
av de interne `UPDATE`/`INSERT`-setningene) som var hele årsaken. Dette
svekker premisset for punkt 1: en bred fjerning av `REVOKE ... FROM PUBLIC`
på ~20+ trigger-funksjoner på tvers av mange migrasjoner er en betydelig
endring med uklar gevinst, mot en usikker/mulig ikke-eksisterende risiko.
Ikke gjort, i tråd med føre-var-prinsippet fra punkt 5 i forrige runde.

## 2 — De to flaggede trigger-funksjonene uten `SECURITY DEFINER`

Begge undersøkt konkret (lest faktisk SQL, ikke antatt):

- **`listings_match_saved_searches_trigger()`**
  (`20260604192113_fa58e2f7-029c-42b8-a77c-0af4577f241f.sql:167`) — skriver
  ikke selv til noen tabell; kaller kun
  `public.match_listing_to_saved_searches(uuid)`, som **allerede er**
  `SECURITY DEFINER`. Ingen bug.
- **`enforce_conversation_read_status_only()`**
  (`20260623101340_conversation_read_status.sql:11`) — en ren
  valideringsfunksjon som kun leser `OLD`/`NEW` på samme rad og eventuelt
  `RAISE EXCEPTION`; skriver aldri til noen annen tabell. Trenger ikke
  `SECURITY DEFINER`.

**Konklusjon: begge falske positiver.** Ingen kodeendring nødvendig. Dette
bekrefter verdien av å verifisere fremfor å anta — et generelt
"legg til SECURITY DEFINER overalt"-søk ville vært unødvendig arbeid.

## 3 — Sjekke produksjonsfeilovervåkning

**Ikke gjennomførbart i denne økten.** Ingen tilgang til Sentry, loggaggregering
eller tilsvarende verktøy fra dette miljøet. Værende åpent — bør gjøres av
noen med tilgang til det faktiske overvåkningsverktøyet prosjektet bruker
(hvis noe), for å avgjøre om bugen fra runde 4 punkt 1 faktisk har rammet
ekte brukere siden 2026-06-22.

## 4 — Ett målrettet RLS-testtilfelle for annonsesletting

**Lagt til**, men **ikke kjørt lokalt** — se avvik under.

Ny test i `src/lib/rls.integration.test.ts`: en eier sletter sin egen
aktive, kategoriserte annonse (samme scenario som faktisk brøt i runde 4
punkt 1 — kun aktive/kategoriserte annonser trigger den interne
tellings-oppdateringen), og forventer at slettingen lykkes uten
trigger-/RLS-feil.

**Avvik fra plan:** `bun run test:rls` krever en lokal Supabase-stack via
Docker. Docker Desktop lot seg ikke starte i denne sandbox-økten (verken
via direkte prosess-start eller `cmd /c start` — prosessen dukket aldri opp
i `tasklist`, sannsynligvis fordi GUI-appstart er blokkert i dette
kjøremiljøet). Testen er derfor **ikke kjørt**, kun skrevet etter samme
mønster som de øvrige 34 testblokkene i filen, og verifisert med
`bunx tsc --noEmit` (grønn) og at den korrekt ekskluderes fra
`bun run test` (separat `vitest.integration.config.ts`, bekreftet — 184
tester fortsatt grønne, uendret). **Bør kjøres og bekreftes av noen med et
kjørende lokalt Docker-oppsett før den stoles på.**

**Sidefunn — rettet:** `CLAUDE.md` hevdet "Kun `conversations`/`messages`
har reell dekning per nå — resten av de ~45 RLS-aktiverte tabellene mangler
tilsvarende tester". Dette var vesentlig utdatert — testfilen dekker nå 35
`describe`-blokker på tvers av de fleste tabeller i skjemaet. Rettet i
samme commit, siden feilinformasjonen direkte hadde påvirket
begrunnelsen for denne anbefalingen i runde 4.

## 5 — Ikke gjøre mer enn dette uten nytt konkret funn

Overholdt: punkt 1 ble bevisst nedskalert til "ikke gjort" fremfor en bred
migrasjon, og ingen ny generell revisjon av de ~90 funksjonene i
`supabase/migrations/` ble startet.

## Lærdom fra denne runden

1. **En anbefaling skrevet rett etter en hendelse kan selv trenge
   revurdering i lys av bedre forståelse.** Punkt 1 så fornuftig ut da det
   ble skrevet (runde 4), men en grundigere lesning av _hvorfor_ første
   fiks-forsøk feilet mens det andre fungerte, svekket premisset. Å følge
   en egen tidligere anbefaling blindt ville vært samme feil som å
   kopiere et mønster uten å sjekke det.
2. **"Undersøk om X er berørt" bør faktisk gi et konkret svar, ikke bare
   en handling.** Begge kandidatene i punkt 2 var allerede trygge — verdien
   av runden var å lukke usikkerheten, ikke nødvendigvis å endre kode.
3. **Miljøbegrensninger bør rapporteres presist, ikke omgås eller
   skjules.** Docker/GUI-appstart var ikke tilgjengelig i denne sandboxen;
   fremfor å late som testen ble kjørt, eller bruke mer tid på å tvinge
   frem Docker, ble testen skrevet nøye og avviket dokumentert eksplisitt
   slik at noen med riktig miljø kan kjøre den og stole på resultatet.
