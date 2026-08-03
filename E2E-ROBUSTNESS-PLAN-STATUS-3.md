# E2E-robusthetsplan, runde 3 — status

Oppfølging av de fire trådene [E2E-ROBUSTNESS-PLAN-STATUS-2.md](E2E-ROBUSTNESS-PLAN-STATUS-2.md)
listet som bevisst ikke gjort i runde 2, pluss Fase 1 fra
[E2E-ROBUSTNESS-PLAN-STATUS.md](E2E-ROBUSTNESS-PLAN-STATUS.md) (runde 1).
Alle fire er nå gjennomført, hver i egen commit, alle pushet til `staging`.
Implementeringsplanen ligger i sesjonens plan-fil (godkjent før arbeidet
startet) — dette dokumentet oppsummerer det faktiske utfallet og funnene.

## 1 — `data-testid`-konvensjon i CLAUDE.md

Dokumentert som planlagt: wizard-steg (`wizard-step-<group-key>`),
navigasjonsknapper, feltspesifikke input-er, og unntaket for kategoriflisenes
`data-category-name`. Ren dokumentasjon, ingen kjørbar verifisering utover
gjennomlesning.

## 2 — Login-flake i `publish-listing.spec.ts`

Flyttet den permanente `console`/`pageerror`-loggingen fra
`publish-vehicle-listing.spec.ts`s testkropp til den delte `login()`-
funksjonen i `listing-wizard.ts`, slik at begge spec-ene nå får den
automatisk. 3 lokale kjøringer av `publish-listing.spec.ts` reproduserte
ikke login-flaken.

**Sidefunn:** loggingen fanget en tidligere usynlig React-advarsel i én
kjøring — `Can't perform a React state update on a component that hasn't
mounted yet`. Urelatert til login-flaken, ikke undersøkt videre (utenfor
denne oppgavens omfang). Verdt en egen, fokusert sesjon.

## 3 — Opprydning av `price/index.tsx`

Trakk ut hele kjøretøy-omregistreringsavgift-boksen til en ny
presentasjonskomponent (`omregistreringsavgift-box.tsx`), ren
prop-forwarding, ingen atferdsendring. `Price` beholder all beregning siden
flere andre deler av komponenten (prisfeltets `max`, "Pris synlig i
annonse") bruker de samme verdiene.

**Verifisering uten automatisert testdekning:** ingen eksisterende tester
dekker `Price`/`PriceGroup`. Verifisert i stedet ved å kjøre
`publish-vehicle-listing.spec.ts` med et midlertidig skjermbilde festet til
pris-steget (fjernet igjen før commit) — avgiftsboksen, "rediger"-
funksjonen, "Pris synlig i annonse" og fritatt/inkludert-tekstene rendrer
identisk med før refaktoreringen.

## 4 — Ekte skjult-for-sluttbrukere-mekanisme for kategorier

Ny `categories.is_hidden`-kolonne (default `false`), satt til `true` for de
to eksisterende e2e-testkategoriene. Filtrert bort fra 8 oppdagelses-/
browsing-flater (landingssider, browse/søk, offentlige kategorisider,
sitemap.xml). Bevisst **ikke** filtrert fra kategorivelgeren ved
annonseopprettelse — e2e-testene velger testkategoriene nettopp der, via den
ekte UI-flyten, og en bypass-mekanisme for testene hadde svekket
end-to-end-verdien deres mer enn den smale gjenværende risikoen
rettferdiggjør. Ny "Skjult for sluttbrukere"-avkrysning i admin-UI-et.

**Viktig prosessavvik fra planen, oppdaget underveis:** `supabase db push`
mot det lenkede staging-prosjektet ble blokkert av auto-modus-klassifisereren
(riktig kall — det er en delt database). Brukeren opplyste at migrasjoner i
stedet pushes automatisk av **Supabase sin egen GitHub-plugin**, ikke en jobb
i `.github/workflows/` i dette repoet. Dette er nå dokumentert i `CLAUDE.md`
under en ny seksjon ("Migrasjoner og Supabase-CI"), sammen med regelen som
fulgte av det: når en endring både legger til en migrasjon og appkode som
avhenger av den, committes og pushes migrasjonen alene først, og appkode-
endringen venter til kolonnen er bekreftet tilstede (verifisert her med et
enkelt skript mot staging via service-role-nøkkelen) — ellers kan
allerede-levende spørringer feile i vinduet mellom de to.

**Avvik fra opprinnelig plan (oppdaget ved lesing av faktisk kode, ikke
antatt på forhånd):** planen antok at begge kategori-spørringene i
`$kaupetCode.tsx` var oppdagelses-relevante. Den andre (linje ~370, hentet
kun for å bygge brødsmulesti på en allerede-kjent annonseside) filtrerer ikke
oppdagelse — filtrering der ville bare risikert en ødelagt brødsmulesti for
en annonse under en skjult kategori, uten oppdagelses-gevinst. Latt stå
ufiltrert.

**Sidefunn:** `useCategories()` (`src/hooks/use-root-categories.ts`) har
ingen importer noe sted i kodebasen — reelt sett en ubrukt eksport, til tross
for en kommentar i filen som hevder den deler cache med header/navigasjon.
Filtrert likevel for korrekthet, men ikke undersøkt videre — utenfor denne
oppgavens omfang.

**Verifisert:** direkte spørring mot staging (service-role) bekreftet at
`is_hidden=false` ekskluderer begge testkategoriene mens et ufiltrert kall
inkluderer dem. Begge e2e-spec-ene kjørt grønt etterpå.

## Lærdom fra denne runden

1. **En permission-blokkering fra auto-modus-klassifisereren er ofte et
   signal om at prosessen bør splittes, ikke omgås.** Blokkeringen av
   `supabase db push` tvang frem riktig sekvensering (migrasjon alene først,
   verifisert anvendt, deretter avhengig appkode) i stedet for det opprinnelig
   planlagte ett-steg-kjøre-migrasjon-selv — som i ettertid var feil
   arbeidsflyt for dette repoet uansett (migrasjoner går via Supabase sin
   GitHub-plugin, ikke manuell CLI-push).
2. **Planer skrevet før man har lest all berørt kode vil bomme på detaljer
   — det er greit, så lenge man korrigerer ved implementering.** Planens
   antakelse om at begge `$kaupetCode.tsx`-spørringene skulle filtreres
   holdt ikke ved nærmere lesing; korrigert på stedet med begrunnelse, ikke
   fulgt blindt.
3. **Manuell UI-verifisering via et generisk automatiseringsverktøy (ikke
   Playwright) er upålitelig for Radix Select-komponenter** — flere forsøk på
   å velge "XC60" i kjøretøy-modell-dropdownen via klikk/tastatur feilet
   stille. Den faktiske e2e-testen (som allerede var skrevet for nøyaktig
   denne interaksjonen) var et mer pålitelig verifiseringsverktøy enn
   generell browser-automasjon for denne typen UI.
4. **Et migrasjonsønske om å "hindre reell bruker-oppdagelse" har naturlige
   grenser man bør holde seg til.** Det var fristende å filtrere alle 19
   `categories`-spørringer likt for konsistens, men den riktige linjen gikk
   ved _hvorfor_ hver spørring henter kategorier — oppdagelse vs. støtte for
   en allerede-kjent handling (annonseopprettelse, redigering av egen
   annonse, brødsmulesti). Bred filtrering "for sikkerhets skyld" hadde
   skapt den nøyaktige test/produksjon-konflikten omfangsavklaringen i
   forkant var ment å unngå.

## Gjenstående, ikke tatt i denne runden

- React-advarselen fanget i punkt 2 (`Can't perform a React state update on
a component that hasn't mounted yet`) — ikke reprodusert isolert, ikke
  root-årsak-undersøkt.
- `useCategories()`s status som ubrukt eksport (punkt 4) — verken fjernet
  eller undersøkt hvorfor kommentaren i filen ikke stemmer med faktisk bruk.
- De to punktene som fortsatt sto åpne fra runde 2 uten ny handling denne
  runden: root-årsaken til det stille "Neste"-klikket (Fase 5/B), og
  duplisert `data-category-name`-oppslag som kunne vært en del av
  Page Object-et (begge lavt prioritert, ingen ny informasjon denne runden
  som endrer den vurderingen).

## Anbefalte aksjonspunkter videre

Det opprinnelige formålet med disse tre rundene var å gjøre e2e-testene
robuste mot UI-/innholdsendringer — ikke å maksimere testinfrastruktur. Tre
runder inn er den underliggende risikoen (skjøre selektorer, lånte
produksjonskategorier, faste ventinger) adressert. Herfra bør innsatsen dreie
fra **å legge til mer** til **å fjerne det som ikke lenger trekker vekten**,
og bare fikse konkrete, observerte feil fremfor å bygge mer rundt dem de ikke
er forstått. Rangert etter verdi/innsats, med begrunnelse i begge retninger:

1. **Undersøk hvorfor `deleteUser` feiler i teardown — konsekvent, ikke
   sporadisk.** `[e2e global-teardown] Kunne ikke slette testbruker ...`
   dukket opp i **samtlige** lokale kjøringer denne sesjonen (ikke bare
   noen), på tvers av begge spec-filene og over flere dager med testbrukere.
   Fase 3 (runde 1) antok dette var en sjelden feilmodus verdt å logge og gå
   videre fra; ferske data tyder på at det er systematisk — enten mangler
   service-role-nøkkelen en rettighet den pleide å ha, eller noe i
   bruker-slettingen (f.eks. en avhengig rad uten `ON DELETE CASCADE`) har
   endret seg. Konsekvensen er reell teknisk gjeld, ikke bare støy: hver
   testkjøring etterlater en ubrukt bruker og tilhørende annonser i
   staging-databasen permanent. **Lav innsats** (sannsynligvis én
   root-årsak), **høy verdi** (stopper en pågående datalekkasje i staging,
   reduserer fremtidig opprydningsbehov) — anbefales som neste konkrete
   oppgave, fremfor å fortsette å bygge nye mekanismer oppå et miljø som
   sakte fylles med testdata.
2. **Slett `useCategories()` (`src/hooks/use-root-categories.ts`) i stedet
   for å la den stå som en korrekt-men-ubrukt eksport.** Denne runden
   filtrerte den for korrekthets skyld, men det er i seg selv et symptom på
   å legge til vedlikeholdsflate (enda et sted som må huskes ved fremtidige
   kategori-skjemaendringer) for kode ingen bruker. Sjekk `git blame`/-log
   for om den er tenkt gjenbrukt snart; hvis ikke, fjern filen og kommentaren
   i `annonser.tsx` som feilaktig hevder delt cache med den. **Reduserer**
   kompleksitet direkte, null robusthetskostnad siden ingenting importerer
   den.
3. **Ikke bygg en Page Object-utvidelse eller flere abstraksjonslag med
   mindre en tredje wizard-test faktisk dukker opp.** `listing-wizard.ts` er
   akkurat passe stor for to spec-filer; å forhåndsbygge mer generalitet nå
   (f.eks. en full "steg-graf"-abstraksjon) ville vært kompleksitet betalt
   for en fleksibilitet ingen har bedt om ennå. Eksplisitt anbefaling om å
   **ikke** gjøre dette, ikke bare en lavt prioritert "kan gjøres".
4. **Sett en eksplisitt utløpsdato eller et hendelses-tak på
   `clickNextAndWaitFor`-retry-mekanismen, i stedet for å la den stå som en
   permanent, uforklart sikring.** Den dekker over et ukjent problem (Fase
   5/B) — det er en fornuftig pragmatisk løsning på kort sikt, men en
   3-forsøks-retry med skjermbilde-diagnostikk er ikke gratis kompleksitet:
   den gjør testfeil tregere å forstå (feiler først etter 3×8s), og den er
   nå duplisert implisitt inn i mental modell av hvordan wizarden "egentlig"
   oppfører seg. Konkret forslag: hvis loggingen fra punkt 2 (runde 3) og
   den permanente konsoll-fangsten fra Fase B (runde 2) ikke har gitt et
   spor **innen utgangen av neste kvartal eller 20 flere CI-kjøringer**, tell
   det som "ikke reproduserbart i praksis" og vurder å forenkle til en enkel
   økt timeout uten retry-logikken — retry-en er nå den mest komplekse enkelt-
   delen av hele e2e-oppsettet for et problem ingen har sett gjenta seg
   siden det ble observert.
5. **Ikke utvid `is_hidden`-mekanismen til flere tabeller eller flere
   filtreringssteder uten et konkret nytt behov.** Den ble bevisst holdt smal
   (8 browsing-steder, ikke 19) i denne runden nettopp for å unngå
   test/produksjon-friksjon. Fristelsen til å "gjøre den komplett" ved et
   senere tidspunkt (f.eks. filtrere kategorivelgeren også, eller legge til
   tilsvarende flagg på `listings`) bør motstås med mindre et reelt
   produktbehov (ikke bare konsistens-instinkt) driver det — se lærdom #4
   over.
6. **Lavest prioritet, kun hvis tid:** root-årsaken til det stille
   "Neste"-klikket og den nyoppdagede React-mount-advarselen. Begge er reelle
   nok til å notere, men ingen av dem har vist seg å faktisk bryte en
   testkjøring siden de ble oppdaget — å bruke mer tid på blind
   root-årsak-jakt uten nye data er akkurat den typen investering denne
   anbefalingen ber om å nedprioritere.
