# Fakturering av Proff med Fiken som fakturamotor og manuell fase 0

## Kontekst og problem

Proff er Kaupets betalte bedriftsplan til 1 490 kr per måned eks. mva. I dag
gir `setBusinessPlan` én ikke-fornybar prøveperiode på 30 dager, og etter
utløp finnes det ingen vei videre: knappen er deaktivert med teksten
«Prøveperioden er brukt». Uten en faktureringsløsning kan tjenesten ikke
selges.

Kaupet fører regnskap i Fiken. Fikens API v2 dekker hele behovet — `contacts`,
`invoices`, `invoices/send` med `ehf`/`efaktura`/`email`, `recurringInvoices`
med frekvens og jobber som kan pauses og stoppes, `creditNotes`, samt
`GET /invoices?settled=` og `sales/{id}/payments` for betalingsstatus. API-et
har ingen webhooks, tillater bare én samtidig forespørsel, og API-modulen
koster 99 kr per måned. Automatisk purring og inkasso finnes i Fiken selv, men
krever KID/OCR-avtale med bank (69 kr per måned pluss bankens avgifter) og
avtale med Kravia (ingen faste avgifter; Kravia beholder gebyrer og renter).

Bedriftskunder på dette prisnivået forventer faktura på organisasjonsnummeret,
med EHF som foretrukket kanal — ikke kortbetaling knyttet til en privatperson.

## Valgt løsning

- **Fiken er fakturamotoren.** Kaupet utsteder ikke fakturaer selv og bygger
  ingen egen purre- eller inkassologikk. Fiken oppretter, sender og følger opp;
  Kaupet leser resultatet og forlenger tilgang.
- **`organizations.proff_access_until` forblir den autoritative
  tilgangsgrensen.** Betaling er utelukkende en operasjon som skyver denne
  timestampen fremover. `sync_organization_entitlements` kjøres etter hver
  endring, som i dag. Ingen ny tilgangsmekanisme innføres.
- **Kunden velger periode.** Månedlig 1 490 kr eks. mva, eller årlig
  16 092 kr eks. mva — 12 måneder minus 10 % (1 341 kr per måned). Årlig
  faktureres forskuddsvis og reduserer antall fakturaer og purringer med en
  faktor på tolv. Årsprisen hardkodes som ett tall i `PROFF_TERMS` fremfor å
  regnes ut i runtime, slik at en fremtidig prisendring ikke gir brøkkroner.
- **Alle priser oppgis eks. mva** i kundevendt UI, i tråd med B2B-konvensjon.
  Merverdiavgift på 25 % legges på av Fiken ved fakturering.
- **Fase 0 er manuell.** Bedriften bestiller Proff i appen, bestillingen lagres
  i `proff_orders` og varsles på e-post. En administrator oppretter kunde og
  faktura i Fiken manuelt og registrerer betaling i Kaupets admin, som
  forlenger `proff_access_until`. Ingen Fiken-API-kode skrives i denne fasen.
- **`proff_orders` er en egen tabell, ikke nye kolonner på `organizations`.**
  `organizations` har `organizations_public_select` med `USING (true)`, så anon
  kan lese hver kolonne i den tabellen. Bestillings-, faktura- og
  kontaktopplysninger er ikke offentlige og eksponeres kun gjennom
  serverfunksjoner, med `GRANT` kun til `service_role`.
- **Prisen settes på serveren** fra `PROFF_TERMS` ved bestilling, aldri fra
  klienten. Forlengelsen beregnes i én `UPDATE` med
  `greatest(now(), proff_access_until) + make_interval(months => …)` slik at to
  raske admin-klikk ikke kan gi dobbel periode, og en betalt ordre kan ikke
  registreres betalt to ganger.
- **KID/OCR aktiveres først i fase 1, ikke nå.** Fakturaer kan sendes uten KID;
  KID gir automatisk matching av innbetaling mot faktura. I fase 0 registrerer
  en administrator uansett betalingen for hånd, så tilleggstjenesten ville ikke
  spart arbeid. Ved fase 1 blir den derimot nødvendig: cron-jobben leser
  `settled`, som bare blir sant når betalingen faktisk er registrert i Fiken.
- **Fase 1 automatiserer bare avlesning.** En daglig cron leser
  `GET /invoices?settled=true`, matcher `orderReference` mot organisasjonen og
  forlenger tilgangen. Fiken beholder ansvaret for utstedelse, utsendelse og
  purring. Fase 2 oppretter kontakt og repeterende faktura fra appen ved
  bestilling.

## Alternativer vurdert

- **Stripe Billing.** Forkastet for lansering: transaksjonsgebyr på rundt
  2,4 % utgjør mer per faktura enn hele Fikens API-modul koster per måned, og
  bokføringen ville kreve en egen synkronisering til Fiken i tillegg.
  Vurderes på nytt hvis Kaupet får kunder utenfor Norge eller trenger
  kortbetaling med aktivering i samme sekund som kjøpet.
- **Vipps Recurring.** Forkastet selv om Vipps ePayment allerede er integrert
  for promotering av annonser: avtalen belastes en privatperson, ikke
  organisasjonsnummeret, og gir ikke bedriftskunden den fakturaen regnskapet
  deres trenger.
- **Egen fakturagenerering i Kaupet.** Forkastet: fakturanummerserie,
  bokføringsplikt, EHF-utsending, purring og inkasso er løst produkt hos Fiken,
  og ville her blitt bygget på nytt uten tilsvarende garantier.
- **Bygge Fiken-API-integrasjonen med én gang.** Forkastet som første steg:
  med de første kundene er manuell fakturering i Fiken raskere enn
  integrasjonen ville vært å skrive, og fase 0 avdekker hvilke felter og
  kanttilfeller integrasjonen faktisk må dekke.
- **Kun månedlig fakturering.** Forkastet: månedlig fakturering av 1 490 kr er
  den dyreste varianten å administrere, og et årsabonnement med rabatt flytter
  både kontantstrøm og administrasjonsbyrde i riktig retning.

## Konsekvenser

- Prøveperioden er ikke lenger en blindvei. `setBusinessPlan` beholder regelen
  om én prøveperiode, men utløpt prøveperiode leder nå til bestilling i stedet
  for en deaktivert knapp.
- Fase 0 gir manuelt arbeid per kunde og per faktureringsperiode. Terskelen for
  å bygge fase 1 er når den manuelle jobben overstiger omtrent en halvtime i
  måneden.
- Betaling bekreftes med forsinkelse også i fase 1, siden Fiken registrerer
  betaling ved bankavstemming og API-et ikke har webhooks. Tilgangen bør derfor
  ha noen dagers slingringsmonn ved fornyelse.
- Fakturaene fra fase 0 får aldri automatisk purring, siden den funksjonen kun
  gjelder fakturaer opprettet etter at KID og Kravia er aktivert. Purring sendes
  i stedet manuelt per faktura i Fiken, og en forfalt faktura kan settes bort
  til Kravia 14 dager etter forfall uavhengig av dette. Med få kunder er det
  noen få klikk i året.
- En ny ekstern avhengighet til Fiken oppstår først i fase 1. I fase 0 er
  Fiken-koblingen ren manuell prosess, og et fakturanummer lagret som tekst.
  Fase 0 påfører derfor ingen nye faste kostnader: verken API-modulen (99 kr per
  måned) eller KID/OCR bestilles før de faktisk brukes.
- `src/routes/vilkar.tsx` må beskrive pris eks. mva, forskuddsvis fakturering,
  fravær av bindingstid og at oppsigelse løper ut betalt periode uten refusjon.

## Rollback

Fase 0 kan rulles tilbake ved å droppe `proff_orders` og fjerne
bestillingsflyten; `organizations` og entitlement-kontrakten er urørt, så
eksisterende Proff-tilganger overlever uendret. Er det allerede fakturert, må
tabellen eksporteres før den slettes, siden den da er eneste kobling mellom
Kaupet-organisasjonen og fakturanummeret i Fiken. Fiken-avtalen sies opp uavhengig av
koden, og i fase 0 er ingen betalte tilleggstjenester tatt i bruk å si opp.
