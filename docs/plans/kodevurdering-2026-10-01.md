# Kodevurdering – Kaupet (1. oktober 2026, `staging` @ 8913d734)

## Grunnlag

- **Kjørt:** `bunx tsc --noEmit` (grønn), `bun run lint` (grønn, 0 advarsler),
  `bun run test:coverage` (235 filer, 1370 tester grønne, ~40 % linjedekning).
- **Ikke kjørt:** `test:rls`, `test:e2e`.
- **Metode:** statisk analyse av hele `src/` (~140 000 linjer, 1220 filer):
  filstørrelser, hook-tetthet, suppressions, importgraf, mønstre for
  serverfunksjoner/feil/formattering. Store filer er lest i utdrag, ikke
  linje for linje.

## Sammendrag

Grunnmuren er god. Typesjekk og lint er rene, det finnes ingen
`@ts-ignore`, bare 9 `any`, ingen foreldreløse moduler, og grensen mellom
server og klient håndheves både av lint og et eget skript. Den største
gjelden ligger i noen få «gudekomponenter» og i serverlaget, der
konvensjoner er etablert men ikke håndhevet. Det gjelder særlig feiltyper,
auth-mønster og formattering. Tre lavrisikotiltak (F2, F3 og F8) gir mest
igjen per time. Det dyreste og viktigste tiltaket er F1.

## Rangering

Effekt = gevinst i kvalitet, drift eller forenkling. Risiko = sjansen for
regresjon når tiltaket gjennomføres.

| #   | Funn                                                         | Effekt      | Risiko  | Prioritet |
| --- | ------------------------------------------------------------ | ----------- | ------- | --------- |
| F2  | 101 brukerfeil kastes som `Error` (gir 500 og feil-logg)     | Høy         | Lav     | **1**     |
| F3  | Auth på serverfunksjoner er ikke håndhevet maskinelt         | Høy         | Lav     | **2**     |
| F1  | `ny-annonse.tsx` er en gudekomponent på 2347 linjer          | Høy         | Høy     | **3**     |
| F5  | Pengestier har lav eller ingen enhetsdekning                 | Middels     | Lav     | 4         |
| F4  | `business.functions.ts`: 1337 linjer og 89 service-role-kall | Middels–høy | Middels | 5         |
| F8  | Formattering dupliseres utenom `lib/format.ts`               | Lav–middels | Lav     | 6         |
| F10 | Små cache-feil (`ipCache`, `suggestionCache`)                | Lav         | Lav     | 7         |
| F6  | Hook-hygiene: 39 suppressions og 43 `eslint-disable`         | Middels     | Middels | 8         |
| F7  | Søk/filter-UI er spredt over `components/` og `features/`    | Middels     | Middels | 9         |
| F9  | Boilerplate for admin-klienten (82 dynamiske importer)       | Lav         | Lav     | 10        |
| F11 | Parallell utkastlogikk for salg og ønskes kjøpt (WTB)        | Lav–middels | Middels | 11        |
| F12 | `rls.integration.test.ts` er på 7400 linjer                  | Lav         | Lav     | 12        |

---

## F2 – Brukerfeil kastes som vanlig `Error`

**Funn.** `to-client-error.ts` og `serverFnErrorLogMiddleware`
([src/start.ts](../../src/start.ts)) definerer en klar regel. `ClientError`
betyr en forventet brukerfeil: den gir 4xx og logges som advarsel. Alt annet
gir 500 og `console.error`. I `*.functions.ts` finnes likevel **101**
`throw new Error("<norsk brukermelding>")` og bare **13** `ClientError`.
Et eksempel er `admin-promotions.functions.ts:121`:
`throw new Error("Fant ikke fremheving")`.

**Konsekvens.** Validerings- og tilstandsfeil gir HTTP 500 og havner som
feil i Workers-loggen. Det gir støy i varsling, og ekte feil drukner.

**Tiltak.** Bytt mekanisk til `new ClientError(msg, 400|403|404|409)`. Legg
deretter inn en ESLint `no-restricted-syntax`-regel for
`throw new Error(Literal)` i `**/*.functions.ts`, slik at mønsteret ikke
kommer tilbake.

## F3 – Auth på serverfunksjoner er ikke håndhevet maskinelt

**Funn.** 127 av omtrent 190 `createServerFn` bruker
`.middleware([requireSupabaseAuth])`. Resten er enten bevisst offentlige,
token-autoriserte (for eksempel `vehicle-360.functions.ts`) eller sjekker
`supabase.auth.getUser()` inline (for eksempel `my-listings.functions.ts`).
Alle varianter kan være riktige, men ingenting skiller «bevisst offentlig»
fra «glemt auth».

**Tiltak.** Lag `scripts/check-server-fn-auth.mjs` etter mønsteret fra
`check-server-boundary`. Skriptet skal feile når en `createServerFn` mangler
`requireSupabaseAuth` og ikke står i en eksplisitt allowlist med begrunnelse.
Gjør inline-`getUser()`-varianten om til middleware der det går.

## F1 – `src/routes/ny-annonse.tsx` er en gudekomponent

**Funn.** Én funksjonskomponent på 2347 linjer med 27 `useState`, 14 `useRef`,
11 `useEffect` og 13 `useMemo`/`useCallback`. Filen står for **15 av 30**
`react-hooks`-disables i hele `src/` og har **0 %** enhetsdekning. Kommentarene
dokumenterer rekkefølgehacks, for eksempel at state er «hoisted above its
natural spot» og at `goNextRef` brukes for å bryte en sirkulær avhengighet
mellom `useVehicleLookupFlow` og `pages`. Dette er salgsflyten, altså
kjerneverdien i produktet.

**Tiltak** (trinnvis, med `publish-listing*.spec.ts` som sikkerhetsnett):

1. Flytt navigasjonen ut i en ren reducer, `use-wizard-navigation.ts`. Den
   skal eie `step`, `furthestStep`, review-hopp og ventende fokus/anker
   (`returnToReviewRef`, `pendingReviewFocusRef`, `reviewJumpRequested` osv.)
   og kunne enhetstestes uten DOM.
2. Flytt kategori-tilstanden (`categoryConfirmed`, `categoryTouchedManually`,
   `pendingCategoryChange`, `editingCategoryViaTitle`, `categoryEditConfirmOpen`)
   til en egen hook.
3. Flytt publisering, opplasting og Turnstile (`uploadProgress`, `publishedId`
   osv.) til en tredje hook.

Målet er en rute under 600 linjer der `goNextRef`-hacket ikke lenger trengs.

## F4 – `src/lib/business.functions.ts`

**Funn.** Filen er på 1337 linjer, har 89 `supabaseAdmin`-kall og 53 %
linjedekning. RLS er dermed omgått for hele bedriftsdomenet, og all
autorisasjon ligger i appkode. `requireOrganizationMember` kjører i tillegg
RPC-en `sync_organization_entitlements`, en skriveoperasjon, på _hvert_ kall,
også ved lesing. Linje 50 inneholder en uferdig migrering:
«Temporary wire-compatible shape while callers migrate to location scope».

**Tiltak.**

- Del filen etter subdomene: medlemmer, lokasjoner, plan/fakturering og
  integrasjoner.
- Fullfør migreringen og fjern `OrganizationMemberPermissions`-shimmen.
- Flytt entitlement-synk til trigger eller cron, eller kjør den bare ved
  skriving.
- Vurder RLS for lesestiene, slik at service-role bare brukes der det
  faktisk trengs.

## F5 – Lav dekning på pengestier

**Funn.** Mange `*.functions.ts` har 0 % enhetsdekning. RLS-suiten dekker
deler av dette, men ikke forretningslogikken i appkoden. Pengestiene ligger
lavt: `vipps.server.ts` 44 %, `api/public/vipps/webhook.ts` 62 % (46 %
grener), mens `promotions.functions.ts` og `admin-proff.functions.ts` er
lavt dekket.

**Tiltak.** Trekk ut ren logikk, som tilstandsoverganger for betaling,
refusjon og fakturering, og test den (PB-1). Prioriter webhook-grenene.
Hev tersklene i `vitest.config.ts` etter hvert som dekningen øker.

## F6 – Hook-hygiene

**Funn.** `eslint-suppressions.json` har 39 `set-state-in-effect` i 28 filer.
I tillegg kommer 30 `exhaustive-deps`- og 13 `refs`-disables. Baselinen
stopper nye tilfeller, og det er bra.

**Tiltak.** Rydd når filen likevel røres. De fleste
`set-state-in-effect`-tilfellene er avledet tilstand som kan beregnes i
render eller nullstilles med `key`. Start med `listings-map.tsx` (4) og
`range-filter-field.tsx` og `advanced-search-sheet.tsx` (2 hver).

## F7 – Søk/filter-UI er spredt

**Funn.** Filter-UI ligger i `components/advanced-search-sheet.tsx` (771
linjer), `native-advanced-search.tsx`, `attribute-filter-chips.tsx` (1158),
`category-filter-fields.tsx`, `active-filters.tsx` og
`features/listing-search/search-panel/{filter-sections (1358), search-panel
(1259)}.tsx`. Importene går begge veier: 20 `components/`-filer importerer
fra `@/features/`, og `search-panel` importerer tilbake fra `components/`.

**Tiltak.** Samle all søke-UI i `features/listing-search/`. Kartlegg deretter
om `attribute-filter-chips` og `filter-sections` rendrer de samme feltene på
hver sin måte. Det har jeg ikke verifisert linje for linje.

## F8 – Formattering dupliseres

**Funn.** `src/lib/format.ts` finnes, men 41 filer kaller
`toLocaleString("nb…")` direkte, og minst 8 filer har en lokal `formatDate`
(blant annet `moderation-banner.tsx`, `integrations-panel.tsx`, `admin/bedrifter.tsx`
og `kvittering.$promoId.tsx`). I tillegg finnes `formatRelative` og
`formatRelativeTime` i to filer.

**Tiltak.** Legg `formatDate`, `formatDateTime` og `formatRelative` i
`lib/format.ts` og erstatt de lokale kopiene. Det er mekanisk og trygt.

## F9 – Boilerplate for admin-klienten

**Funn.** Koden har 82 `await import("@/integrations/supabase/client.server")`,
pluss lokale `getAdmin()`-hjelpere. `start.ts` (rundt linje 116) oppretter i
tillegg sin egen service-role-klient ved hver cache-miss i stedet for å
gjenbruke `supabaseAdmin`.

**Tiltak.** Lag én delt `getSupabaseAdmin()` som fortsatt importerer
dynamisk. Gjenbruk den i `start.ts`.

## F10 – Små cache-feil

- `ipCache` i `src/start.ts:72` sletter aldri utløpte nøkler, så kartet vokser
  med hver unike IP per isolate. Fiks: `delete` ved utløp eller et enkelt tak
  på størrelsen.
- `suggestionCache` i `category-suggestion.functions.ts:158` lagrer en feilet
  forespørsel som `{ suggestions: [] }` ut økten. En forbigående feil gir da
  permanent tomme forslag for den tittelen. Fiks: `suggestionCache.delete(key)`
  i `catch`.

## F11 – Parallell utkastlogikk

**Funn.** `use-draft-autosave.ts` (622 linjer) og `use-wtb-draft-autosave.ts`
(284 linjer) implementerer hver for seg lagring lokalt og på serveren,
utløp etter 7 dager og gjenoppretting.

**Tiltak.** Ikke slå hookene sammen; flytene er ulike nok. Trekk heller ut
felles primitiver (`readDraft`/`writeDraft` med try/catch, utløpssjekk og
synk av draft-id) til én modul. Gjør det først når en av hookene uansett
skal endres.

## F12 – Testfil på 7400 linjer

`src/lib/rls.integration.test.ts` bør deles per tabell eller domene. Da blir
den lettere å navigere, og feil i CI blir lettere å lokalisere.

---

## Det som fungerer godt (bør beholdes)

- Rene tsc- og lint-kjøringer, nesten ingen typeescapes, og baseline for
  ESLint-suppressions.
- Server-/klientgrense håndhevet av lint og `check:server-boundary`, og
  vertikal-agnostisk kjerne håndhevet av lint.
- Sikkerhetsheadere med CSP-nonce, rate limiting i databasen, og ZodError og
  ClientError mappet til 4xx.
- Teststrategien med egne agenter og playbooks gir tydelige rammer for
  oppfølging av F5.

## Forslag til rekkefølge

1. **Sprint 1 (lav risiko, høy gevinst):** F2, F3, F8 og F10. Dette er
   mekaniske endringer, og de nye lint- og skriptreglene hindrer at problemene
   kommer tilbake.
2. **Sprint 2:** F5 for pengestiene, deretter første trinn av F1 (reducer
   for navigasjon) med tester.
3. **Løpende:** F6, F7, F9 og F11 når filene likevel røres. F4 bør planlegges
   som egen oppgave sammen med migreringen til lokasjons-scope.
