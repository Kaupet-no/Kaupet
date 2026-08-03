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

**Opprydning (etter eksplisitt bekreftelse):** Alle 35 gjenværende
`e2e-*@example.com`-testbrukere fra tidligere mislykkede kjøringer (tilbake
til 2026-08-02) er slettet fra staging, sammen med deres annonser
(kaskade). 0 av 35 feilet — dette bekrefter i praksis, ikke bare i
testkjøringer, at fiksen løser problemet også for det virkelige
slette-scenarioet.

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

## Anbefalte neste steg

Rangert etter verdi/innsats. I tråd med retningen satt i runde 3: prioriter
å fjerne det som skapte denne hendelsen fremfor å legge til nye
sikringsmekanismer rundt den.

1. **Revurder om `REVOKE EXECUTE ... FROM PUBLIC` på trigger-funksjoner i
   det hele tatt gir noe reelt sikkerhetsgevinst.** Dette mønsteret var selve
   årsaken til hendelsen i punkt 1 — og trigger-funksjoner kan uansett ikke
   kalles direkte via `SELECT`/RPC (Postgres nekter med "trigger functions
   can only be called as triggers" uavhengig av EXECUTE-rettigheter), så
   REVOKE-en ga trolig ingen reell beskyttelse i utgangspunktet, bare risiko
   for nøyaktig denne typen regresjon. **Lav innsats** (fjerne linjer, ikke
   legge til), **reduserer kompleksitet og fremtidig risiko** — motsatt av
   de fleste andre punktene her, som legger til. Vurder én migrasjon som
   fjerner REVOKE-linjene for rene trigger-funksjoner (ikke for
   SECURITY DEFINER RPC-er ment å kalles direkte, som `admin_*`-funksjonene
   — de trenger fortsatt REVOKE).
2. **Smalt, målrettet oppfølgingssøk: to trigger-funksjoner til mangler
   `SECURITY DEFINER`,** oppdaget ved samme grep-mønster som avdekket
   hovedbugen, men **ikke undersøkt om de faktisk er berørt** (ingen
   verifisering gjort i denne runden — bare et funn, ikke en konklusjon):
   `listings_match_saved_searches_trigger()`
   (`20260604192113_fa58e2f7-029c-42b8-a77c-0af4577f241f.sql:167`) og
   `enforce_conversation_read_status_only()`
   (`20260623101340_conversation_read_status.sql:11`). Sjekk om noen av dem
   skriver til en tabell med RLS aktivert og en ufullstendig policy-dekning
   (samme feilmønster som i punkt 1) — hvis ikke (f.eks. hvis de bare
   validerer/blokkerer på samme rad uten cross-table-skriving), trenger de
   ingen endring. **Ikke** legg til `SECURITY DEFINER` overalt "for
   sikkerhets skyld" uten å bekrefte at det faktisk trengs — det var
   nettopp den slags automatiske mønsterkopiering (eller mangel på den) som
   skapte avviket i utgangspunktet.
3. **Sjekk om feilen har vist seg i produksjon.** Bugen har vært aktiv siden
   2026-06-22 (annonsesletting for aktive/kategoriserte annonser). Hvis det
   finnes feilovervåkning (Sentry, loggaggregering e.l.) er dette et billig,
   konkret søk: se etter mislykkede sletteforsøk eller "Database error"-
   lignende serverfeil på annonseslettelse i perioden. Gir et faktisk bilde
   av brukerpåvirkning fremfor å anta ut fra kodeanalyse alene.
4. **Ikke bygg ut RLS-integrasjonstester bredt** (jf. runde 3 sitt punkt
   5-prinsipp: ikke utvid uten konkret behov) — men vurder å legge til
   **ett** målrettet testtilfelle: faktisk sletting av en aktiv, kategorisert
   annonse, som ville fanget nøyaktig denne bug-klassen automatisk. I dag
   har kun `conversations`/`messages` reell RLS-testdekning
   (jf. CLAUDE.md). Dette er ett konkret, bevist hull — ikke en generell
   "dekk alle 45 tabeller"-ambisjon.
5. **Ikke gjør noe mer enn dette uten et nytt konkret funn.** Poenget med
   denne runden var å lukke et reelt, bevist hull — ikke starte en generell
   sikkerhetsrevisjon av alle ~90 funksjonene i `supabase/migrations/`. Punkt
   1-4 over er avgrenset til det som direkte følger av det som faktisk ble
   funnet denne runden.
