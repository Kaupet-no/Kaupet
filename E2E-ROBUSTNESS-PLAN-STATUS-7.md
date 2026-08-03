# E2E-robusthetsplan, runde 7 — status

Dedikert oppfølgingsøkt for å lukke de to gjenstående forekomstene av
Realtime-resubscribe-bugen som runde 6 identifiserte, men ikke rakk å fikse
selv (se "Anbefalte neste steg" i `E2E-ROBUSTNESS-PLAN-STATUS-6.md`).

**Utfall: begge fikset.**

## 1 — `src/hooks/use-unread.ts:56-67`

Samme mønster som allerede fikset i `messages-button.tsx` og
`notifications-bell.tsx`: realtime-effekten depended på hele `user`-objektet
i stedet for `user?.id`. `AuthProvider` gir `user` en ny objektreferanse ved
hver auth-hendelse (f.eks. `TOKEN_REFRESHED`), selv om den innloggede
brukeren ikke faktisk endres — effekten rev derfor ned og satte opp igjen
`unread:${user.id}`-kanalen unødvendig gjennom hele brukerøkten.

**Fiks:** ekstraherte `const userId = user?.id;` før effekten, byttet
kanalnavn og guard-sjekk til å bruke `userId`, og la `userId` i
avhengighetslisten i stedet for `user`.

## 2 — `src/routes/_authenticated/meldinger.$id.tsx:180-231`

Samme underliggende mønster, men mer alvorlig slik runde 6 påpekte:
avhengighetslisten var `[id, queryClient, conv, user]`, skjult bak
`eslint-disable-next-line react-hooks/exhaustive-deps`. `conv` er selve
React Query-resultatet for samtalen, som denne kanalens EGEN
UPDATE-handler skriver til via `queryClient.setQueryData(["conversation",
id], ...)` — en potensiell selvforsterkende løkke: melding kommer inn →
`conv` oppdateres → effekten kjører på nytt (fordi `conv` var i deps) →
kanalen rives ned og settes opp igjen → mulig tap av meldinger i det korte
vinduet kanalen er nede, midt i en aktiv chat.

**Fiks:** ekstraherte `const userId = user?.id;` på komponentnivå (brukes
også av det andre effekt-kallet lenger nede som fortsatt legitimt trenger
`conv`/`user` — ikke rørt), og endret realtime-effektens
avhengighetsliste til `[id, queryClient, userId]`. `conv` er fjernet helt
fra listen — effekten leser og skriver `conv`-cachen direkte via
`queryClient.setQueryData`/`getQueryData`-mønsteret, og trenger ingen fersk
`conv` i closure.

`eslint-disable-next-line`-kommentaren er beholdt: `markReadMutation`
brukes fortsatt inne i effekten (linje 199) uten å stå i
avhengighetslisten, så suppresjonen er fortsatt reell og nødvendig — ikke
en rest fra den gamle bugen.

## Verifisert

- `bunx tsc --noEmit` — grønt, ingen feil.
- `bun run lint` — 0 feil (132 preeksisterende advarsler i urelaterte
  filer, uendret av denne endringen).
- `bun run test` — 184/184 enhetstester grønt.
- `set -a && source .env && set +a && bunx playwright test
publish-listing.spec.ts publish-vehicle-listing.spec.ts` — begge grønt
  (2/2), ingen nye konsoll-/`pageerror`-varsler utover den kjente,
  allerede forklarte "hasn't mounted yet"-advarselen fra runde 6 punkt 2
  (urelatert til denne endringen — den gjenstår som forklart, ikke
  reintrodusert).

## Nye funn / lærdommer

Ingen nye funn denne runden — dette var en ren mopping-opp av et allerede
identifisert og godt forstått mønster fra runde 6. Verdt å merke seg for
neste gang noen legger til et nytt `supabase.channel(...)`-kall: grep etter
`supabase.channel(` og sjekk avhengighetslisten på den omsluttende effekten
er nå en rutinesjekk med fire kjente historiske treff (`auth.tsx`,
`messages-button.tsx`, `notifications-bell.tsx`, og nå `use-unread.ts` +
`meldinger.$id.tsx`) — alle fem er nå konsistente på `user?.id`-mønsteret.
Ingen flere `supabase.channel(...)`-forekomster gjenstår å sjekke i
kodebasen.
