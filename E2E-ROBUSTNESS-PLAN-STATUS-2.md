# E2E-robusthetsplan, runde 2 — status

Oppfølging av forslagene i [E2E-ROBUSTNESS-PLAN-STATUS.md](E2E-ROBUSTNESS-PLAN-STATUS.md)
("Forslag til neste steg"). Denne runden gjennomførte forslag #1
(Label/Input-audit), #2 (root-årsak-undersøkelse) og #3 (Page Object), i den
rekkefølgen, alle committet og pushet til `staging`. Forslag #4
(`data-testid`-konvensjon) og #5 (`price/index.tsx`-opprydning) er vurdert og
bevisst ikke gjort — se "Ikke gjort" under.

## Fase A — Label/Input-audit

**Mål:** finne resten av "rå `<Label>` uten `htmlFor`"-mønsteret som ble
funnet fire steder i forrige runde, og hindre at det kommer tilbake.

**Gjort:**

- Lagt til `eslint-plugin-jsx-a11y` og aktivert
  `jsx-a11y/label-has-associated-control` som `error`, med
  `controlComponents: ["Checkbox", "Switch", "RadioGroupItem"]` — uten denne
  utvidelsen gir regelens standardliste (kun native tags som `input`/`select`)
  falske positiver for enhver `<label>` som pakker inn en Radix `Checkbox`,
  siden regelen ikke kjenner igjen React-komponentnavn den ikke har fått
  oppgitt.
- Full gjennomgang av alle 149 `<Label>`-forekomster i `src/` (via lint-kjøring
  med regelen som feilkilde, ikke manuell grep-gjennomgang — raskere og mer
  presist). **Fant ingen nye udekkede tilfeller** utover de fire rettet i
  forrige runde. De resterende ~50 uten `htmlFor` er enten gruppe-overskrifter
  (f.eks. "Tilstand" over en avkrysningsboks-gruppe — korrekt å ikke knytte
  til ett enkelt felt) eller labels som pakker inn en Radix `Checkbox`
  direkte, som er gyldig implisitt kobling i nettleseren (`<button>` er et
  "labelable element" per HTML-spesifikasjonen).
- To steder konvertert fra rå `<label>` til delt `<Label>`-komponent med
  eksplisitt `htmlFor`/`id`
  (`category-filters-panel.tsx`, `sortable-filter-row.tsx`) for konsistens
  med resten av kodebasen — funksjonelt uendret, men lettere å lese og
  vedlikeholde.

**Uforutsett funn:** `eslint-plugin-jsx-a11y` krasjet umiddelbart ved første
kjøring (`TypeError: minimatch is not a function`). Årsak: pakken kaller
`minimatch` som en callable default-eksport, som stemte for minimatch v3 —
men repoet overstyrer allerede `minimatch` globalt til v9 (`package.json` →
`overrides`, sannsynligvis av sikkerhetshensyn), og v9 eksporterer et objekt
med en navngitt funksjon i stedet. Løst med en `bun patch` av de to berørte
filene i `node_modules/eslint-plugin-jsx-a11y` (sjekket inn i
`patches/eslint-plugin-jsx-a11y@6.10.2.patch`), fremfor å røre den globale
`minimatch`-overstyringen (nested per-pakke-overstyring viste seg ikke støttet
av Bun).

**Verifisert:** `bunx tsc --noEmit`, `bun run test` (184 tester, 21 filer) og
`bun run lint` (0 feil) kjørt grønt etter endringen.

## Fase B — Undersøk root-årsaken til "stille Neste-klikk"

**Mål:** finne ut om det uløste mysteriet fra forrige rundes Fase 5 (klikk på
"Neste" fullfører uten feil, men UI-en endrer seg ikke) er et reelt
race condition i appen, eller et testverktøy-artefakt.

**Gjort:**

- Kjørte `publish-vehicle-listing.spec.ts` fire ganger lokalt mot samme
  Supabase-prosjekt som brukes i CI (både enkeltvis og sammen med
  `publish-listing.spec.ts`, både parallelt og serialisert med
  `--workers=1`). **Alle fire kjøringer besto på første forsøk** — ingen
  retry trengt, ingen reproduksjon av problemet.
- Eneste observasjon av interesse: en periodisk `WebSocket connection ...
failed: WebSocket is closed before the connection is established`-advarsel
  fra Supabase Realtime, i 2 av 4 kjøringer. Sporet til
  varsel-/meldings-abonnementet i appens delte header
  (`messages-button.tsx`/`notifications-bell.tsx`, aktive på enhver innlogget
  side, inkludert `/ny-annonse`) — **ikke bekreftet som relatert** til
  Neste-knapp-problemet, kun notert som en mulig retning for videre
  undersøkelse hvis mysteriet dukker opp igjen.
- Lagt til permanente (ikke bare feil-utløste) `console`/`pageerror`-lyttere i
  testen, slik at neste CI-forekomst av problemet etterlater et spor i
  jobbloggen selv om retry-mekanismen får testen til å lykkes til slutt.

**Konklusjon:** root-årsaken er fortsatt ikke identifisert. Gitt at fire
lokale forsøk (inkludert forsøk på å fremprovosere ressurskonkurranse via
parallell kjøring) ikke reproduserte problemet, og at forrige rundes grundige
statiske gjennomgang av `goToNextPage()` heller ikke fant noe, er dette
tidsboksen for denne undersøkelsen brukt opp uten et definitivt svar.
Retry-mekanismen (`clickNextAndWaitFor`) er beholdt som den pragmatiske
sikringen. Anbefaling: la loggingen stå og revurder først når/hvis problemet
dukker opp igjen i en faktisk CI-kjøring — da finnes det endelig noe konkret
å lese ut av jobbloggen.

## Fase C — Page Object for wizarden

**Mål:** samle den nå dupliserte steg-navigeringen mellom
`publish-listing.spec.ts` og `publish-vehicle-listing.spec.ts` ett sted.

**Gjort:** Ny `e2e/pages/listing-wizard.ts` med `login`, `goToNewListing`,
`clickNextAndWaitFor` (retry-mekanismen fra Fase 5/B), `wizardStep`,
`fillDescriptionAndAdvance` og `publishAndExpectSuccess`. Begge
spec-filene omskrevet til å bruke disse.

**Reell regresjon funnet og rettet underveis:** Første versjon av
`fillDescriptionAndAdvance` antok at wizarden allerede sto på
description-keywords-steget når den ble kalt — riktig for den generiske
flyten (som lander der rett etter "uten bilder"-dialogen), men **feil** for
kjøretøy-flyten, som trenger et eksplisitt "Neste"-klikk forbi
vehicle-condition-steget først. Lokal testkjøring fanget dette umiddelbart
(`publish-vehicle-listing.spec.ts` timet ut med 30s venting på et steg som
aldri kom, fordi ingen klikket seg dit) — uten den lokale kjøringen ville
dette gått ubemerket til neste CI-kjøring. Rettet ved å la selve
steg-overgangen forbli hvert kall-steds ansvar (eksplisitt
`clickNextAndWaitFor` før hjelpefunksjonen kalles), i stedet for å bake en
feilaktig antakelse inn i den delte hjelpefunksjonen.

**Verifisert:** Begge spec-filene kjørt grønt mot ekte Supabase-prosjekt,
både enkeltvis og sammen, både parallelt og serialisert (4 kjøringer totalt
etter fiksen, alle grønne). `bunx tsc --noEmit`, `bun run test` og
`bun run lint` grønt.

## Ikke gjort

- **Forslag #4 (`data-testid`-konvensjon i `CLAUDE.md`):** utelatt fra denne
  runden fordi den hører naturlig sammen med en faktisk avklart konvensjon —
  Fase A avdekket ingen nye testid-mønstre å dokumentere utover det som
  allerede fantes, så å skrive den nå ville vært spekulativ dokumentasjon
  uten et konkret ankerpunkt. Bør gjøres neste gang et nytt feltgruppe-mønster
  (som `wizard-step-<key>`) etableres, med det mønsteret som konkret eksempel.
- **Forslag #5 (opprydning av `price/index.tsx`):** bevisst utelatt.
  Filen håndterer reell prisberegning (inkl. omregistreringsavgift) for
  publiserte annonser — en opprydning uten en drivende funksjonsendring er
  ren refaktorering av produksjonskode ingen har bedt om å endre, med
  reell regresjonsrisiko i en flyt som ikke har dedikert E2E-dekning for hvert
  avgiftsscenario. Opprinnelig plan foreslo også å utsette denne til filen
  uansett må endres — ingenting i denne runden har endret den vurderingen.
  Gjøres ved neste funksjonsendring i filen, ikke som en frittstående
  opprydningsjobb.

## Lærdom fra denne runden

1. **Å stole på en ESLint-regel som revisjonsverktøy er raskere og mer
   presist enn manuell grep-gjennomgang** — men bare hvis man faktisk kjører
   den og leser feilmeldingene, ikke bare aktiverer den. Den første kjøringen
   her (før `controlComponents`-utvidelsen) hadde gitt 13 falske positiver;
   uten å forstå _hvorfor_ de var falske (default-listen kjenner ikke igjen
   Radix-komponentnavn) hadde de trolig blitt "rettet" unødvendig.
2. **En global `overrides`-oppføring i `package.json` kan stille brekke en
   helt urelatert utviklingsavhengighet** lenge etter at overstyringen ble
   lagt til av en annen grunn. `bun patch` er et godt presist verktøy for å
   løse denne typen kompatibilitetsbrudd uten å røre den opprinnelige
   overstyringen (som fortsatt kan være der av gyldige sikkerhetsgrunner).
3. **En Page Object-abstraksjon som skjuler for mye steg-tilstand er en
   fistrisiko, ikke bare en duplisering-reduksjon.** `fillDescriptionAndAdvance`
   sitt første utkast antok stilltiende hvor i wizarden testen befant seg —
   nøyaktig den typen implisitt tilstandsantakelse som gjorde
   `publish-vehicle-listing.spec.ts` skjør i utgangspunktet (jf. forrige
   rundes funn om at samme klikk-mønster oppfører seg ulikt i de to flytene).
   Lokal kjøring av begge spec-filene før commit fanget dette — hadde det
   ikke blitt gjort, ville regresjonen først vist seg i neste CI-kjøring.
4. **Root-årsaksundersøkelser med et ukjent utfall bør faktisk tidsboksees,
   ikke bare planlegges tidsbokset.** Fase B endte uten et definitivt svar,
   og det er et akseptabelt utfall når det er dokumentert som sådan —
   alternativet (fortsette å grave uten ny informasjon) hadde vært et dårligere
   bruk av tiden enn å legge igjen bedre logging til neste faktiske
   forekomst.
