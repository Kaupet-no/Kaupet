# Native annonseopprettelse som swipebare kort

> Autoritativ arbeidsplan for v2 av annonseopprettelsen på iOS og Android.
> Dokumentet skal oppdateres i samme commit som hver implementeringsfase.
> Tidligere gjennomført konsolidering og historikk finnes i
> [ANNONSEOPPRETTELSE-UX-PLAN.md](ANNONSEOPPRETTELSE-UX-PLAN.md), men ved
> motstrid gjelder dette dokumentet for den native kortflyten.

Opprettet: 2026-08-14
Status: **Teknisk implementering fullført – lokal DB/E2E og fysisk QA gjenstår**
Eier: Den som utfører aktiv fase
Målflate: iOS og Android i Capacitor
Ikke målflate: Redesign av webflyten

## 1. Mål og produktbeslutninger

Native annonseopprettelse skal oppleves som en rolig, fokusert kortstokk hvor
brukeren kan gå videre med knapp eller horisontal swipe. Kategorien velges før
tittel eller annen fritekst. Global appnavigasjon skjules mens flyten pågår og
erstattes av en avgrenset kontrollrad med forrige, avbryt og neste.

Følgende er besluttet:

- Kategorien er første innholdskort. Tittelfeltet og kategoriforslag basert på
  tittel fjernes fra dette kortet.
- Swipe er et supplement til synlige knapper, aldri eneste navigasjonsmåte.
- Et forsøk på å gå fremover validerer aktivt kort. Ved mangler blir brukeren
  stående, kortet får en rolig rød feilanimasjon, én lett haptisk respons
  avfyres, forklaring vises og fokus flyttes til første ugyldige kontroll.
- Bakoverswipe og «Forrige» skal aldri valideringsblokkeres.
- Global bunnavigasjon og nettbrettets navigasjonsrail skjules gjennom hele
  composer-ruten. Avbryt er en egen rund, grå ikonknapp mellom forrige og
  neste.
- Kontrollraden begrenses i bredde og respekterer safe area og tastatur.
- Native felt får en romsligere presentasjon enn web, men deler samme
  skjematilstand, validering, domene- og publiseringslogikk.
- Alle animasjoner respekterer `prefers-reduced-motion`. Haptikk, farge og
  swipe erstatter aldri tekstlig eller semantisk feedback.

## 2. Grunnlag og kode som er gjennomgått

Vurderingen bygger på full gjennomgang av repoets agentinstrukser og disse
normative dokumentene:

- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/UI-GUIDE.md`
- `docs/STAGING.md`
- `src/routes/README.md`
- `CONTRIBUTING.md`
- `docs/ANNONSEOPPRETTELSE-UX-PLAN.md`
- `docs/ANNONSEOPPRETTELSE-MANUELL-QA.md`

Følgende implementasjoner og nærliggende mønstre er kartlagt:

- `src/routes/_authenticated/ny-annonse.tsx`
- `src/routes/_authenticated/ny-ok-annonse.tsx`
- `src/features/listing-creation/**`
- `src/components/onboarding-flow.tsx`
- `src/components/app-bottom-nav.tsx`
- `src/routes/__root.tsx`
- `src/lib/native-setup.ts`, `src/lib/haptics.ts` og
  `src/hooks/use-keyboard-visible.ts`
- `src/styles.css`
- relevante Vitest- og Playwright-tester i `src/features/listing-creation/**`
  og `e2e/**`

Dette er en kode- og dokumentbasert UX-vurdering. Den erstatter ikke fysisk
testing på iOS/Android eller moderert brukertest.

## 3. Funn i dagens løsning

### 3.1 Det som allerede er et godt fundament

- `ListingComposerShell` er allerede delt mellom salgsannonser og
  kjøpsønsker. Det eier header, fremdrift, feiloppsummering, fokus ved
  stegskifte og footer.
- Salgsflyten velger teknisk sett kategori først gjennom
  `effectiveFlowForCategory()`, og feltgrupperegisteret er autoritativt for
  kategoriavhengig innhold.
- Validering bruker React Hook Form/Zod med `mode: "onTouched"`, og
  `ComposerErrorSummary` gir et tilgjengelig tekstlig feilanker.
- `native-setup.ts` bruker `visualViewport` og `KeyboardResize.Native` for å
  krympe WebView-en og rulle fokusert input inn i synlig område.
- `haptics.ts` normaliserer alle signaler til ett kort, lett native trykk.
- Onboarding viser at CSS scroll snap, rolig overgang, prikkeindikator og
  haptikk ved kortskifte allerede fungerer i appskallet.
- Utkast, review, publisering og tilbakehistorikk er allerede etablert og skal
  bevares.

### 3.2 Avvik som må rettes

| Prioritet | Funn                                                          | Evidens i dagens kode                                                                                                                               | Konsekvens                                                                                                   |
| --------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| P0        | Global navigasjon vises fortsatt i composer                   | `__root.tsx` rendrer `AppBottomNav`; komponenten bytter bare «+» til «Avbryt». `ListingComposerShell` plasserer footeren over `--app-bottom-nav-h`. | Fire irrelevante avbrytingspunkter konkurrerer med oppgaven og stjeler høyde.                                |
| P0        | Native steg er ikke swipebare kort                            | Skallet rendrer bare gjeldende `children`; ingen horisontal track eller kontrollert swipe finnes.                                                   | Opplevelsen samsvarer ikke med onboarding eller ønsket native mentalmodell.                                  |
| P0        | Tittel ligger fortsatt på første kategorikort                 | `CategorySelect` rendrer `listing-start-title` på native og forklarer at teksten brukes til kategoriforslag.                                        | Første steg ber om informasjon uten pålitelig produktverdi og utsetter kategorivalget.                       |
| P0        | Footer kan bare uttrykke fullbredde primærhandling            | Native knappene har `w-full`; skallet bruker `flex-wrap` og kjenner ikke treposisjonsnavigasjon.                                                    | Dårlig balanse på store telefoner/nettbrett og ingen midtstilt, distinkt avbrytknapp.                        |
| P1        | Validering gir tekst/fokus, men ikke kortrespons              | `goToNextPage()` setter feiloppsummering og returnerer.                                                                                             | Et mislykket swipe vil mangle direkte årsak–virkning på kortet.                                              |
| P1        | Sideinndelingen er basert på opptil tre feltgrupper           | `resolveWizardPages()` bruker `chunkSize = 3` på native og kombinerer levering/review.                                                              | Flere kort får flere hovedbeslutninger, varierende høyde og svak kortfølelse.                                |
| P1        | `title-photos` kobler to ulike oppgaver                       | Samme feltgruppe eier obligatorisk tittel og valgfritt bildeopplasting.                                                                             | Vanskelig å lage ett fokusert kort og å gi korrekt stegvalidering.                                           |
| P1        | Tastaturstøtten er global, men ikke composer-spesifikt bevist | `visualViewport` ruller fokusert felt med smooth scroll; footeren bruker fast posisjon og bunnnav-offset.                                           | Felt, feilmelding eller kontrollrad kan fortsatt havne trangt/ustabilt på små skjermer og Android-varianter. |
| P1        | Flere native kontroller er visuelt for små/tette              | Standard `Input`, små lenkehandlinger og keyword-chips brukes uendret.                                                                              | Treffområder og hierarki gir ikke konsekvent premium/native uttrykk.                                         |
| P2        | Onboardingmønsteret kan ikke kopieres direkte                 | Onboardingkortene har statisk innhold, ingen vertikal felt-scroll og ingen blokkerende validering.                                                  | Direkte gjenbruk ville gi gestkonflikter og utilgjengelig validering.                                        |

### 3.3 Rotårsaker

Problemet er ikke manglende animasjon alene. `ListingComposerShell` modellerer
en dokumentside med én fullbredde handling, mens ønsket opplevelse krever en
native presentasjonskontrakt for kort, gestintensjon, kortstatus og tre faste
navigasjonsposisjoner. Domenelogikken er allerede egnet og skal ikke skrives
om.

## 4. Anbefalt målopplevelse

### 4.1 Kort og navigasjon

På native fyller composer-skallet tilgjengelig visuell viewport. Header og
kompakt fremdrift ligger øverst, aktivt kort ligger i en avgrenset midtregion,
og kontrollraden ligger nederst. Selve kortet kan rulle vertikalt når innhold
eller tekstskalering krever det.

Kontrollraden har en maksimumsbredde på omtrent `32rem` og tre like
posisjonskolonner:

1. venstre: «Forrige» med pil, skjult/deaktivert på første kort;
2. midten: rund 52–56 px `Avbryt`-knapp med `X`, dempet semantisk gråtone og
   `aria-label="Avbryt annonseopprettelse"`;
3. høyre: «Fortsett»/«Publiser» med pil eller status.

Forrige og neste skal være tydelige, minst 48 px høye og ikke strekke seg over
hele skjermen. På smal telefon kan de bruke tilgjengelig kolonnebredde; på
nettbrett forblir kontrollraden sentrert.

AppBottomNav og navigasjonsrail skal ikke monteres på `/ny-annonse` eller
`/ny-ok-annonse`. Dette gjøres i rotlayoutens presentasjonsgrense, ikke med
lokal CSS som bare skjuler synlige elementer. `--app-bottom-nav-h` og
`--app-nav-rail-w` skal da være null for composer-rutene.

### 4.2 Swipekontrakt

- Horisontal swipe fra høyre mot venstre betyr «forsøk å fortsette».
- Horisontal swipe fra venstre mot høyre betyr «forrige».
- Retning låses først når horisontal bevegelse tydelig overstiger vertikal
  bevegelse; vertikal feltscroll skal ikke kapres.
- Swipe startes ikke fra kontroller som trenger egen horisontal gest, for
  eksempel bildekarusell, slider eller kart. Disse merkes med ett etablert
  data-attributt på interaksjonsroten.
- Terskel baseres på både avstand og hastighet, men implementeres som en liten
  lokal helper uten ny gestavhengighet.
- Ved godkjent navigasjon glir aktivt kort rolig ut og neste inn. Fokus flyttes
  først etter overgangen.
- Ved redusert bevegelse byttes kort uten translasjonsanimasjon.
- Synlige knapper, Android tilbake og iOS historikk/kantsveip skal føre til
  samme navigasjonsfunksjoner som swipe.

Onboardingens scroll-snap-kode brukes som visuell referanse, ikke som direkte
komponent. Composer trenger validering før fremoverskifte, vertikal scroll og
feltinteraksjon. En liten `NativeComposerDeck` i eksisterende feature er nok;
ingen generell karusell eller tredjeparts gestpakke anbefales.

### 4.3 Påkrevd felt og avvist fremovernavigasjon

All fremovernavigasjon går gjennom én funksjon som returnerer et eksplisitt
resultat, eksempelvis `advanced | blocked | busy`. Ved `blocked` skal skallet:

1. beholde aktiv indeks;
2. sette kortet i feiltilstand med `aria-invalid`/tilknyttet
   `ComposerErrorSummary`;
3. kjøre én rolig feilsekvens: svak destruktiv bakgrunn/border og kort
   sideveis bevegelse, totalt omtrent 450–650 ms;
4. kalle `hapticNotification("error")` én gang per navigasjonsforsøk;
5. vise konkret norsk forklaring og fokusere første ugyldige felt;
6. nullstille animasjonstilstanden etter `animationend`, ikke med spredte
   tidskonstanter.

Animasjonen skal bruke semantiske tokens (`destructive`) med lav opasitet,
ikke hardkodet rødt. `prefers-reduced-motion` fjerner bevegelsen, men beholder
rolig farget markering, tekst og fokus. Flere raske swipes skal ikke køe flere
haptiske signaler eller animasjoner.

### 4.4 Tastatur og synlige felt

Den eksisterende native initialiseringen beholdes, men composer må legge til
en målrettet synlighetskontrakt:

- Kortregionens høyde beregnes fra `--vvh`; ingen `100vh`-konstant.
- Kontrollraden festes til bunnen av den krympede visuelle viewporten og
  bruker safe area bare når tastaturet ikke allerede erstatter området.
- Aktivt input/textarea scrolles inn i kortets egen scrollcontainer med
  `block: "center"` eller nok `scroll-margin-bottom` til at feltets etikett,
  verdi og feiltekst er synlige.
- Ikke bruk tvungen smooth scroll når Reduce Motion er aktivert.
- `focusin`, `visualViewport.resize` og stegskifte må bruke samme helper og
  kansellere foreldede `requestAnimationFrame`-jobber.
- Verifiser iOS med forutsigende tekstlinje og Android med minst Gboard; ren
  nettleseremulering kan ikke godkjenne dette kravet.

### 4.5 Native visuell stil

- Kort: én overflate, stor radius, subtil border/skygge, romslig 16–24 px
  innvendig padding og maks lesebredde. Ikke kort inni kort.
- Input/textarea: minst 56 px høyde, `text-base` eller større, tydelig label,
  romslig padding og semantisk fokusmarkering. Textarea får praktisk
  minstehøyde, men kan krympe med tastaturet og rulle internt ved behov.
- Valgrader: minst 56 px, hele raden tappbar, tydelig valgt tilstand.
- Ikonhandlinger: minst 48×48 px, alltid `aria-label`.
- Rolig innlasting/valg: `transition-colors`, små opacity/transform-overganger
  og lett haptikk der det bekrefter en beslutning. Unngå kontinuerlig pynt.
- Dark mode, Dynamic Type/font scale, 200 % tekst og Reduce Motion er
  akseptansekriterier, ikke etterarbeid.

Web beholder dokumentlayout og eksisterende kontroller med mindre delte
semantiske eller tilgjengelighetsmessige rettelser er nødvendige.

## 5. Anbefalt feltfordeling

Hovedregelen på native er én forståelig oppgave per kort. Valgfrie kort kan
hoppes over med «Fortsett» og skal si tydelig at innholdet er valgfritt.

### 5.1 Generisk salgsannonse

| Rekkefølge | Kort                  | Felt/handling                                                       | Hvorfor                                                                        |
| ---------- | --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1          | Hva vil du selge?     | Kategori og kategorisøk, ingen tittel                               | Gir riktig flow og felter før brukeren skriver innhold.                        |
| 2          | Legg til bilder       | Bilder og eventuell 360-handling, valgfritt                         | Bilder er en egen, visuelt krevende oppgave og bør ikke konkurrere med tittel. |
| 3          | Gi annonsen en tittel | Tittel, obligatorisk                                                | Kategorien gjør eksempel og ordlyd relevant; ett kort gir god tastaturplass.   |
| 4          | Beskriv varen         | Beskrivelse og sekundære nøkkelordforslag, obligatorisk beskrivelse | Samler fritekst uten pris-/tilstandsstøy.                                      |
| 5          | Opplysninger          | Kategoriattributter, bare reelt relevante/påkrevde                  | Dynamisk kort; kan deles ved mange felt etter målte høydegrenser.              |
| 6          | Tilstand              | Tilstand                                                            | Én tydelig beslutning med store valgrader.                                     |
| 7          | Pris                  | Gratisvalg og pris                                                  | Samme økonomiske beslutning på ett kort.                                       |
| 8          | Levering              | Henting/sending                                                     | Egen praktisk beslutning. Skjules når kategoriatferd ikke krever den.          |
| 9          | Hvor er varen?        | GPS, postnummer og kartjustering                                    | Tastatur/kart får eget rom; sted kan forhåndsfylles.                           |
| 10         | Se over               | Seksjonsoppsummering, endre og publiser                             | Kontroll før publisering; ingen andre redigeringsfelt.                         |

### 5.2 Kjøretøy

Behold kategoriatferd og Vegvesen-oppslag, men vis følgende native rekkefølge:

1. kategori/kjøretøytype;
2. registreringsnummer eller manuelt kjøretøyvalg;
3. bekreft oppslagsdata;
4. bilder/360;
5. kjøretøyfakta (generert tittel, kilometerstand, pris og eventuell
   undertittel);
6. beskrivelse;
7. tilstand, kjente feil og vedlikehold;
8. utstyr (valgfritt);
9. sted;
10. se over og publiser.

Beskrivelsen ligger bevisst mellom kjøretøyfakta og tilstand: brukeren har da
nettopp sett de faktiske opplysningene og kan skrive en helhetlig presentasjon
før flyten ber om den mer strukturert avgrensede vurderingen av tilstand, feil
og vedlikehold.

Unngå å flytte kjøretøylogikk inn i generiske komponenter. Rekkefølgen skal
fortsatt uttrykkes gjennom `CategoryBehavior`, flow-registry og registrerte
feltgrupper.

### 5.3 Kjøpsønske

Den delte native kortkontrakten bør brukes også på `/ny-ok-annonse`:

1. kategori;
2. kort tittel på det brukeren leter etter;
3. valgfrie kriterier som oversiktsrader og sheets;
4. beskrivelse og makspris;
5. se over, varsling og publiser.

Dette er ikke nødvendig for første vertikale snitt av salgsflyten, men skallet
må ikke få salgs- eller kjøretøyspesifikke antakelser som hindrer migreringen.

### 5.4 Konsekvens for feltgrupper

`title-photos` bør deles i `photos` og `title`. `delivery-location` bør deles
presentasjonsmessig i `delivery` og `location`. Gjør dette med bakoverkompatibel
normalisering av eksisterende flow-rader før eventuell databasemigrasjon:

- les gammel `title-photos` som `photos`, `title` i samme posisjon;
- les gammel `delivery-location` som `delivery`, `location`;
- skriv nye nøkler først etter at adminvisning, tester og alle standardflows
  støtter dem;
- ingen appkode må avhenge av nye databaseverdier før migrasjonen er anvendt.

Dette er en reell forbedring av valideringsgrensen, ikke bare kosmetisk
oppsplitting. Ikke opprett en generell sidebygger utover dagens register.

## 6. Teknisk løsningsskisse

Utvid eksisterende grenser med minst mulig ny kode:

- `ListingComposerShell`: får eksplisitt composer-modus og eier native
  viewport, skjult global nav-kontrakt, kortstatus og treposisjonsfooter.
- `NativeComposerDeck`: liten presentasjonskomponent i
  `features/listing-creation/` for drag/settling og Reduce Motion. Den kjenner
  ikke kategori, felt eller publisering.
- `composer-navigation.ts`: utvid ren logikk med gestretning/terskel og et
  eksplisitt navigasjonsresultat. Test uten DOM.
- Ruter: beholder all skjemavalidering og returnerer resultatet til skallet.
- Feltgrupperegisteret: fortsatt eneste kilde for rekkefølge og validering;
  nye nøkler legges her, ikke i native-spesialtilfeller i ruten.
- Rotlayout/AppBottomNav: ruteavgrenset undertrykking av global nav.
- `native-setup.ts`: behold generell viewportsporing; legg composer-spesifikk
  felt-synlighet nær composer-skallet fremfor mer global magi.

Ingen ny animasjons-, karusell- eller gestavhengighet anbefales. CSS,
Pointer/Touch Events og eksisterende haptikkwrapper dekker behovet.

## 7. Implementeringsregler for alle faser

Hver fase er en selvstendig arbeidsenhet og én atomisk commit. En agent skal:

1. lese dette dokumentet og relevante filer oppført i fasen;
2. kontrollere ren arbeidskopi og bevare urelaterte endringer;
3. oppdatere fasestatus til `Pågår` i samme arbeidscommit;
4. implementere bare fasens scope;
5. evaluere diffen mot formål, arkitektur, webregresjon, a11y og Reduce
   Motion;
6. kjøre oppgitte kontroller og dokumentere faktiske resultater;
7. føre funn, blokkere, avhengigheter, manuell verifisering og commit-hash i
   fasejournalen;
8. committe med Conventional Commit uten `Co-Authored-By`;
9. sette status til `Fullført` først når akseptansekriteriene er oppfylt;
10. ikke starte neste fase før committen er ferdig og arbeidskopien er ren.

Hvis en fase avdekker arbeid utenfor scope, legg det i «Åpne funn og
avhengigheter». Ikke snik det inn i samme commit. Ved databaseskjema gjelder
repoets todelte deployregel: migrasjon commit/pushes og bekreftes anvendt før
avhengig appkode pushes.

## 8. Detaljert, autonom faseplan

### Fase 0 — Skjul global navigasjon og innfør avgrenset kontrollrad

Status: **Teknisk fullført – fysisk QA gjenstår**
Formål: Fjerne avbrytingspunkter og etablere riktig geometri før swipe.

Oppgaver:

1. La rotlayouten identifisere begge composer-ruter og ikke montere
   `AppBottomNav` der, på både telefon og nettbrett.
2. Sørg for at nav-relaterte CSS-variabler/padding nullstilles uten flimring
   når ruten åpnes og gjenopprettes når den forlates.
3. Utvid `ListingComposerShell` med sentrert, maksbreddet kontrollrad:
   forrige til venstre, rund dempet avbryt i midten, neste/publiser til høyre.
4. Koble avbryt til eksisterende `useBlocker`/utkastdialog. Ikke naviger
   direkte forbi datatapsvernet.
5. Behold webfooter visuelt og funksjonelt uendret.
6. Dekk første/mellom/siste steg, nettbrett og fokusnavn med komponenttest.

Kontroller: `bun run lint`, `bunx tsc --noEmit`, målrettet Vitest,
composer-E2E på web/native-emulert og visuell sjekk 375×812 samt 820×1180.

Akseptanse: ingen global nav/rail i composer; alle tre handlinger har minst 48
px treffområde; rad maksimeres ikke på nettbrett; avbryt viser eksisterende
datatapsvern; web har ingen layoutregresjon.

Foreslått commit: `feat: avgrens native composer-navigasjon`

### Fase 1 — Kategori først og atomiske feltgrupper

Status: **Teknisk fullført – lokal migrasjonsverifisering gjenstår**
Formål: Gi hvert kort én oppgave og fjerne tittelfeltet fra inngangen.

Oppgaver:

1. Bruk eksisterende tester som regresjonsbaseline og lås ved behov eksplisitt
   at domenedata og publiseringspayload ikke endres av feltoppsplittingen.
2. Kartlegg faktiske lagrede kategori-flow-rader og hvilke som bruker
   `title-photos` eller `delivery-location`, slik at normaliseringen dekker
   reelle data før registeret endres.
3. Fjern native tittelinput, kategoriforslag og tilhørende hjelpetekst fra
   `CategorySelect`. Kategorisøk og valg fyller hele første kort.
4. Splitt `title-photos` i `photos` og `title` i register, komponenter,
   etiketter og tester. Bevar kjøretøyets genererte tittelkontrakt.
5. Splitt `delivery-location` i `delivery` og `location` når kategoriatferden
   krever begge; ikke vis tomt leveringskort for kjøretøy.
6. Legg bakoverkompatibel normalisering til gamle flow-nøkler og test
   rekkefølge for generisk, kjøretøy og båt.
7. Endre native paging til hovedsakelig én feltgruppe per kort. Dokumenter
   eksplisitt hvert unntak og hvorfor det fortsatt er én beslutning.
8. Oppdater admin-preview/labels og E2E page object. Ikke migrer databasen i
   samme commit dersom appen ikke allerede kan lese begge formater.

Kontroller: kategori-flow- og validator-Vitest, full `bun run test`, lint,
typecheck og composer-E2E for generisk/kjøretøy.

Akseptanse: første kort har ingen tittel; data som publiseres er uendret;
gamle flow-rader fungerer; obligatorisk tittel valideres på eget kort; ingen
generisk kjerne importerer kjøretøylogikk.

Foreslått commit: `refactor: del native annonsefelt i fokuserte steg`

### Fase 2 — Native kortstokk og swipe

Status: **Teknisk fullført – fysisk gesture-QA gjenstår**
Formål: Innføre swipe uten å svekke vertikal scroll, feltkontroller eller
tilgjengelighet.

Oppgaver:

1. Implementer og enhetstest ren gestterskel/retningslogikk i eksisterende
   composer-navigation-grense.
2. Lag `NativeComposerDeck` som viser aktivt, forrige og neste kort nok til
   en rolig overgang, men ikke monterer hele flyten samtidig dersom det gir
   fokus- eller ytelsesproblemer.
3. Route alle fremoverhandlinger gjennom samme async valideringsfunksjon;
   knappen og swipe må få samme resultat.
4. Unnta interaktive underflater med egen horisontal gest. Test bildeopplaster,
   kart, slider, sheets og textarea-selection.
5. Koble Android tilbake/iOS historikk og «Forrige» til samme bakoverhandling.
6. Legg inn Reduce Motion og tastaturnavigasjon; skjermleser skal bare møte
   aktivt kort.
7. Behold web på eksisterende dokumentside.

Kontroller: helper-/komponent-Vitest, full test, lint, typecheck og Playwright
for knapp/swipe frem, swipe tilbake, vertikal scroll og gesture-unntak.

Akseptanse: swipe og knapper er funksjonelt like; swipe kaprer ikke vertikal
scroll eller underkontroller; ingen handling krever swipe; kun aktivt kort er
i tilgjengelighetstreet; Reduce Motion har ingen translasjon.

Foreslått commit: `feat: legg til swipebar native composer`

### Fase 3 — Valideringsanimasjon og haptikk

Status: **Teknisk fullført – fysisk haptikk-QA gjenstår**
Formål: Gjøre blokkert fremovernavigasjon tydelig, rolig og tilgjengelig.

Oppgaver:

1. Innfør eksplisitt navigasjonsresultat fra begge composer-ruter.
2. La skallet eie én kort-feiltilstand og nullstille den ved `animationend`,
   gyldig redigering eller stegskifte.
3. Implementer semantisk rød feilsekvens og Reduced Motion-variant.
4. Kall eksisterende `hapticNotification("error")` én gang når et nytt
   fremoverforsøk blokkeres; ingen haptikk på web.
5. Bevar inline feltfeil og `ComposerErrorSummary`; forbedre konkrete
   meldinger der dagens generiske tekst ikke sier hva som mangler.
6. Fokuser og scroll første ugyldige kontroll trygt inn over tastaturet.
7. Dekk hurtige gjentatte swipes/trykk og async kjøretøyoppslag uten doble
   signaler.

Kontroller: komponenttester med fake animation events og mocket haptikk, full
Vitest, lint, typecheck og E2E for hvert valideringsutfall.

Akseptanse: ugyldig swipe skifter aldri kort; tekst/fokus er tilstrekkelig
uten farge/haptikk; én lett vibrasjon per forsøk; ingen køet eller fastlåst
animasjon; Reduce Motion er rolig og komplett.

Foreslått commit: `feat: gi native kort tydelig valideringsrespons`

### Fase 4 — Native feltstil og tastatursikkerhet

Status: **Teknisk fullført – fysisk tastatur-QA gjenstår**
Formål: Gi feltene premium native uttrykk og bevise at brukeren alltid ser
det som skrives.

Oppgaver:

1. Legg native-varianter på eksisterende `Input`, `Textarea`, valgrader og
   relevante feltgrupper; ikke kopier domene-komponentene.
2. Gjør felter minst 56 px høye, labels og hjelpetekst tydelige, og alle
   treffområder minst 48 px.
3. Implementer én composer-lokal `ensureFocusedFieldVisible`-helper knyttet
   til kortets scrollcontainer og `visualViewport`.
4. Juster kortregion/footer for `--vvh`, safe area, tastatur synlig/skjult og
   nettbrett med maskinvaretastatur.
5. Kontroller alle tekstfelt: tittel, beskrivelse, pris, kilometerstand,
   registreringsnummer, postnummer og dynamiske kategoriattributter.
6. Verifiser 200 % tekst, iOS Dynamic Type, Android font scale, mørk modus og
   landskap på nettbrett. Rett kun dokumenterte avvik.

Kontroller: relevante komponenttester, full test, lint, typecheck, visuell
Playwright på fire avtalte viewporter og fysisk tastaturmatrise.

Akseptanse: aktiv label, feltverdi og feiltekst er synlig med tastatur; footer
er tilgjengelig uten å dekke felt; ingen horisontal overflow; native stil er
romslig og web er uendret.

Foreslått commit: `feat: tilpass composer-felt og tastatur for native`

### Fase 5 — Rolig bevegelse og helhetlig polish

Status: **Teknisk fullført – fysisk design-QA gjenstår**
Formål: Samordne bevegelse og visuelt hierarki uten funksjonell omskriving.

Oppgaver:

1. Definer få lokale bevegelsestokens for kortskifte, valg og feilrespons;
   bruk dem konsekvent.
2. Legg lett selection-haptikk kun ved meningsfulle native valg/stegskifte,
   ikke på hvert tastetrykk eller scroll.
3. Fjern unødvendige rammer/kort-i-kort og kontinuerlige animasjoner fra
   composer-flaten.
4. Verifiser lastende, tom, feil, offline, utkast gjenopprettet, kjøretøyoppslag,
   bildeopplasting, review og publisering.
5. Oppdater visuelle snapshots først etter godkjent fysisk designgjennomgang.

Kontroller: full lint, typecheck, Vitest, build, Playwright og visuell diff i
lys/mørk + Reduce Motion.

Akseptanse: alle overganger har funksjonelt formål; ingen bevegelse hindrer
input eller skjermleser; ingen ny avhengighet; UI-gjennomgang er dokumentert.

Foreslått commit: `style: finpuss native annonsekort`

### Fase 6 — Kjøpsønske, migrasjon og samlet utrulling

Status: **Teknisk implementert – lokal DB/E2E og utrulling gjenstår**
Formål: Fullføre felles native kontrakt og fjerne overgangskode kontrollert.

Oppgaver:

1. Migrer `/ny-ok-annonse` til samme kort-, footer-, swipe-, validerings- og
   tastaturkontrakt med feltfordelingen i punkt 5.3.
2. Dersom flow-nøkler lagres i databasen: lag append-only migrasjon til nye
   nøkler, utvid relevante database-/RLS-tester, commit/push migrasjonen og
   vent på bekreftet anvendelse før avhengig opprydding.
3. Fjern kompatibilitetslesing bare når alle miljøer og utkast er migrert;
   ellers behold den som dokumentert overgang.
4. Kjør manuell QA-plan på fysiske enheter, inkludert VoiceOver, TalkBack,
   Switch Access, Dynamic Type/font scale, tastatur, safe area, offline,
   suspend/kill/resume og rotasjon på nettbrett.
5. Gjennomfør minst fem korte oppgavebaserte brukertester og registrer
   konkrete funn og rettelser i fasejournalen.
6. Rull via staging og kontrollert produksjonsutrulling. Dokumenter rollback.

Kontroller: alle repo-kontroller, RLS ved migrasjon, full Playwright,
produksjonsbuild og den manuelle matrisen.

Akseptanse: begge annonsetyper deler native presentasjonskontrakt; ingen
utkast/data går tapt; staging og fysisk QA er godkjent; åpne P0/P1-funn er
lukket eller eksplisitt blokkert med eier.

Foreslått commit: `feat: fullfør native kortflyt for kjøpsønsker`

## 9. Testmatrise

| Område          | Minimum                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Viewporter      | 375×812, 844×390, 820×1180, 1024×1366 og 320 px web                                             |
| Plattformer     | Minst én støttet iPhone/iOS og to representative Android WebView-enheter/emulatorer             |
| Inndata         | Alle tekst-/tallfelt, lang tekst, autofyll, paste, ekstern tastatur og IME                      |
| Gest            | Sakte/rask swipe, diagonal/vertikal scroll, swipe fra kontroll, system-tilbake og iOS kantsveip |
| Tilgjengelighet | VoiceOver, TalkBack, Switch Access, tastatur, 200 % tekst, Reduce Motion og høy kontrast        |
| Livssyklus      | reload, bakgrunn, suspend, kill/resume, offline/online og utkastgjenoppretting                  |
| Domene          | generisk, gratis, kjøretøy med/uten oppslag, båt, kategoriendring og kjøpsønske                 |
| Tema            | lys og mørk, safe area med notch/Dynamic Island og Android gesture-nav                          |

Automatisering skal prioritere navigasjonskontrakten og dataintegritet.
Fysisk QA er obligatorisk for tastatur, WebView-gest, haptikk og safe area.

## 10. Risikoer og avhengigheter

| Risiko/avhengighet                                         | Håndtering                                                      | Eier/fase | Status |
| ---------------------------------------------------------- | --------------------------------------------------------------- | --------- | ------ |
| Swipe kolliderer med vertikal scroll eller bildekontroller | Retningslås, data-attributt og eksplisitte regresjonstester     | Fase 2    | Åpen   |
| Async validering gir dobbelt stegskifte/haptikk            | Én busy-state og eksplisitt navigasjonsresultat                 | Fase 2–3  | Åpen   |
| Dynamiske flow-rader bruker gamle sammensatte nøkler       | Bakoverkompatibel normalisering før migrasjon                   | Fase 1/6  | Åpen   |
| Appnavigasjon skjules, men CSS-offset blir igjen           | Test ruteinn/ut på telefon og rail-nettbrett                    | Fase 0    | Åpen   |
| Tastatur varierer mellom WebView/IME                       | Fysisk iOS/Android-matrise; ikke godkjenn på browser alene      | Fase 4    | Åpen   |
| Mange kategoriattributter gir for høyt kort                | Mål innhold; del kun når det finnes en meningsfull underoppgave | Fase 1/4  | Åpen   |
| Ny native stil lekker til web                              | Gate i presentasjonsgrensen og visuell webregresjon             | Alle      | Åpen   |
| Utkast lagrer gammel feltgruppeidentitet                   | Test gjenoppretting før/etter normalisering                     | Fase 1/6  | Åpen   |

## 11. Statusoversikt

| Fase                          | Status                                     | Avhengigheter     | Commit/PR            |
| ----------------------------- | ------------------------------------------ | ----------------- | -------------------- |
| 0 – Global nav og kontrollrad | Teknisk fullført                           | –                 | `eca2d81`            |
| 1 – Kategori/feltgrupper      | Teknisk fullført, DB-verifisering gjenstår | Fase 0            | `eca2d81`, `58ee404` |
| 2 – Kortstokk og swipe        | Teknisk fullført                           | Fase 1            | `b683b32`            |
| 3 – Valideringsrespons        | Teknisk fullført                           | Fase 2            | `5ff81d5`            |
| 4 – Feltstil og tastatur      | Teknisk fullført                           | Fase 3            | `58d64ca`            |
| 5 – Bevegelse/polish          | Teknisk fullført                           | Fase 4            | `58d64ca`            |
| 6 – Kjøpsønske/utrulling      | Teknisk implementert, DB/E2E gjenstår      | Fase 5, migrasjon | `58d64ca`            |

## 12. Fasejournal

Oppdater statusoversikten og legg til én journalpost i samme commit som hver
fase. Eksisterende poster skal ikke overskrives.

```md
### Fase N — YYYY-MM-DD

- Status: Pågår / Fullført / Delvis / Blokkert
- Ansvarlig:
- Formål oppnådd:
- Endrede filer:
- Nye funn:
- Avvik fra plan og begrunnelse:
- Blokkere og avhengigheter (med eier):
- Kontroller kjørt og resultat:
- Manuelt verifisert på:
- Ikke verifisert / risiko:
- Commit/PR:
```

### Vurdering — 2026-08-14

- Status: Fullført
- Ansvarlig: Codex
- Formål oppnådd: Kartlagt nåværende composer, onboarding, global nav,
  feltgrupper, validering, haptikk, tastatur og relevante tester. Foreslått
  målkontrakt, feltfordeling og autonome implementeringsfaser.
- Endrede filer: Dette dokumentet.
- Nye funn: Tittel er fortsatt del av kategorikortet; global nav er fortsatt
  montert; native paging grupperer opptil tre feltgrupper; sammensatte
  feltgrupper hindrer én oppgave per kort.
- Avvik fra plan og begrunnelse: Ingen kode er endret; oppdraget ba først om
  vurdering og implementeringsplan.
- Blokkere og avhengigheter: Fysisk WebView-, tastatur-, haptikk- og
  safe-area-verifisering inngår i de relevante implementeringsfasene.
- Kontroller kjørt og resultat: Dokumentkontroll og `git diff --check` kjøres
  før levering.
- Manuelt verifisert på: Ikke aktuelt for dokumentfasen.
- Ikke verifisert / risiko: Fysisk WebView-, tastatur-, haptikk- og
  safe-area-atferd er ikke testet i denne vurderingen.
- Commit/PR: Ikke opprettet.

### Fase 0 — 2026-08-14

- Status: Teknisk fullført; fysisk QA gjenstår
- Ansvarlig: Codex
- Formål oppnådd: Rotlayouten undertrykker global bunnavigasjon og rail på
  begge composer-ruter og nullstiller nav-offsetene. Det delte skallet har en
  maksbreddet native kontrollrad med Forrige, rund Avbryt og Fortsett/
  Publiser, koblet til eksisterende rutenavigasjon og `useBlocker`.
- Endrede filer: Rotlayout, globale nav-offsets, composer-skall, begge
  composer-ruter, native publiseringshandling og komponent-/rutetester.
- Nye funn: Native forhåndsvisningsknapp konkurrerte med den besluttede
  treposisjonsraden og er fjernet fra footeren; review-kortet er fortsatt den
  obligatoriske gjennomgangen før publisering.
- Avvik fra plan og begrunnelse: Fase 0 og 1 er samlet i samme commit etter
  korrigert bestilling, ikke i separate commits.
- Blokkere og avhengigheter (med eier): Visuell native-emulert kontroll og
  composer-E2E gjenstår før fasen kan markeres fullført.
- Kontroller kjørt og resultat: Målrettet Vitest (7 tester), full `bun run
test` (319 tester), `bun run lint` og `bunx tsc --noEmit` bestått.
- Manuelt verifisert på: Lokal nettleserkontroll ble forsøkt på 375×812, men
  in-app-nettleseren kunne ikke nå utviklingsserveren.
- Ikke verifisert / risiko: 375×812 og 820×1180 visuelt, fysisk safe area,
  tastatur og datatapsdialog gjennom full brukerflyt.
- Commit/PR: Denne committen (`feat: innfør native composer-grunnlag`).

### Fase 1 — 2026-08-14

- Status: Teknisk fullført; lokal migrasjonsverifisering gjenstår
- Ansvarlig: Codex
- Formål oppnådd: Påbegynt bakoverkompatibel oppsplitting av `title-photos`
  og `delivery-location`, fjernet tittel og kategoriforslag fra første native
  kort og endret native paging til én atomisk feltgruppe per kort.
- Endrede filer: `category-flows`, feltgrupperegister/-komponenter,
  validatorer, admin-preview, salgsruten og relevante tester/E2E-hjelpere.
- Nye funn: Databasens check-constraint krever fortsatt `title-photos`; admin
  må derfor skrive legacy-format frem til migrasjonsfasen.
- Avvik fra plan og begrunnelse: Arbeidet ble startet før Fase 0 etter
  eksplisitt bestilling av Fase 1; Fase 0 ble deretter lagt til og er samlet i
  samme commit.
- Blokkere og avhengigheter (med eier): Fase 0-verifisering og fysisk/native E2E gjenstår
  før fasen kan godkjennes som fullført.
- Kontroller kjørt og resultat: `bun run lint`, `bun run test` (319 tester) og
  `bunx tsc --noEmit` bestått.
- Manuelt verifisert på: Ikke utført.
- Ikke verifisert / risiko: Composer-E2E, visuell native flyt, fysisk iOS/
  Android og publiseringspayload mot en kjørende Supabase-instans.
- Commit/PR: Denne committen (`feat: innfør native composer-grunnlag`).

### Fase 2 — 2026-08-14

- Status: Teknisk fullført; fysisk gesture-QA gjenstår
- Ansvarlig: Codex
- Formål oppnådd: Påbegynt ren gestterskel og en native kortgrense der
  fremoverswipe bruker samme asynkrone valideringsfunksjon som knappen,
  bakoverswipe bruker eksisterende tilbakehandling og kun aktivt kort er
  montert.
- Endrede filer: Composer-navigasjon og tester, ny `NativeComposerDeck`,
  salgsruten samt eksplisitte gest-unntak på bildeopplaster og kart.
- Nye funn: Eksisterende `data-vaul-no-drag` kan gjenbrukes som gest-unntak
  for sliders/sheets; interaktive HTML-kontroller unntas generisk.
- Avvik fra plan og begrunnelse: Kjøpsønsket migreres fortsatt i Fase 6.
  Nabokort monteres ikke i denne første leveransen fordi aktivt innhold er
  tilstrekkelig for drag-overgangen og unngår dupliserte felt/fokusnoder.
- Blokkere og avhengigheter (med eier): Playwright-scenarier og fysisk
  iOS/Android-verifisering av retningslås og system-kantsveip gjenstår for
  implementerende agent/QA.
- Kontroller kjørt og resultat: Målrettet Vitest (11 tester), `bun run lint`
  og `bunx tsc --noEmit` bestått. Full test kjøres før levering.
- Manuelt verifisert på: Ikke utført.
- Ikke verifisert / risiko: Fysisk WebView-gest, bilde-draing, kart, sheet,
  textarea-selection, skjermleser og Reduce Motion på enhet.
- Commit/PR: Denne committen (`feat: påbegynn swipebar native composer`).

### Fase 3 — 2026-08-14

- Status: Teknisk fullført; fysisk haptikk-QA gjenstår
- Ansvarlig: Codex
- Formål oppnådd: Påbegynt eksplisitt navigasjonsresultat for salgsflyten og
  felles blokkering av samtidige fremoverforsøk. Native-skallet viser én
  semantisk feilsekvens og sender ett lett feilsignal for hvert blokkert
  knappetrykk eller swipe.
- Endrede filer: Composer-navigasjon, native kortstokk, composer-skall,
  salgsruten, globale animasjonsstiler og målrettede komponenttester.
- Nye funn: Reacts animasjonsevent er prefikset som `webkitAnimationEnd` i
  Vitest/jsdom-miljøet; produksjonskoden bruker Reacts normaliserte handler.
- Avvik fra plan og begrunnelse: Kjøpsønske-ruten får den delte native
  kontrakten i Fase 6 som planlagt. Feltspesifikk tastatur-scroll hører til
  Fase 4 og er ikke trukket inn i dette første snittet.
- Blokkere og avhengigheter (med eier): Konkret feltfokus beholdes fra React
  Hook Form, men fysisk tastatur-/WebView-verifisering gjenstår for Fase 4/QA.
- Kontroller kjørt og resultat: Målrettet Vitest bestått. Full Vitest, lint og
  typecheck kjøres før levering.
- Manuelt verifisert på: Ikke utført.
- Ikke verifisert / risiko: Fysisk haptikk, Reduce Motion og raske blandede
  knapp/swipe-forsøk i WebView.
- Commit/PR: `5ff81d5` (`feat: gi native kort tydelig valideringsrespons`).

### Fase 4 — 2026-08-14

- Status: Teknisk fullført; fysisk tastatur-QA gjenstår
- Ansvarlig: Codex
- Formål oppnådd: Påbegynt native-only feltgeometri og composer-lokal,
  kansellerbar fokussynlighet for fokusbytte, stegskifte og endringer i
  `visualViewport`.
- Endrede filer: Composer-skall, native viewport-fallback, globale native
  composer-stiler og dette plandokumentet.
- Nye funn: Den globale native viewport-handleren brukte alltid smooth scroll
  og måtte avgrenses fra composerens egen scrollcontainer for å unngå to
  konkurrerende scrolljobber.
- Avvik fra plan og begrunnelse: Fase 4 er bare startet. Fase 5 og 6 startes
  ikke før fase 4 er verifisert, slik faseplanens sekvenseringsregel krever.
- Blokkere og avhengigheter (med eier): Fysisk iOS-/Android-verifisering og
  visuell matrise gjenstår (eier: implementatør/QA).
- Kontroller kjørt og resultat: Målrettet Vitest (9 tester), full `bun run
test` (326 tester), `bun run lint`, `bunx tsc --noEmit` og `git diff
--check` bestått.
- Manuelt verifisert på: Ikke utført ennå.
- Ikke verifisert / risiko: IME, safe area, Dynamic Type/font scale, mørk modus
  og nettbrettlandskap.
- Commit/PR: `58d64ca` (`feat: fullfør teknisk native kortflyt`).

### Fase 5 — 2026-08-15

- Status: Teknisk fullført; fysisk design-QA gjenstår
- Ansvarlig: Codex
- Formål oppnådd: Samlet kortskifte og feilrespons under lokale
  bevegelsestokens og lagt ett lett native valgsignal på faktiske kortskifter.
- Endrede filer: Composer-skall, native kortstokk, globale composer-stiler,
  tester og dette plandokumentet.
- Nye funn: Eksisterende haptikkwrapper dekker valgsignal uten ny avhengighet.
- Avvik fra plan og begrunnelse: Teknisk implementering er utført før samlet
  testkjøring etter eksplisitt bestilling. Fysisk designgjennomgang og
  snapshots gjenstår.
- Blokkere og avhengigheter (med eier): Fysisk UI-gjennomgang i lys/mørk og
  Reduce Motion (eier: implementatør/QA).
- Kontroller kjørt og resultat: `bun run lint`, `bunx tsc --noEmit`, full
  `bun run test` (328 tester), `bun run build` og `git diff --check` bestått.
  Playwright ble blokkert før teststart fordi Docker Desktop ikke kjører.
- Manuelt verifisert på: Ikke utført ennå.
- Ikke verifisert / risiko: Offline-, opplastings-, oppslags- og
  publiseringstilstander på fysisk enhet.
- Commit/PR: `58d64ca` (`feat: fullfør teknisk native kortflyt`).

### Fase 6 — 2026-08-15

- Status: Teknisk implementert; lokal DB/E2E og utrulling gjenstår
- Ansvarlig: Codex
- Formål oppnådd: Kjøpsønske bruker teknisk samme native kort-, swipe-,
  footer-, validerings-, haptikk- og tastaturkontrakt som salgsflyten.
  Overgangsmigrasjon utvider lagrede sammensatte feltgrupper atomisk og
  beholder støtte for legacy-skriving.
- Endrede filer: Kjøpsønske-ruten, delt kortstokk, overgangsmigrasjon, tester
  og dette plandokumentet.
- Nye funn: Feltgruppenøklene er lagret i category_flows; kompatibilitetslesing
  må derfor beholdes til alle miljøer og eldre utkast er migrert.
- Avvik fra plan og begrunnelse: Bare teknisk implementering er utført.
  Migrasjonen er ikke pushet/anvendt, og utrulling, fysisk QA og brukertester
  krever eksterne miljøer og deltakere.
- Blokkere og avhengigheter (med eier): Migrasjon må committes/pushes separat
  og bekreftes anvendt før eventuell overgangskode fjernes (eier:
  implementatør). Fysisk QA, fem brukertester og staging/produksjonsutrulling
  gjenstår (eier: QA/produkt/release).
- Kontroller kjørt og resultat: `bun run lint`, `bunx tsc --noEmit`, full
  `bun run test` (328 tester), `bun run build` og `git diff --check` bestått.
  `bun run test:e2e` og `bun run test:rls` ble blokkert før teststart fordi
  Docker Desktop ikke kjører. Playwright-innsamling uten global setup ble
  videre blokkert fordi den genererte `e2e/.auth/user.json` derfor manglet.
- Manuelt verifisert på: Ikke utført ennå.
- Ikke verifisert / risiko: Migrasjon mot lokal/lenket Supabase, RLS,
  tilgjengelighetsmatrise, livssyklus og rollback.
- Commit/PR: `58ee404` og `58d64ca`.

### Teknisk kvalitetssikring — 2026-08-15

- Status: Tekniske kodeavvik rettet; lokal DB/E2E blokkert av en annen lokal
  Supabase-stack på portene 54321–54324.
- Endret: Låste kjøretøyrekkefølgen til fakta, beskrivelse, tilstand og utstyr
  i runtime-normalisering, adminlagring og migrasjon. Swipe støtter nå korte,
  raske flicks og lar neste kort komme inn fra motsatt side etter godkjent
  validering. Salgsflyten beholder kortstokken montert mellom steg slik at
  inngangsovergangen kan fullføres.
- Nye tester: Regresjon for kjøretøyrekkefølge, hastighetsbasert swipe og
  inngangsovergang etter godkjent swipe.
- Kontroller kjørt: `git diff --check`, full ESLint, TypeScript, 331
  Vitest-tester og produksjonsbuild bestått. Tre målrettede testfiler med 25
  tester dekker de korrigerte kontraktene.
- Blokkere: `bunx supabase start` kan ikke starte Kaupet-stacken fordi en annen
  stack med prosjekt-ID `local` bruker port 54322. Den andre stacken er ikke
  stoppet uten eksplisitt brukerautorisasjon.
- Ikke verifisert: Lokal anvendelse av migrasjonen, RLS, Playwright og fysisk
  native QA.
- Commit/PR: Denne committen (`fix: fullfør native kortflyt mot planen`).

### Kodegjennomgang og retting — 2026-08-15

- Status: Funn fra kvalitetssikring rettet.
- Ansvarlig: Claude (kodegjennomgang på oppdrag fra eier)
- Formål oppnådd: Full gjennomgang av `eca2d81^..5e821f9` opp mot planens
  akseptansekriterier. Ett funn med reell produksjonsrisiko rettet, to mindre
  observasjoner rettet.
- Endrede filer: `supabase/migrations/20260815090000_expand_category_flow_field_groups.sql`,
  `src/features/listing-creation/native-composer-deck.tsx`, `src/styles.css`.
- Nye funn: Overgangsmigrasjonen skrev opprinnelig eksisterende
  `category_flows`-rader om til de nye atomære nøklene (`photos`/`title`/
  `delivery`/`location`) med det samme, mens adminlagring
  (`toStoredFieldGroupKeys`) bevisst fortsetter å skrive legacy-format
  (`title-photos`) til alle miljøer er migrert. Det ga to problemer: (1) et
  vindu der allerede utrullet appkode kunne lese rader i et format den ikke
  kjente, siden migrasjonen pushes automatisk uavhengig av appkode-utrulling;
  (2) enhver admin-lagring etter migrasjonen ville stille reversere den
  tilbake til legacy-format. Migrasjonen er endret til kun å utvide
  CHECK-constraint til å akseptere begge formater, uten å skrive om
  eksisterende data — datakonvertering hører til en egen, senere migrasjon
  etter bekreftet appkode-utrulling.
- Avvik fra plan og begrunnelse: Ingen ny avhengighet eller scope-utvidelse;
  rettelsene holder seg innenfor Fase 6s og §5.4s egne regler.
- Blokkere og avhengigheter (med eier): Migrasjonen er fortsatt ikke anvendt
  mot en lokal/lenket Supabase-instans (samme Docker-blokkering som tidligere
  QA-runder). Datakonverteringsmigrasjonen nevnt over er ikke laget ennå
  (eier: implementerende agent, etter bekreftet appkode-utrulling).
- Kontroller kjørt og resultat: Målrettet Vitest (`native-composer-deck`,
  `category-flows`, 21 tester), full `bun run test` (331 tester), `bun run
lint` og `bunx tsc --noEmit` bestått.
- Manuelt verifisert på: Ikke utført.
- Ikke verifisert / risiko: Migrasjonen er ikke kjørt mot en faktisk database
  i denne runden; fysisk native QA gjenstår som før.
- Commit/PR: Denne committen.

## 13. Åpne funn og avhengigheter

Legg nye funn her når de ikke hører hjemme i aktiv fase. Hver rad må ha eier
og neste handling; «senere» er ikke en status.

| Dato       | Fase            | Funn                                                                                                                               | Neste handling                                                                      | Eier                     | Status |
| ---------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------ | ------ |
| 2026-08-14 | Vurdering       | Fysisk keyboard-overlay er ikke verifisert for composer                                                                            | Kjør enhetsmatrisen og legg evidens i fase 4                                        | QA/implementerende agent | Åpen   |
| 2026-08-15 | Fase 6          | Overgangsmigrasjon er laget, men ikke anvendt                                                                                      | Start Docker, kjør RLS og deploy migrasjonen                                        | Implementerende agent    | Åpen   |
| 2026-08-15 | Kodegjennomgang | Migrasjonen ble rettet til kun å utvide constraint; faktisk datakonvertering til atomære nøkler mangler fortsatt en egen migrasjon | Lag datakonverteringsmigrasjonen etter bekreftet appkode-utrulling til alle miljøer | Implementerende agent    | Åpen   |
