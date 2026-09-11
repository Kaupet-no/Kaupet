# Fotoassistert kategori-/egenskapsforslag i annonseopprettelsen

## 1. Kontekst og problem

Annonseopprettelsen (se planen for den semantiske kompositoren,
`src/features/listing-creation/`) tilbyr allerede intern, stemmebasert
tittelstatistikk (`suggest_category_for_title`) som kategoriforslag mens
brukeren skriver tittelen. Denne statistikken kan ikke se bilder og treffer
dårligere for kategorier der tittelen alene er tvetydig (f.eks. "Selger
denne" med et bilde av en sykkel). Vi ønsker et valgfritt, eksplisitt
fotobasert forslag for salgsflyten (kjøpsønske publiserer ikke bilder og
berøres ikke), uten å gjøre Kaupet til en generell bildeanalyse-tjeneste
eller innføre en ny leverandør.

Problemet er derfor: hvordan gi brukeren et bedre kategori-/
egenskapsforslag fra bilder de allerede har lastet opp, uten (a) å sende
bilder til en ekstern part uten eksplisitt samtykke, (b) å bygge en varig
bildeanalyse-pipeline i Kaupet, eller (c) å blokkere manuell utfylling hvis
forslaget feiler eller er utilgjengelig.

## 2. Valgt løsning

Gjenbruk den eksisterende server-only Mistral Small 4-integrasjonen
(`src/lib/category-suggestion-ai.server.ts`), med rå `fetch` mot samme EU
Chat Completions-endepunkt som allerede brukes for eksplisitt tekstbasert
KI-forslag — ingen ny leverandør, ingen SDK.

- **Eksplisitt, per-handling samtykke.** Automatisk intern tittelstatistikk
  er uendret og krever ikke samtykke. Fotoforslag krever at brukeren trykker
  en synlig "Analyser valgte bilder med KI"-handling som på forhånd
  forklarer at inntil tre komprimerte miniatyrer (og eventuell starttekst)
  sendes til Mistral. Samtykket gjelder kun gjeldende `inputRevision`
  (bilder/starttekst/kategori); endres disse, kreves en ny eksplisitt
  handling.
- **Base64-miniatyrer, ikke originalbilder.** Input er `thumbFile` —
  JPEG/PNG/WebP, maks 150 KiB dekodet per bilde, maks 450 KiB totalt, maks
  tre bilder. Et inkompatibelt/for stort bilde hoppes over; er ingen bilder
  gyldige, returneres manuell fallback uten å kalle Mistral.
- **Turnstile + rate limiting foran hvert kall.** Hvert eksternt tekst- eller
  bildekall krever et nytt usynlig Turnstile-token, verifisert
  (`verifyTurnstileToken`) før rate limiteren
  (`assertNotRateLimited("suggest-listing-from-photos", 10, 600)` for
  vision) og først deretter Mistral. Manglende/ugyldig token feiler lukket i
  deployede miljøer. Intern stemmestatistikk krever ikke Turnstile.
- **Ingen varig providerpayload i Kaupet.** Bildene som sendes til Mistral
  er allerede i brukerens lokale `PendingImage`/IndexedDB-utkast før og
  etter kallet; Kaupet oppretter ingen egen analysebucket, kopi eller
  logging av bildeinnholdet. Kun det strukturerte forslagsresultatet
  (kategori-slug, feltkandidater) returneres til klienten.
- **Manuell verdi vinner alltid.** Forslag skrives kun til tomme/ikke-manuelt
  endrede felt (`suggestionState: pending | accepted | dismissed |
unavailable`); en felt-provenance på `manual` blokkerer senere
  overskriving. Avviste forslag vises ikke på nytt før `inputRevision`
  endres.
- **Feature-flag, av som standard.** Serveren krever både
  `site_settings.category_suggestion_ai_enabled !== false` og
  `MISTRAL_PHOTO_SUGGESTIONS_ENABLED === "true"` (se `.env.example` og
  `.env.staging.example`). Flagget forblir av inntil et kontrollert
  staging-smoke-kall har bekreftet at Mistral Small 4 håndterer
  vision + streng JSON Schema sammen, og inntil gjeldende Mistral
  API-avtale/DPA, EU-behandling, treningsopt-out og faktisk retensjon er
  bekreftet og korrekt beskrevet i personvernerklæringen og
  `docs/PERSONVERN-BEHANDLINGSPROTOKOLL.md`.
- **Fallback uten blokkering.** Alle provider-, timeout- (5 s), 4xx/5xx-,
  429-, parse- og valideringsfeil returnerer en typet "ikke
  tilgjengelig"-status som aldri kastes inn i kompositorflyten; `Neste`
  forblir aldri blokkert av et manglende forslag.

## 2b. Leveransestatus (per 2026-09-09)

Serversiden er landet og inaktiv; klientsiden er bevisst ikke bygget ennå.

- **Landet:** `suggestListingFromPhotos` / `suggestListingFromPhotosAi` og den
  eksplisitte tekstvarianten `suggestCategoryForTitleWithAi`, begge med
  Turnstile før rate limiter før leverandør, og begge bak
  `MISTRAL_PHOTO_SUGGESTIONS_ENABLED` / `site_settings.category_suggestion_ai_enabled`.
- **Ikke landet:** brukerhandlingen som kaller dem ("Analyser valgte bilder med
  KI" og den tilsvarende eksplisitte tekst-handlingen). Endepunktene har derfor
  ingen klientkallere i dag. Det er tilsiktet — de skal ikke få en inngang før
  DPA/retensjon er bekreftet og staging-smoke-testen i § 2 er kjørt.
- **Konsekvens i mellomtiden:** det finnes ingen automatisk KI på tittel lenger.
  Kategoriforslag mens brukeren skriver er ren intern stemmestatistikk
  (`suggestCategoryForTitle`). Det er den ønskede tilstanden, ikke en
  regresjon — se M-9 i `docs/SIKKERHETSVURDERING.md`.

Ikke slett endepunktene som "død kode" uten å lese § 4 først: de er
reverseringspunktet funksjonen er designet rundt.

## 3. Alternativer som faktisk ble vurdert

- **Ingen fotoassistanse, kun tekstbasert KI-forslag.** Beholder status quo.
  Forkastet fordi tittelen alene ofte er for tvetydig til et godt
  kategoriforslag, og brukeren allerede har lastet opp bilder som kunne gitt
  et bedre forslag uten ekstra opplasting.
- **Klient-side bildeklassifisering (on-device model) i stedet for en
  ekstern leverandør.** Ville unngått eksternt datadeling helt, men det
  finnes ingen etablert on-device-modell i stacken som dekker Kaupets brede,
  norske kategoritre med tilstrekkelig treffsikkerhet, og å bygge/trene en
  egen modell er langt utenfor denne leveransens omfang.
- **Ny/dedikert bildeanalyse-leverandør (f.eks. en ren vision-API) i stedet
  for å gjenbruke Mistral.** Forkastet: introduserer en ny leverandør, en ny
  DPA-prosess og en ny integrasjonsflate for en funksjon som allerede kan
  dekkes av den eksisterende, allerede juridisk vurderte
  Mistral-integrasjonen som støtter både vision og strukturerte svar.
  Alternativet vurderes på nytt kun hvis staging-smoke-testen viser at
  Mistral Small 4 ikke håndterer vision + `json_schema` pålitelig sammen.
- **Automatisk fotoanalyse uten eksplisitt handling** (samme mønster som
  intern tittelstatistikk). Forkastet: bilder er mer sensitivt/identifiserende
  innhold enn en tittel, og planen krever at brukeren aktivt velger å sende
  dem til en ekstern part, med synlig forklaring, fremfor at det skjer i
  bakgrunnen.

## 4. Konsekvenser og reverseringsstrategi

- **Konsekvenser:** Et nytt, eksplisitt datadelingspunkt til Mistral
  (bildeminiatyrer) legges til den eksisterende tekstbaserte KI-grensen.
  Personvernerklæringen og behandlingsprotokollen må oppdateres til å
  beskrive dette formålet, behandlingsgrunnlaget og den faktiske
  retensjonen/treningsstatusen før flagget aktiveres i noe miljø utover
  kontrollert smoke-testing. Turnstile- og rate-limit-bruken øker
  marginalt i volum (ett kall per eksplisitt brukerhandling, ikke per
  tastetrykk).
- **Reverseringsstrategi:** Funksjonen er fullstendig bak
  `MISTRAL_PHOTO_SUGGESTIONS_ENABLED`. Å sette flagget til `"false"` (eller
  la det stå på standardverdien) fjerner funksjonen umiddelbart uten
  kodeendring eller migrasjon — ingen databasekolonne, tabell eller varig
  lagret providerdata er avhengig av at flagget er på. Skulle
  staging-smoke-testen vise at Mistral Small 4 ikke støtter vision + streng
  JSON Schema pålitelig, forblir flagget av permanent og resten av
  kompositoren (intern statistikk, eksplisitt tekst-KI, manuell kategori)
  fungerer uendret.
