# UI-gjennomgang — innspill til implementering

Samleliste fra felles gjennomgang av grensesnittet. **Alle punktene er implementert.**

Avvik fra det som ble avtalt under gjennomgangen:

- **W8**: menyen lar deg hoppe til gjeldende steg og bakover, ikke til alle _besøkte_ steg.
  Å huske høyeste besøkte steg krevde enten `setState` i en effekt (brytes av
  `react-hooks/set-state-in-effect`, som er en feil i dette repoet og baselines i
  `eslint-suppressions.json`) eller å tre ny state gjennom alle navigasjonspunktene i
  begge flytene. Bakover-navigasjon er alt "Se over" faktisk tilbød, så menyen dekker
  samme behov uten ny tilstand. Etter et hopp bakover må man bruke Neste framover igjen.
- **W3**: `aria-label` ble ikke bare fjernet — knappen peker nå på den synlige teksten
  med `aria-labelledby`. Uten det mistet knappen navnet sitt helt (teksten er en søsken,
  ikke et barn av knappen).

## Forsiden (`/`)

### F1 — Fjern "eyebrow"-etiketter over overskriftene

Overskrift over overskriften gir ingen verdi. Slett:

- `src/routes/index.tsx:382-384` — "Finn raskere" over "Utforsk kategorier"
- `src/components/landing-static-sections.tsx:16-18` — "En litt annerledes markedsplass" over "Bygget for et fritt og åpent internett"
- `src/components/intent-title-landing.tsx:102-104` — "Ny annonse" over intent-overskriften i Ny annonse-overlayet
  (brukes både av bunn-nav-velgeren og `NewListingDialog`)

Ingen delt komponent — tre separate slettinger. Sjekk toppmargin på `h2` etterpå
(`mt-1` på `#category-heading`, `space-y-2` på `<header>` i intent-title-landing).

Dialogen har egen `DialogTitle` i `sr-only` ("Hva vil du gjøre?"), så skjermleser-
tilgjengeligheten er uendret av at eyebrowen fjernes.

## Innlogging (`/auth`)

### A1 — Tab fra e-post skal gå til passord, ikke til "Glemt passord?"

`src/routes/auth.tsx:457-476`: "Glemt passord?"-knappen ligger i DOM _før_ passord-inputen
(begge i samme flex-rad over feltet), så tab-rekkefølgen blir e-post → Glemt passord? → passord.

Løsning: behold utseendet, snu DOM-rekkefølgen. Gjør wrapperen til et 2x2-grid og plasser
knappen etter inputen i markup, men i rad 1 / kolonne 2 visuelt:

```
label (col 1, row 1) · input (col-span-2, row 2) · knapp (col 2, row 1)
```

DOM: label → input → knapp. Visuelt identisk. Ikke bruk `tabIndex={-1}` — det fjerner
knappen helt fra tastaturnavigasjon.

## Observasjoner (ikke besluttet)

- Ødelagte bilder fra `bilder.staging.kaupet.no` viser rå alt-tekst i bildeflaten i stedet for fallback-plassholder (karusellen på forsiden).
- Mobil 375px: kategorikort brekker ord midt i ("Underholdni/ng", "Samleobjekt/er").
- Mobil 375px: kodeblokken i åpen-kildekode-seksjonen klippes i høyre kant uten synlig scroll-affordance.
- Samme eyebrow-mønster finnes flere steder som _ikke_ er gjennomgått ennå — bl.a.
  `bedrift.$organizationId.tsx:97` ("Bedriftsprofil"), `business-console.tsx:716` ("Innsikt"),
  `business-profile-form.tsx:240`. Skal disse også vekk? Ikke besluttet.
  (Gruppelabels som "Mine ting"/"Konto" på `/meg` er noe annet — de står ikke over en overskrift.)

## Ny annonse-overlay (`IntentTitleLanding`)

### N1 — "Du kan endre dette senere" skal under tittelfeltet, ikke over

`src/components/intent-title-landing.tsx:171-173`: hjelpeteksten ligger i samme baseline-rad
som `Tittel`-labelen, høyrejustert over inputen. Det leses ikke som å gjelde tittelfeltet.

**Besluttet:** slå den sammen med hjelpeteksten under inputen, på samme linje som
eksempelteksten (`#listing-title-help`). Behold `hidden sm:inline` på selve tilføyelsen —
den skal fortsatt være skjult på mobil for å spare skjermplass.

- Trenger et skille mellom eksempeltekst og tillegget (f.eks. `·`), som også skjules på mobil.
- `aria-describedby` peker allerede på `#listing-title-help`, så koblingen løser seg selv
  når teksten flyttes inn der.

## Annonseflyten (`/ny-annonse`)

### W1 — Skjul "Kategori"-linjen til kategori faktisk er valgt

`src/routes/ny-annonse.tsx:1868-1875`: når `categoryId` er tom, rendres en degenerert
"steg-indikator" som bare er ordet _Kategori_ i en `<nav aria-label="Annonseopprettelse">`.
Den står rett under tittelen og leses som en tom eller ødelagt verdi, ikke som et steg.

Løsning: la `progress` være `undefined` når `categoryId` mangler — altså behold
`<StepIndicator>`-grenen og slett else-grenen.

Merk: `progress` og `status` deler den sticky raden i `ListingComposerShell:167`
(`{(progress || status) && ...}`). Med progress borte rendres raden fortsatt når
det finnes status (f.eks. "Lagret 21:39"), så ingenting kollapser uventet — men
sjekk at spacingen under tittelen ser riktig ut i begge tilfeller.

Gjelder kun `/ny-annonse`. `/ny-ok-annonse` (`:665`) rendrer alltid en ekte
`ComposerStepIndicator` og har ikke problemet.

### W2 — Ikke vis "N opplysninger mangler" før kategori er valgt

`src/routes/ny-annonse.tsx:1918-1951` (aside, desktop): "Publiseringsstatus" viser et antall
manglende opplysninger allerede på første steg. Vi vet ikke hva som mangler før vi vet hva
som skal annonseres.

Tallet er reelt misvisende, ikke bare tidlig: `missingPublishingCount` (`:867`) telles fra
`fieldGroupsForKeys(fieldGroupKeys)`, og feltgruppene bestemmes av valgt kategori. Før valg
telles bare basisgruppene, så tallet hopper når kategorien settes.

**Besluttet:** gate hele `<section aria-labelledby="desktop-publishing-status-title">`
på `categoryId` — hele seksjonen skjules, ingen plassholder.

Husk å oppdatere `aria-label` på asiden når seksjonen er borte:
`listing-composer-shell.tsx:250` sier i dag "Forhåndsvisning og publiseringsstatus" uansett.

Samme data brukes også av dialogen "Opplysninger som mangler" (`:2014`) og av
`publishingRequirementErrors` (`:1670`). Kun visningen i asiden skal skjules —
valideringen ellers skal stå urørt.

### W3 — Forhåndsvisningen i asiden er tom og dobbeltkommunisert på første steg

`src/features/listing-creation/field-groups/review-publish/index.tsx:76-99`.
På første steg viser kortet "Ingen bilde" + "Ingen pris" — to negasjoner som får kortet til
å se ødelagt ut heller enn uferdig. I tillegg står "Trykk for å forhåndsvise annonsen" to
ganger: som `aria-label` på knappen (`:88`) og som synlig `<p>` under kortet (`:97`).
Skjermlesere får den dermed to ganger.

**Besluttet:**

1. Fjern `aria-label="Trykk for å forhåndsvise annonsen"` på knappen (`:88`). Den synlige
   `<p>`-en under kortet (`:97`) beholdes og blir knappens tilgjengelige navn.
2. Bytt `missingPriceLabel="Ingen pris"` → `"Pris ikke satt"` (`:72`). Dette er en prop til
   `ListingCard` og treffer kun forhåndsvisningen, ikke kortene i søkelisten.
3. Forhåndsvisningen skjules _ikke_ — den står som i dag, bare med mykere pristekst.

Åpent: "Ingen bilde" er hardkodet i den delte `ListingCard` (`src/components/listing-card.tsx:115`)
og brukes av søkeliste, kart, mine annonser m.m. Å myke den opp treffer hele siden, ikke bare
forhåndsvisningen. Ikke besluttet.

### W4 — Underkategori (Bil og MC) skal stå under registreringsnummer

`src/features/listing-creation/field-groups/vehicle-registration/index.tsx:335-369`.
Underkategori-radiogruppen står øverst, før skiltfeltet. Siden oppslaget på
registreringsnummeret uansett avgjør underkategorien (`detectedSlug`/`categoryMismatch`,
`:322`), bør skiltfeltet komme først så brukeren fyller det ut i stedet for å gjette.
Hjelpeteksten "Velg en annen hvis den markerte ikke stemmer" gir også bare mening
_etter_ et oppslag.

Seksjonen har i dag tre blokker i denne rekkefølgen:

1. Underkategori (radiogroup, `:336-368`)
2. Manuell merke/modell + Grunnfakta — kun når "ikke registrert" er huket av (`:371-396`)
3. Registreringsnummer + "ikke registrert"-checkbox (`:398-...`)

**Obs:** blokk 2 filtreres av underkategorien på samme måte som merke/modell ellers.
Flyttes underkategori helt til bunnen, havner den _under_ feltene den styrer i
ikke-registrert-tilfellet — samme problem speilvendt.

**Besluttet rekkefølge: 3 → 1 → 2** — registreringsnummer + checkbox, så underkategori,
så manuell merke/modell. Husk å flytte `border-t pt-4`-skillene så de følger den nye
rekkefølgen (den øverste blokken skal ikke ha topplinje).

## Generell regel

### G1 — Påkrevde felt som ikke er utfylt skal aldri ligge bak en lukket seksjon

Regel: er et felt påkrevd og tomt, skal det være synlig uten at brukeren må åpne noe.
Utfylte felter kan gjerne ligge sammenslått.

Gjennomgang av `<details>`-seksjonene i annonseflyten:

| Sted                                                     | Status                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `vehicle-facts/index.tsx:486` "Tekniske detaljer"        | OK — påkrevde felt rendres utenfor `<details>`, innholdet er valgfritt og forhåndsutfylt |
| `vehicle-registration/index.tsx:113` `ManualSpecSection` | Bryter regelen                                                                           |
| `boat-facts/index.tsx:187` `BoatDetailsSection`          | Bryter regelen                                                                           |

Begge bruddene har samme årsak: seksjonen åpnes av `hasErrors`/`hasError`, men de
avhenger av `attributesTouched` (`vehicle-registration:231`, `boat-facts:276`), som
først blir sann etter at brukeren har forsøkt å gå videre. Ved første visning er
"Drivlinje", "Praktiske opplysninger", "Flere opplysninger" (kjøretøy) og "Motor",
"Mer", "Beskrivelse" (båt) lukket — med tomme, påkrevde felt inni.

Løsning: skill de to tingene som i dag er slått sammen.

- **Åpen/lukket** styres av om seksjonen har et påkrevd felt som er tomt — uavhengig
  av `attributesTouched`.
- **Feilmarkering** ("Mangler påkrevde felt", rød tekst) beholder dagens
  `attributesTouched`-gating, så brukeren ikke får røde felt før hen har gjort et forsøk.

Konkret: la `missingManualSpecKeys` (`vehicle-registration:230`) og `missingKeys`
(`boat-facts`) beregnes uten `attributesTouched`-sjekken, og behold `attributesTouched`
kun der feilteksten og `showErrors` settes.

### W5 — Fremdriftsraden forsvinner bak sidehodet ved scroll

`listing-composer-shell.tsx:167-172`: raden med "Steg 3 av 6" + "Utkast lagret kl. …" er
`sticky top-0 z-10`. `SiteHeader` (`src/components/site-header.tsx:38`) er også
`sticky top-0`, men med `z-40`. Begge fester seg i topp 0, og headeren vinner —
fremdriftsraden legger seg under den så snart man scroller.

Målt headerhøyde på web: 73px (72px + 1px bunnramme). Asiden gjetter allerede på dette
med en hardkodet `lg:top-24` (96px), `listing-composer-shell.tsx:252`.

Løsning: innfør en CSS-variabel for headerhøyden og bruk den som `top` for begge,
etter samme mønster som `--app-bottom-nav-h` i `src/styles.css:365`:

```css
:root {
  --site-header-h: calc(4.5rem + var(--safe-top));
}
```

- Fremdriftsraden: `top-0` → `top-[var(--site-header-h)]`
- Asiden: `lg:top-24` → samme variabel (+ ønsket luft), så de ikke gjetter hver for seg

**Native:** `NativePageHeader` (`sticky top-0 z-30`) har en annen høyde enn `SiteHeader`.
Overstyr variabelen i native-scopet i `styles.css` på samme måte som
`--app-bottom-nav-h` overstyres i `.composer-route` / `.native`.

### W6 — Hjelpetekst om obligatorisk "Kjente feil og mangler" står feil sted

`src/features/listing-creation/field-groups/vehicle-condition/index.tsx:70-74`:
teksten "Obligatorisk med mindre du krysser av …" står _under_ avkryssingsboksen,
og leses derfor som en forklaring til boksen i stedet for til tekstfeltet.

Flytt `<p>`-en opp slik at rekkefølgen i seksjonen blir:

1. Label + teller
2. Textarea (`#known_issues`)
3. Eventuelle feilmeldinger
4. **Hjelpeteksten** ("Obligatorisk med mindre …")
5. Avkryssingsboksen "Ingen kjente feil eller mangler"

Teksten rendres allerede betinget på `!noKnownIssues`, så den forsvinner fortsatt når
boksen krysses av — behold den betingelsen.

Bonus samme sted: gi `<p>`-en en id og legg den inn i textarea-ens `aria-describedby`
(`:44-46`), som i dag kun peker på feilmeldinger.

### W7 — Fjern "Se over"-seksjonen på siste steg

`src/features/listing-creation/field-groups/review-publish/index.tsx:267-304` rendrer
`<ComposerReview>` ("Se over" + fire rader med "Endre"). Rotete og uten merverdi —
fjernes.

Siste steg har fra før:

- "Publiseringsklar" (`:240-250`) — det som faktisk mangler, med egne Endre-lenker (`:187`)
- "Gjør annonsen bedre" (`:251-266`) — valgfrie forbedringer
- Forhåndsvisning (`:305`)

**Konsekvens å være klar over:** "Se over" er i dag eneste vei tilbake til et steg som
er _ferdig utfylt_. "Publiseringsklar" lister kun det som mangler, og
`StepIndicator` (`step-indicator.tsx:17`) er en ren fremdriftslinje uten klikkbare steg.
Etter fjerning må brukeren bruke "Tilbake" steg for steg. Akseptert.

Opprydding som hører med:

- **Besluttet:** fjernes fra ØK-flyten også (`src/routes/ny-ok-annonse.tsx:1009`).
  Da står `ComposerReview` uten brukere → slett `composer-review.tsx` sin
  `ComposerReview`-eksport og `composer-review.test.tsx`. NB: `ComposerReviewStatuses`
  ligger i samme fil og er fortsatt i bruk — bare `ComposerReview` skal ut.
- Sjekk om `onEditReviewSection` (`types.ts:251`) fortsatt brukes etter fjerning —
  `:187` bruker den for manglende krav, så den blir trolig stående.
- Erstatning for navigasjonen: se W8.

### W8 — Klikkbar stegindikator (erstatter navigasjonen "Se over" ga)

**Besluttet:** knapp som åpner en nedtrekksliste over stegene.

Rammer:

- Dagens `ComposerStepIndicator` (`step-indicator.tsx:5`) er bevisst en fremdriftslinje,
  ikke én boks per steg — boks-per-steg sprengte sidebredden i kjøretøyflyten
  (se kommentaren `:32-38`). Den erstatningen skal ikke tilbake.
- Fremover-navigasjon må fortsatt valideres; i dag validerer `attemptNextPage` gjeldende side.

Løsning: **"Steg 3 av 6" blir en knapp som åpner en nedtrekksliste over stegene.**

- Gjenbruker `DropdownMenu` fra `src/components/ui/` — ingen nye primitiver, ingen ny
  plass i raden, fungerer likt på mobil og desktop.
- Steg brukeren har vært innom er klikkbare; steg lenger fram er `disabled`.
  Det gir fri navigasjon bakover (som er alt "Se over" tilbød) uten å hoppe over validering.
- Krever ett nytt felt i `useListingSteps` (`use-listing-steps.ts:13`): `maxVisitedStep`,
  en `useState` som oppdateres i `setStep`/`goNext`. `setStep(n)` finnes allerede og
  gjør jobben.
- Merk at `pages` kan reshape når kategori endres (samme fil, `:26-47`) — `maxVisitedStep`
  må klampes på samme måte som `step`.

Gjelder begge flytene (`ny-annonse.tsx` og `ny-ok-annonse.tsx`), siden begge mister
"Se over". `ny-ok-annonse` bruker `ComposerStepIndicator` direkte (`:665`).

Alternativer vurdert og forkastet: klikkbare segmenter i selve fremdriftslinjen (for små
treffflater på mobil), og fritt klikkbare steg begge veier (hopper over valideringen som
`attemptNextPage` gjør i dag).

### W9 — Dobbel forhåndsvisning på siste steg

`review-publish/index.tsx:305` rendrer `<ReviewPreview>` i selve flyten, samtidig som
asiden viser den samme forhåndsvisningen (`ny-annonse.tsx:1953`). På desktop står den
altså to ganger.

**Viktig forbehold:** asiden er ikke alltid der.
`listing-composer-shell.tsx:76` — `showAside = !native && !!aside`, og asiden har
`hidden … lg:block` (`:252`). Altså ingen aside i native-appen, og ingen aside i
nettleser under 1024px. Fjernes forhåndsvisningen i flyten uten videre, mister mobil-
og native-brukere forhåndsvisningen helt.

**Besluttet:** behold komponenten, men vis den kun der asiden ikke er:

- `native` → vis alltid (asiden finnes ikke i native)
- ellers → `lg:hidden`, speilvendt av asidens `lg:block`

Se W3 for endringene inne i selve `ReviewPreview` (fjernet `aria-label`, "Pris ikke satt").
De to punktene treffer samme komponent og bør gjøres i samme slengen.

## Etter publisering

### P1 — Konfetti i "Annonsen din er publisert"-dialogen

`src/components/published-listing-dialog.tsx`. Ønsket: konfetti som regner nedover fra
toppen av dialogen, med samme konfetti-oppsett som "Send tilbakemelding".

Dagens konfetti er ikke en egen komponent — den ligger inline i
`src/components/feedback-tag.tsx:44-55`: dynamisk `import("canvas-confetti")`,
`confetti.create(canvas, { resize: true, useWorker: false })` mot et
`<canvas className="pointer-events-none absolute inset-0 z-10 size-full">` (`:71-74`).
Pakken ligger allerede i `package.json` (`canvas-confetti ^1.9.4`).

Implementering:

- Samme canvas-oppsett i `ResponsiveOverlayContent`, med `relative` på wrapperen.
  `pointer-events-none` er viktig — knappene under skal fortsatt kunne trykkes.
- Avfyres i en `useEffect` på at `open` går fra usann til sann.
- Regn ovenfra i stedet for burst: `origin: { y: 0 }` med spredning i bredden og lav
  `startVelocity`, avfyrt noen ganger på tilfeldig `x` over ~1 sekund, i stedet for
  feedback-panelets enkeltskudd (`spread: 70, startVelocity: 25, origin: { y: 0.7 }`).
- Pakk avfyringen i try/catch som i dag — dekorasjon skal aldri blokkere dialogen.
- **Respekter `prefers-reduced-motion`:** bruk `useReducedMotion()`
  (`src/hooks/use-reduced-motion.ts`) og hopp over animasjonen når den er på.

### P2 — Feedback-panelet respekterer ikke `prefers-reduced-motion`

**Besluttet:** rettes sammen med P1. `src/components/feedback-tag.tsx:44-55` avfyrer
konfetti uansett. Legg inn samme `useReducedMotion()`-sjekk der.
Takke-teksten ("Tilbakemelding sendt! Tusen takk!") skal fortsatt vises —
det er kun animasjonen som hoppes over.

Ikke lag en delt konfetti-komponent for to kallsteder med hver sin animasjon —
canvas + effekt er ~15 linjer lokalt. Blir det et tredje sted, trekk det ut da.

## Annonsedetalj (`/annonse/:id`)

### D1 — Fjern "Faktagrunnlag" fra selgerpanelet

`src/components/listing-detail/seller-contact-panel.tsx:153` rendrer `<ListingEvidence>`.
Tar mye plass i panelet og gir lite tilbake — i tillegg dupliserer siste linje
("Kontoopplysninger fra Kaupet · Registrert 24. juni 2026") informasjonen som allerede
står i selgerhodet rett over ("Medlem siden juni 2026").

Opprydding som følger med:

- `ListingEvidence` (`listing-evidence.tsx:10`) står da uten brukere → slettes.
  **Behold filen** — `SellerNoKnownIssues` ligger i samme fil (`:41`) og brukes av
  `listing-detail-view.tsx:66`.
- `evidenceSources`-utregningen (`seller-contact-panel.tsx:58-66`) blir død → slettes.
- Da er `mapListingFactSource`/`ListingFactSource` (`fact-source.ts`) uten brukere.
  Slett hele `fact-source.ts` hvis ingenting annet dukker opp.
- `hasRegistryData`-propen brukes kun av `evidenceSources` → fjern propen, og fjern
  `hasRegistryData={…}` på kallstedet `src/routes/$kaupetCode.tsx:834`.
- `listing-evidence.test.tsx` tester begge eksportene — fjern `ListingEvidence`-delen.

### D2 — Sidepanelet på annonsedetaljen er for bredt på web

`src/components/listing-detail/listing-detail-view.tsx:801`:
`<div className="mt-6 grid gap-8 md:grid-cols-[1.4fr_1fr]">`.

Målt i 1120px-containeren: innhold 635px / sidepanel 453px — panelet tar 40% av bredden.

Løsning: bytt den proporsjonale kolonnen mot en fast sidepanelbredde, f.eks.
`md:grid-cols-[minmax(0,1fr)_20rem]`. Prøvd live i nettleseren: innhold 768px /
sidepanel 320px, uten at noe i panelet brekker.

Merk: `<aside>` er en `@container` (`:1024`), og fakta-`dl`-en inni bruker
`@sm:grid-cols-3` (`:1035`). Ved 320px faller `@sm` (384px) bort, så den raden holder
seg på 2 kolonner. Det ser riktig ut med dagens innhold (Lokasjon + Publisert), men
sjekk annonser som har et tredje felt i den raden før dette merges.

### D3 — Bildet i full bredde, sidepanelet under

`src/components/listing-detail/listing-detail-view.tsx:801-826`. I dag ligger
`<ImageGallery>` inne i venstre kolonne av `md:grid-cols-[1.4fr_1fr]`, så bildet får bare
~57% av bredden mens sidepanelet spiser resten. Bildet er det viktigste i en annonse.

**Besluttet (variant A):** løft `<ImageGallery>` ut av gridet, over det, i full bredde.
Gridet starter under bildet, så sidepanelet står ved siden av fakta/beskrivelse i stedet
for ved siden av bildet. To-kolonners layout beholdes for resten av innholdet
(variant B — sidepanel i full bredde under bildet — ble forkastet).

Ting som henger sammen med dette:

- **`overlaySlot`** (`:812-825`) legger pris/status som et flytende kort over bildets
  nedre venstre hjørne (`-bottom-8 left-4`). Det følger galleriet opp i full bredde.
  Sjekk at kortet ikke ser forlatt ut på en bred flate.
- **Uten bilder skjules galleriet helt.** Fallbacken på `:829-835` rendrer allerede
  status/pris/avgift separat når `!has360 && sortedImages.length === 0` — den må bli
  stående, ellers forsvinner prisen sammen med galleriet.
- **Henger sammen med D2.** Når sidepanelet ikke lenger står ved siden av bildet, er det
  fakta og beskrivelse det konkurrerer med. `20rem` fra D2 gjelder fortsatt, men vurder
  proporsjonene på nytt når D3 er på plass.
- `nativeSpecLayout` (`:879`) flytter selgerpanelet inn i venstre kolonne på native —
  den grenen må fortsatt fungere.

### D4 — Pris-boksen ut av bildet og øverst i sidepanelet

I dag finnes pris/status/avgift i to varianter:

- som flytende kort over galleriets nedre venstre hjørne (`overlaySlot`, `:812-825`)
- som vanlig blokk i venstre kolonne når annonsen ikke har bilder (`:829-835`)

**Besluttet:** begge erstattes av ett kort med egen grid-posisjon — høyre kolonne,
øverst, rett under galleriet (som nå er i full bredde, jf. D3). To grener blir til én.

**Fallgruve — mobil.** Gridet er `md:grid-cols-[...]`, så under `md` blir alt én kolonne
i DOM-rekkefølge. Legges priskortet inni `<aside>`, havner prisen _etter_ fakta og hele
beskrivelsen på mobil. Prisen må ligge rett under bildet der også.

Løsning: tre grid-barn i stedet for to, med eksplisitt plassering fra `md` og opp:

| Grid-barn       | DOM-rekkefølge (mobil) | `md`+                                         |
| --------------- | ---------------------- | --------------------------------------------- |
| Priskort        | 1                      | `md:col-start-2 md:row-start-1`               |
| Innholdskolonne | 2                      | `md:col-start-1 md:row-start-1 md:row-span-2` |
| `<aside>`       | 3                      | `md:col-start-2 md:row-start-2`               |

Da får mobil galleri → pris → innhold → sidepanel, og desktop får prisen øverst til høyre.

Verifiser visuelt i begge bredder — dette er den eneste saken i listen som endrer
grid-strukturen, ikke bare innholdet i den.

### D5 — Knapp for å bytte mellom bredt og smalt galleri

Full bredde (D3) er standard, men brukeren skal kunne sette galleriet tilbake til én
kolonne slik det er i dag. Knappen plasseres ved siden av nedtrekksmenyen med
rapporteringsvalg (`listing-detail-view.tsx:797`, `actionsMenuSlot`).

- Ikonknapp med `aria-pressed` og tekstlig `aria-label` som forteller hva den gjør
  ("Vis galleriet i full bredde" / "Vis galleriet i én kolonne").
- **Gjelder kun `md` og opp** — under `md` er layouten uansett én kolonne, så knappen
  skal være `hidden md:inline-flex`. Ellers tilbyr vi et valg som ikke gjør noe.
- **Obs på plasseringen:** `actionsMenuSlot` rendres kun når brukeren er innlogget
  (`src/routes/$kaupetCode.tsx:779-790`). Bredde-knappen skal vises for alle, så den må
  rendres uavhengig av om slot-en finnes — ikke inni den samme `{actionsMenuSlot && …}`.
- Valget huskes på tvers av annonser i `localStorage`. Følg mønsteret i
  `src/hooks/use-saved-location.ts`: les i en `useEffect` (ikke under render) så SSR og
  hydrering ikke spriker, og pakk lesingen i try/catch. Nøkkel: `kaupet.listing.gallery-width`.
- Standardverdi: full bredde.

Dette er den eneste saken i listen som er ny funksjonalitet på annonsedetaljen — resten
er flytting, fjerning eller omstokking.
