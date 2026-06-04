
# Kaupet.no – åpen kildekode markedsplass for Norge

En norsk markedsplass for brukte ting mellom privatpersoner, bygget åpent på GitHub fra dag 1 slik at frivillige kan bidra.

## Strategi: hvorfor denne tilnærmingen

For å lykkes med en åpen kildekode-konkurrent til Finn.no torget anbefaler jeg tre prinsipper:

1. **Start smalt, men polert.** Én vertikal (brukte ting privat-til-privat), én by/region som pilot. Bredde kommer etter at kjernen virker.
2. **Bygg åpent fra dag 1.** Offentlig repo, MIT-lisens (mest tillatelig, gir bredest bidragervilje), klare CONTRIBUTING.md og "good first issue"-tagger.
3. **Plattformnøytral kjerne.** Koden bygges som en standard webapp (TanStack Start + Postgres) slik at andre kan self-hoste eller forke for sitt land/marked.

## MVP-omfang (versjon 0.1)

- **Annonser:** opprett, rediger, slett, publiser/avpubliser. Tittel, beskrivelse, pris, tilstand, kategori, opptil 8 bilder.
- **Søk og filter:** fritekstsøk, kategori, prisintervall, lokasjon (postnummer + radius), tilstand, sortering.
- **Bruker + autentisering:** e-post/passord + Google-innlogging. Profil med visningsnavn, avatar, "medlem siden".
- **Meldinger:** innboks per annonse mellom kjøper og selger, sanntidsoppdatering.
- **Bilder + lokasjon:** opplasting til Cloud Storage, automatisk komprimering. Norske postnumre + enkelt kart (OpenStreetMap/Leaflet, ingen Mapbox-lisens).
- **Norsk førstemarked:** UI på norsk (bokmål), NOK, norske postnummer-data, GDPR-vennlig.

Eksplisitt UTENFOR MVP: betaling/Vipps, anmeldelser, "fraktes med", verifisert ID, admin-panel, bil/bolig/jobb-vertikaler.

## Tekniske valg

```text
Frontend/Backend:  TanStack Start (React 19 + SSR)
Database:          Postgres via Lovable Cloud (Supabase under panseret)
Auth:              Supabase Auth (e-post + Google via Lovable broker)
Storage:           Supabase Storage for bilder
Sanntid (chat):    Supabase Realtime
Søk:               Postgres full-text search (tsvector) for MVP;
                   senere Meilisearch hvis behov
Kart:              Leaflet + OpenStreetMap (gratis, ingen lock-in)
Postnummer:        Bringkode-datasett (offentlig, åpen lisens)
Styling:           Tailwind v4 + semantiske design-tokens
Lisens:            MIT
Hosting:           Lovable for utvikling; self-host-guide for produksjon
```

## Datamodell

```text
profiles        (id, display_name, avatar_url, location, created_at)
listings        (id, seller_id, title, description, price_nok,
                 category_id, condition, postal_code, lat, lng,
                 status, search_vector, created_at)
listing_images  (id, listing_id, storage_path, sort_order)
categories      (id, slug, name_nb, parent_id)
conversations   (id, listing_id, buyer_id, seller_id, last_message_at)
messages        (id, conversation_id, sender_id, body, created_at)
favorites       (user_id, listing_id, created_at)
reports         (id, listing_id, reporter_id, reason, status)
```

RLS på alt: brukere ser kun egne meldinger, egne favoritter, egne kladder. Publiserte annonser er offentlig lesbare.

## Repo-oppsett for bidragsytere

Når MVP er på plass legger vi til i repo-roten:

- `README.md` – hva, hvorfor, demo-link, quickstart
- `CONTRIBUTING.md` – hvordan sette opp lokalt, hvordan sende PR
- `CODE_OF_CONDUCT.md` – Contributor Covenant
- `LICENSE` – MIT
- `.github/ISSUE_TEMPLATE/` – bug, feature, "good first issue"
- `.github/PULL_REQUEST_TEMPLATE.md`
- `docs/architecture.md` – oversikt for nye bidragsytere

GitHub-features: Discussions for forslag, Projects for roadmap, labels `good first issue` / `help wanted`.

## Leveranseplan

```text
Fase 1 – Fundament
  - Slå på Lovable Cloud
  - Database-skjema + RLS
  - Auth (e-post + Google)
  - Landingsside + grunnleggende layout på norsk

Fase 2 – Kjerneflyt
  - Opprett/rediger annonse + bildeopplasting
  - Annonseliste + detaljside
  - Søk + filter + kategorier

Fase 3 – Sosial lag
  - Meldinger sanntid
  - Favoritter
  - Brukerprofil + andres annonser

Fase 4 – Klart for open source
  - README/CONTRIBUTING/lisens
  - "Good first issues"
  - Publiser + annonser i norske dev-miljøer
```

Denne planen leverer **Fase 1** når du godkjenner.

## Spørsmål før vi starter

Ønsker du at jeg genererer **3 visuelle designretninger** først, slik at du kan velge look-and-feel for Kaupet.no, eller skal jeg starte med Fase 1-funksjonalitet og bruke et rent, funksjonelt design med norsk fargepalett?
