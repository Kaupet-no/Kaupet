# E2E-robusthetsplan, runde 6 — status

Dedikert, fokusert økt (på brukerens eksplisitte forespørsel) for å lukke de
tre siste åpne punktene fra rundene 1-3: det stille "Neste"-klikket,
React-unmount-advarselen, og WebSocket-advarselen. Motivasjon: selv om ingen
av de tre var bekreftet kritiske, kunne de skjule mer alvorlige feil.

**Utfall: to av tre root-årsaker funnet og fikset, én grundig undersøkt uten
nytt funn.**

## 1 — Det stille "Neste"-klikket

**Ikke løst, men ny diligence gjort.** Gjennomgikk 17 historiske
CI-kjøringer (`gh run list`/`gh run view --log-failed`) fra utviklingsdagen
punktet først ble observert, og søkte spesifikt etter
`no-progress-after-neste-click`-skjermbilde-vedlegget som
`clickNextAndWaitFor` attacher ved et mislykket forsøk. **Fant null
treff** — retry-mekanismen har aldri faktisk måttet tre i kraft i noen
fanget kjøring siden den ble innført. De 17 historiske feilene var alle
andre, allerede kjente og fikset problemer (bl.a. den daværende
`getByLabel("Pris")`-tvetydigheten, senere rettet til
`getByRole("textbox", { name: "Pris" })`).

Supplerende kodegjennomgang av `goToNextPage()` og `useListingSteps()`
(`src/features/listing-creation/use-listing-steps.ts`) identifiserte at
`pages`-arrayet endrer form ved kjøretid (kjøretøy-bekreftelsessteget
settes inn/fjernes basert på `vehicleLookupResult`), som i prinsippet kunne
gi et vindu der `step`-indeksen midlertidig peker feil — men fant ingen
konkret sti der dette faktisk skjer uten en synkron `setState`+
`goToNextPage()`-kombinasjon i samme hendelse, og ingen slik kombinasjon
finnes i den faktiske "Neste"-knappens `onClick`.

**Konklusjon:** ingen ny informasjon som endrer tidligere vurdering.
"20 CI-kjøringer uten spor"-kriteriet fra runde 4/5 sin daterte kommentar i
`listing-wizard.ts` er nå i praksis oppfylt (0 treff over disse 17 + alle
kjøringer i runde 3-6) — men siden dette var historiske, ikke fremtidige
kjøringer etter at retry-mekanismen fikk sin nåværende form, telles det
ikke som en formell oppfyllelse av kriteriet. Anbefaler å la det daterte
sjekkpunktet (2026-11-01) stå som opprinnelig planlagt.

## 2 — React "hasn't mounted yet"-advarselen

**Root-årsak funnet og fikset.** Undersøkte `src/lib/auth.tsx` og fant at
en tidligere fiks (commit `37e716f`, 26. juli) allerede hadde adressert
denne nøyaktige advarselen én gang — ved å utsette `onAuthStateChange`s
state-oppdateringer via `queueMicrotask`. Likevel dukket advarselen opp
igjen én gang i runde 3, **etter** denne fiksen. Årsaken:
`queueMicrotask` innsnevrer race-vinduet, men garanterer ikke at
mikrotasken kjører _etter_ at React internt har markert komponenten som
montert — det er fortsatt et race, bare sjeldnere.

**Fiks:** `supabase-js` sender en dokumentert `INITIAL_SESSION`-hendelse
nøyaktig for dette synkrone tilfellet (når en sesjon allerede er lagret ved
abonnering). `getSession()`-kallet lenger ned i samme effect dekker
allerede dette tilfellet — asynkront, garantert etter mount. Løsningen ble
derfor å hoppe over `INITIAL_SESSION`-hendelsen i callbacken i stedet for å
utsette den, som fjerner race'et ved kilden fremfor å gjøre vinduet
mindre. `queueMicrotask`-hacket er fjernet — enklere kode, ikke bare en
fiks.

**Sidefunn, fikset i samme slengen:** `messages-button.tsx` og
`notifications-bell.tsx` sine Realtime-abonnement-effekter depended på hele
`user`-objektet (ikke `user?.id`). `AuthProvider` gir `user` en ny
objektreferanse ved hver auth-hendelse (f.eks. `TOKEN_REFRESHED`), som gjorde
at disse effektene rev ned og satte opp WebSocket-kanalen på nytt gjennom
hele økten, selv når den innloggede brukeren ikke faktisk hadde endret seg.
Urelatert til unmount-racet, men samme underliggende kodesti — endret til å
avhenge av `user?.id`.

**Verifisert:** `bunx tsc --noEmit`, lint, 184 enhetstester grønt. 5 lokale
kjøringer totalt av `publish-listing.spec.ts` + `publish-vehicle-listing.spec.ts`
(med den permanente konsoll-/`pageerror`-fangsten fra runde 2/3) —
**null** React-advarsler i noen av kjøringene.

## 3 — WebSocket-advarselen ("closed before the connection is established")

**Root-årsak identifisert — ikke en appkode-bug, ikke fikset (ingenting å
fikse).** Advarselen dukket opp konsekvent, én gang per spec-fil, i alle 3
verifiseringskjøringer denne runden (6 forekomster totalt). Sporet til:

- `SiteHeader` (som inneholder `MessagesButton`/`NotificationsBell`, begge
  med aktive Realtime-abonnement-effekter) rendres på `__root.tsx`-nivå
  (`src/routes/__root.tsx:293`) — en vedvarende layout-komponent som normalt
  IKKE remountes ved klient-side ruting.
- `e2e/pages/listing-wizard.ts`s `goToNewListing()` bruker derimot
  `page.goto("/ny-annonse?type=sell")` — Playwright sin `page.goto()` gjør
  alltid en **full nettleser-navigering** (ikke en TanStack Router
  klient-side overgang), som laster hele React-appen på nytt.
- Rekkefølgen blir da: innlogging fullføres → `SiteHeader` monteres første
  gang på "/" → Realtime-kanalen starter `subscribe()` → **umiddelbart**
  etterpå kaller testen `page.goto()` til `/ny-annonse`, som river ned hele
  siden (inkl. den nettopp startede WebSocket-håndhilsingen) før den
  rekker å fullføre.

Dette er et kjent, ufarlig mønster i Supabase-baserte SPA-er (dokumentert i
flere åpne GitHub-issues mot `supabase-js`) — kanalen kobles ordentlig til
på nytt idet `/ny-annonse` laster ferdig, ingen funksjonalitet påvirkes.
**Ingen kodeendring i appen kan fjerne denne advarselen uten enten å endre
selve navigasjonsmønsteret i e2e-testen** (f.eks. bruke en `Link`-klikk i
stedet for `page.goto()` — som ville endret hva testen faktisk verifiserer)
**eller undertrykke en legitim nettleser-advarsel** (ikke ønskelig).
Anbefaling: la den stå, den er nå forklart og forstått, ikke lenger et
mysterium.

## Anbefalte neste steg

Oppdaget ved å grep'e alle 4 stedene i kodebasen som bruker
`supabase.channel(...)`, for å sjekke om samme buggklasse fantes flere
steder enn de to allerede fikset i punkt 2. Den fant to til:

1. **`src/hooks/use-unread.ts:56-67`** — identisk mønster som de to
   allerede fikset (`}, [user, refetch])` i stedet for `user?.id`),
   ufikset. Brukes fra både `MessagesIconLink` (desktop-header) og
   `MessagesButton` (native bottom-nav), så den kan i praksis kjøre flere
   uavhengige abonnement-instanser samtidig.
2. **`src/routes/_authenticated/meldinger.$id.tsx:180-231`** — samme
   mønster, men **mer alvorlig**: avhengighetslisten er
   `[id, queryClient, conv, user]`, skjult bak en
   `eslint-disable-next-line react-hooks/exhaustive-deps`-kommentar. `conv`
   er selve React Query-resultatet for samtalen, som denne kanalens EGEN
   UPDATE-handler skriver til (`setQueryData(["conversation", id], ...)`) —
   en potensiell selvforsterkende løkke: melding kommer inn → `conv`
   oppdateres → effekten kjører på nytt (fordi `conv` er i deps) → kanalen
   rives ned og settes opp igjen → mulig tap av meldinger i det korte
   vinduet kanalen er nede, midt i en aktiv chat. Dette er inne i selve
   meldingsfunksjonen med tettere trigger-frekvens enn de to allerede
   fikset — **høyere prioritet enn de forrige to var**.

**Anbefaling:** fiks begge på samme måte som punkt 2 over (depend på
`user?.id`), og for `meldinger.$id.tsx` spesifikt fjern `conv` fra
avhengighetslisten siden effekten bruker `queryClient.setQueryData`
(trenger ikke en fersk `conv` i closure).

**Lavere prioritet / verdt å nevne, ikke undersøkt videre:**

- Sjekk om `MessagesIconLink` og `MessagesButton` noensinne er montert
  samtidig (samme side, samme økt) — hvis ja, er det duplikate
  WebSocket-abonnementer for samme bruker/tabell som kunne slås sammen til
  én delt hook-instans, men bare hvis dette faktisk skjer i praksis.
- Ikke noe nytt om det stille "Neste"-klikket (punkt 1) — venter fortsatt
  på det daterte sjekkpunktet 2026-11-01.

## Lærdom fra denne runden

1. **En "løst"-merket root-årsak bør sjekkes for om fiksen faktisk er
   fullstendig, ikke bare merkbart bedre.** `queueMicrotask`-fiksen fra 26.
   juli reduserte frekvensen dramatisk (fra "hver eneste side" til "én gang
   over flere måneders bruk"), men var ikke en fullstendig fiks — den byttet
   ut ett race-vindu med et mindre. Den riktige fiksen fantes i et
   dokumentert `AuthChangeEvent`-tilfelle (`INITIAL_SESSION`) som allerede
   var tilgjengelig, bare ikke brukt.
2. **Konsekvent reproduserbare "mystiske" symptomer er ofte forklarbare med
   nok kontekst om kall-rekkefølgen** — WebSocket-advarselen virket
   tilfeldig/miljøavhengig i runde 2 (observert i 2 av 4 kjøringer), men
   viste seg å være 100 % deterministisk denne runden (6 av 6) én gang man
   forsto den eksakte navigasjonsmekanismen (`page.goto()` vs. klient-side
   ruting). Verdt å chase ned presist fremfor å avfeie som flakiness.
3. **CI-arkeologi (lete i historiske kjøringer for et spesifikt
   attachment-navn/symptom) er en billig måte å få et ekte
   "0 forekomster over N kjøringer"-datapunkt** i stedet for å anta at
   fravær av nye rapporter betyr fravær av problemet — dette bekreftet
   punkt 1 sitt "ikke reprodusert" empirisk, ikke bare ved mangel på
   klager.
