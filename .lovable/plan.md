## Mål

La interesserte kjøpere kontakte selgere via meldinger, og gi alle brukere en samlet innboks der chatter er gruppert per annonse.

Databasen har allerede `conversations` (buyer_id, seller_id, listing_id) og `messages` (conversation_id, sender_id, body) med RLS — vi bygger UI og litt server-logikk oppå dette.

## 1. Kontakt-knapp på annonsevisning

På `/annonse/$id`, under pristen ved siden av "Lagre favoritt", legge til en **"Send melding til selger"**-knapp.
- Skjult hvis bruker er selger eller annonsen ikke er aktiv.
- Hvis ikke innlogget → redirect til `/auth` med `redirect` tilbake til annonsen.
- Ved klikk: kall serverfunksjon `getOrCreateConversation({ listingId })` som finner eller oppretter en samtale mellom innlogget bruker (buyer) og selger, og naviger til `/meldinger/$conversationId`.

## 2. Innboks `/meldinger` (gruppert per annonse)

Ny rute `src/routes/_authenticated/meldinger.index.tsx`.

Layout: to-kolonne på desktop, stacked på mobil.
- **Venstre panel:** liste over annonser brukeren har samtaler knyttet til (både som selger og kjøper), sortert på siste aktivitet.
  - Hvert annonse-element viser miniatyrbilde, tittel, antall samtaler, og siste meldings-tidsstempel.
  - Klikk utvider og viser alle samtaler under den annonsen (motpartens navn + siste meldingsutdrag).
  - Som selger med flere annonser får man et naturlig oppslagsverk: "Sykkel (3 samtaler)", "Sofa (1 samtale)" osv.
- **Tom-tilstand:** vennlig melding + lenke til Utforsk.

## 3. Samtalevisning `/meldinger/$id`

Ny rute `src/routes/_authenticated/meldinger.$id.tsx`.

- Header: annonsens miniatyrbilde + tittel + pris, lenke til annonsen, samt motpartens navn.
- Meldingsliste i kronologisk rekkefølge, bobler høyrejustert for egne meldinger og venstrejustert for motpart. Dagsskiller.
- Skrivefelt nederst (textarea + Send-knapp, Enter = send, Shift+Enter = ny linje).
- Realtime via Supabase channel på `messages` filtrert på `conversation_id` — nye meldinger dukker opp uten refresh. Også oppdater `conversations.last_message_at` på send.
- Auto-scroll til bunnen ved nye meldinger.

## 4. Header-ikon

`site-header.tsx`: Meldinger-ikonet er i dag `disabled`. Gjør det til en `<Link to="/meldinger">` og vis en liten badge med antall samtaler med uleste meldinger (enkel implementasjon: samtaler med `last_message_at` nyere enn en lokalt lagret "sist sett"-tid per samtale, lagret i `localStorage`. Dette unngår skjemaendringer i første runde).

## 5. Serverfunksjoner (`createServerFn` + `requireSupabaseAuth`)

Ny fil `src/lib/messages.functions.ts`:
- `getOrCreateConversation({ listingId })` — slår opp eksisterende (buyer = auth.uid, listing_id), oppretter ellers. Avviser hvis bruker = selger.
- `listMyConversations()` — returnerer alle samtaler der bruker er buyer eller seller, joinet med listing (id, title, første bilde, pris) og motpartens profil (display_name, avatar_url) og siste melding (body, created_at). Gruppering gjøres i UI.
- `getConversation({ id })` — sjekker tilgang, returnerer samtale + listing-header + motpart.
- `listMessages({ conversationId })` — meldinger i samtalen.
- `sendMessage({ conversationId, body })` — validerer (1–4000 tegn), inserter melding, oppdaterer `last_message_at`.

RLS dekker allerede tilgangskontroll; server-funksjonene gir oss typete DTO-er og join-effektivitet.

## 6. Realtime

Aktivere `messages`-tabellen for Supabase Realtime i en ny migrasjon:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
```

Klient abonnerer kun på samtalevisningen.

## 7. Filer som opprettes/endres

**Nye:**
- `src/lib/messages.functions.ts`
- `src/routes/_authenticated/meldinger.index.tsx`
- `src/routes/_authenticated/meldinger.$id.tsx`
- `supabase/migrations/<timestamp>_messages_realtime.sql`

**Endres:**
- `src/routes/annonse.$id.tsx` — kontakt-knapp.
- `src/components/site-header.tsx` — gjør meldinger-ikon klikkbart (+ enkel uleste-indikator).

## 8. Utenfor scope (kan komme senere)

- Server-side ulest-tracking (krever ny `last_read_at`-kolonne på conversations per deltaker — kan legges til når brukerne ønsker mer presis ulest-telling).
- Push-varsler / e-postvarsler.
- Vedlegg / bilder i meldinger.
- Blokkering og rapportering av samtaler.
