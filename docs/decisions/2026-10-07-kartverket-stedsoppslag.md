# Stedsoppslag via Kartverket

## Problem

Direkte Nominatim-kall fra klienten og serveren deler verken cache eller
trafikkgrense. Offentlig Nominatim tillater høyst ett kall per sekund samlet
per applikasjon. En lokal debounce eller grense per bruker løser ikke dette.

## Valgt løsning

Erstatt Nominatim helt med Kartverkets åpne API på `api.kartverket.no`:

- `stedsnavn/v1/navn` for eksplisitt navnesøk. Aktive hovednavn med godkjent
  prioritert eller vedtatt skrivemåte vises med kommune/fylke. Eksakt navn
  prioriteres, deretter by/tettsted/bygd. Kartkoordinater er EPSG:4258.
- `adresser/v1/sok` for postnummer og gateadresse.
- `adresser/v1/punktsok` for poststed/postnummer nær et kartpunkt, innen 1 km.

`geocode.functions.ts` validerer klientinput og deler eksisterende database-
baserte IP-grense (60 kall per minutt). POST hindrer at adresse-/GPS-input
havner i serverfunksjonens GET-URL. `geocode.server.ts` eier eksterne kall,
responsvalidering og fem sekunders timeout. Interne serverkonsumenter bruker
servermodulen direkte; de beholder sine eksisterende inngangsgrenser.
Cloudflare-fetch ber om ett døgns regional edge-cache for HTTP 200 og ingen
cache for HTTP-feil. Det kreves ingen ny binding eller migrasjon. Dette er
ikke en global kvote, global cache eller garanti mot samtidige cache-miss.
Lokal utvikling har ikke denne cachen.

Søke-UI skiller tjenestefeil fra tomme treff og ignorerer utdaterte svar.
Publisering og organisasjonsoppdatering beholder best-effort-oppslag.
Kartfliser lastes fortsatt direkte fra Kartverket og attribueres på kartet.
Stedssøket oppgir Kartverket som kilde.

## Vurderte alternativer

- Nominatim-proxy med global kø: oppfyller grensen, men beholder en flaskehals
  på ett kall per sekund og avhengigheten av offentlig Nominatim.
- Kommersiell Nominatim: mindre endring av svarformat, men ny betalt tjeneste.
- Lokal postnummer-/stedsdatabase: færre eksterne kall, men krever import,
  oppdatering og representasjonspunkter. Ikke nødvendig for leverandørbyttet.

## Konsekvenser og reversering

Postnummerkoordinater er et adressepunkt i området, ikke et områdesenter.
Postboksnumre uten adressetreff kan ikke geokodes. Nærmeste adresse gir et
forslag til poststed/postnummer, ikke bevis på hvilket postområde et punkt
ligger i. Uten treff må stedet oppgis manuelt; koordinater beholdes.
Stedsnavnregisteret er ikke et generelt POI-/gateadressesøk, så eksisterende
stedssøk får en mer avgrenset søkesemantikk.

Kartverkets tjeneste gir ikke en avtalt kapasitets-/oppetidsgaranti. Ved behov
for en slik garanti kan servermodulen byttes uten endring av klientkontrakten.
Ingen automatisk fallback til offentlig Nominatim. Endringen kan reverseres
med kode, men offentlig Nominatim må ikke gjeninnføres uten en løsning som
oppfyller tjenestens vilkår.

## Kilder

- https://api.kartverket.no/stedsnavn/v1/
- https://api.kartverket.no/adresser/v1/openapi.json
- https://kartverket.no/api-og-data/vilkar-for-bruk/
- https://operations.osmfoundation.org/policies/nominatim/
- https://developers.cloudflare.com/workers/examples/cache-using-fetch/
