# Fjern klientgenererte måle-ID-er; erstatt med identifikatorløs, rate-limitert telling

## Kontekst og problem

En intern personvernrevisjon av `/personvern` avdekket at to klientgenererte,
vedvarende identifikatorer ble lagret uten samtykke:

- `kaupet_visitor_id` (`localStorage`) — knyttet anonyme annonsevisninger til
  én nettleser på tvers av besøk, for å telle unike besøk per annonse.
- `kaupet-product-session` (`sessionStorage`) — knyttet produktmålingshendelser
  (søk → publisering-trakten) sammen innenfor én fanesesjon.

Ekomloven § 3-15 (i kraft fra 1. januar 2025) krever et gyldig
GDPR-samtykke for lagring av eller tilgang til enhver opplysning på brukerens
enhet, uavhengig av teknologi og uavhengig av om innholdet er en
personopplysning. Unntaket gjelder kun lagring som er strengt nødvendig for en
funksjon brukeren eksplisitt har bedt om — verken besøkstelling eller
produktanalyse kvalifiserer.

## Valgt løsning

1. **Annonsevisninger**: fjernet den klientgenererte `kaupet_visitor_id`.
   Telling skjer nå utelukkende server-side via en ny RPC
   (`log_listing_view_rate_limited`) som bruker en SHA-256-hash av
   forespørsels-IP-en (samme mønster som allerede brukt for
   produktmåling/søkelogging) til å begrense telling til én per nettverk per
   annonse per 30 minutter. Selgeren ser fortsatt et visningstall
   (`listing_view_totals`), men «unike besøk» (som krevde en vedvarende
   besøkende-ID) er fjernet fra UI — se `owner-stats-panel.tsx`.
2. **Produktmåling**: fjernet `session_id` fra `product_events` og fra
   klienten (`kaupet-product-session`). Hendelser telles nå som uavhengige,
   identifikatorløse rader.
3. **Ukentlig trakt-script** (`scripts/weekly-funnel.ts`): bygget om fra
   sesjonsbasert konverteringsrate (distinkte sesjoner som gjorde X _og_ Y)
   til rene hendelsestellinger og hendelsesratioer (antall X delt på antall
   Y). `schemaVersion` økt til 2, og en ny `limitations`-verdi
   (`session_correlation_removed`) dokumenterer forskjellen i output.
4. **Rå søkefraser**: fjernet i samme runde (se § "Alternativer" — vurdert
   sammen siden begge var databehandlinger uten samtykke). `search_query_stats`,
   `log_search_query_rate_limited` og admin-siden `/admin/sok` (bygget
   utelukkende på denne tabellen) er fjernet.

## Alternativer vurdert

- **Behold ID-en, men bak et samtykkebanner.** Forkastet: brukervendt
  personvernløfte i dag er «ingen tredjepartssporing, derfor ingen
  cookie-banner» — å innføre et banner for førsteparts telemetri alene bryter
  med produktprofilen og øker friksjon for en gevinst (sesjonskorrelasjon) som
  ikke er kritisk for virksomheten.
- **Generer sesjons-ID kun server-side, aldri i klienten.** Forkastet:
  korrelasjon på tvers av separate HTTP-forespørsler krever uansett at _noe_
  rundtrips gjennom klienten (cookie, header, med mer) — ekomloven er
  teknologinøytral og dekker enhver slik mekanisme likt.

## Konsekvenser

- Selgere mister «unike besøk»-tallet; kun totalt visningstall gjenstår.
- Produktanalyse (`scripts/weekly-funnel.ts`) rapporterer nå
  hendelsesvolum/-ratioer, ikke distinkte brukerkonverteringer. En bruker som
  gjentar en handling telles flere ganger.
- Admin-siden for nulltreff-søk (`/admin/sok`) er fjernet i sin helhet, siden
  den utelukkende viste lagrede rå søkefraser.
- Ingen reverseringssti er lagt inn — å gjeninnføre sesjonskorrelasjon krever
  enten et reelt samtykke-flow eller et nytt produktbeslutning om å akseptere
  den friksjonen.

## Reverseringsstrategi

Reversering krever en ny migrasjon som gjeninnfører `session_id`-kolonnen på
`product_events` og en tilhørende samtykkemekanisme i klienten før den tas i
bruk igjen. Ikke gjør dette uten en oppdatert personvernerklæring og en
faktisk samtykkeflate.
