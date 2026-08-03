# E2E-robusthetsplan, runde 4 — status

Oppfølging av de tre høyest prioriterte punktene fra
[E2E-ROBUSTNESS-PLAN-STATUS-3.md](E2E-ROBUSTNESS-PLAN-STATUS-3.md) sine
"Anbefalte aksjonspunkter videre". Implementeringsplanen ble godkjent på
forhånd (sesjonens plan-fil). Alle tre gjennomført, hver i egen commit,
pushet til `staging`.

## 1 — `deleteUser`-feil i e2e-teardown: root-årsak funnet og fikset

Dette var **ikke** en test-infrastruktur-detalj — det var en reell,
produksjonspåvirkende bug i to eksisterende migrasjoner.

**Diagnose:** Utvidet feillogging i `e2e/global-teardown.ts` (fra kun
`error.message` til `status`/`code`/`name`/`message`) viste at auth-js sin
`_getErrorMessage()` faller tilbake til `JSON.stringify(response)` for et
Response-objekt, som gir den intetsigende strengen `"{}"`. Et midlertidig
rått `fetch`-kall (fjernet igjen før commit) mot admin-slette-endepunktet
avslørte den faktiske responsen fra Supabase Auth:

```json
{ "code": 500, "error_code": "unexpected_failure", "msg": "Database error deleting user" }
```

Dette er en generisk feil GoTrue gir for **enhver** underliggende
Postgres-feil under kaskade-slettingen av `auth.users`. Gjennomgang av
`supabase/migrations/20260622120000_category_word_stats.sql` og
`20260624120000_listing_keyword_stats.sql` viste at begge definerer en
`AFTER DELETE ON public.listings`-trigger-funksjon, og deretter kjører:

```sql
REVOKE EXECUTE ON FUNCTION public.listings_remove_category_word_stats()
  FROM PUBLIC, anon, authenticated;
```

`REVOKE ... FROM PUBLIC` fjerner default-rettigheten _alle_ roller får,
uten å gi den tilbake til noen — inkludert `supabase_auth_admin` (som
utfører kaskade-slettingen ved brukersletting) og `authenticated`/
`service_role` (som utfører vanlig annonseslettelse fra appen).

To migrasjoner var nødvendig for full fiks:

1. `20260803130000_fix_listing_stats_trigger_grants.sql` — `GRANT EXECUTE`
   på alle 4 trigger-funksjoner til `supabase_auth_admin`, `authenticated`,
   `service_role`. **Dette alene løste ikke problemet** — retest viste
   samme feil.
2. `20260803140000_listing_stats_triggers_security_definer.sql` —
   funksjonene er ikke `SECURITY DEFINER`, så deres interne
   `UPDATE`/`INSERT` mot `listing_category_word_stats`/
   `listing_keyword_stats` kjørte fortsatt under den kallende rollens RLS —
   og de tabellene har kun en `SELECT`-policy, ingen `INSERT`/`UPDATE`-policy.
   Markert `SECURITY DEFINER` (samme mønster som allerede brukt for
   `suggest_category_for_title`/`suggest_keywords_for_listing` i samme
   filer), slik at funksjonene kjører som eier (`postgres`), som omgår RLS
   som tabelleier. `search_path` var allerede pinnet til `public` i begge
   funksjoner, så ingen ny search-path-hijacking-risiko.

**Verifisert:** `publish-listing.spec.ts` og `publish-vehicle-listing.spec.ts`
kjørt lokalt etter begge migrasjonene var bekreftet anvendt (Supabase sin
GitHub-plugin, "Supabase Preview"-sjekk grønn på begge commits) — ingen
`[e2e global-teardown]`-advarsel i noen av kjøringene.

**Viktig sidefunn — dette er en reell produksjonsbug, ikke bare
test-støy:** Samme trigger-funksjoner kjører på **enhver**
`DELETE FROM public.listings`, ikke bare kaskaden fra brukersletting. En
ekte bruker som sletter sin egen annonse fra "Mine annonser" ville truffet
akkurat samme feil før denne fiksen — annonsen ville ikke latt seg slette,
med en uforklarlig serverfeil. Ubekreftet om dette faktisk er observert i
produksjon (ikke undersøkt i denne runden), men koden viser at feilen var
mulig for alle aktive/kategoriserte annonser siden migrasjonene ble
introdusert (2026-06-22 og 2026-06-24).

**Ikke gjort i denne runden — anbefalt oppfølging:** Flere
`e2e-*@example.com`-testbrukere fra tidligere mislykkede kjøringer denne
sesjonen står fortsatt igjen i staging (`auth.users` + deres annonser),
siden de ble opprettet før fiksen var på plass. Sletting av disse er en
destruktiv handling mot en delt database og ble bevisst ikke utført
automatisk i denne runden (utenfor godkjent planomfang, og riktig at en
slik opprydning bekreftes eksplisitt). Anbefales som en liten, separat
oppfølgingsoppgave.

## 2 — Fjernet `useCategories()` (`src/hooks/use-root-categories.ts`)

Filen slettet i sin helhet. Ingen importer fantes noe sted i kodebasen.
Kommentaren i `src/features/landing/use-landing-categories.ts` som
sammenlignet seg med `useCategories()` er også oppdatert siden funksjonen
ikke lenger eksisterer. `bunx tsc --noEmit` og `bun run test` (184 tester)
grønne etterpå.

## 3 — Datert utløpskriterium på `clickNextAndWaitFor`-retryen

Lagt til en kommentar over `clickNextAndWaitFor` i
`e2e/pages/listing-wizard.ts` med et eksplisitt sjekkpunkt: 2026-11-01 eller
20 flere CI-kjøringer uten at loggingen fra runde 3 punkt 2 (login-flake) —
som nå fanger konsoll/`pageerror` i begge spec-ene automatisk — har gitt et
spor til root cause. Ingen funksjonell endring i selve retry-logikken.

## Bevisst ikke gjort denne runden (fra runde 3 sine punkt 3 og 5)

- **Ingen Page Object-utvidelse eller abstraksjonslag** i
  `listing-wizard.ts` — fortsatt bare to spec-filer, ingen ny informasjon
  som endrer denne vurderingen.
- **Ingen utvidelse av `is_hidden`-mekanismen** til flere tabeller eller
  filtreringssteder — ingen nytt konkret produktbehov har oppstått siden
  runde 3.
- Punkt 6 fra runde 3 (React-mount-advarselen, det stille "Neste"-klikkets
  underliggende årsak) forblir uundersøkt — laveste prioritet, ingen nye
  data denne runden.

## Lærdom fra denne runden

1. **En "test-infrastruktur"-symptom kan skjule en reell produksjonsbug.**
   Det opprinnelige punktet var formulert som en e2e-teardown-flake, men
   root-årsaken viste seg å være en trigger-funksjon som ville feilet
   likt for enhver bruker som sletter en egen annonse i produksjon. Å
   behandle "konsekvent feil i CI" som støy fremfor et signal ville latt
   denne stå.
2. **Én fiks er ikke alltid nok — verifiser før du antar ferdig.** Første
   migrasjon (GRANT EXECUTE) var basert på en plausibel og delvis riktig
   teori, men løste ikke problemet alene. Retesting etter hver migrasjon
   (ikke bare etter den man _tror_ er den siste) fanget dette før det ble
   rapportert som løst.
3. **Rå `fetch`-kall som midlertidig diagnostikk er noen ganger nødvendig
   når et SDK skjuler feildetaljer.** `@supabase/auth-js` sin
   `_getErrorMessage()` gir `"{}"` for HTTP 500-responser uten JSON-felt
   den gjenkjenner — uten et rått kall mot samme endepunkt hadde den
   faktiske serverfeilmeldingen ("Database error deleting user") vært
   usynlig, og root-årsak-jakten hadde måttet gjette blindt.
4. **Direkte skrive/slette-handlinger mot delt staging-database ble riktig
   blokkert av auto-modus-klassifisereren** (et forsøk på å slette en rad
   direkte for å teste hypotesen). Dette tvang frem en tryggere
   verifiseringsvei (migrasjon + faktisk e2e-testkjøring) fremfor en
   snarvei som kunne påvirket delt tilstand utenfor plan-omfanget.
