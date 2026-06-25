# Bidra til Kaupet.no

Tusen takk for at du vurderer å bidra! Kaupet.no er et fellesskapsdrevet prosjekt, og hvert bidrag, fra rettelse av skrivefeil til nye funksjoner, gjør tjenesten bedre for alle.

## Slik foreslår du en endring

1. **Fork** repoet til din egen GitHub-konto.
2. **Lag en branch** med et beskrivende navn: `git checkout -b fiks/manglende-knapp` eller `feat/favoritter-sortering`.
3. **Gjør endringene** — hold dem fokuserte og atomiske.
4. **Kjør sjekkene lokalt** før du pusher:
   ```bash
   bun run lint
   bunx tsc --noEmit
   bun run build
   ```
5. **Åpne en pull request** mot `main`. Beskriv hva du har endret og hvorfor. Skjermbilder er gull for UI-endringer.

En moderator vil se på PR-en så snart som mulig. CI må være grønn og minst én moderator må godkjenne før merge.

## Rapportere bugs og foreslå funksjoner

- **Bug?** Åpne en [bug-issue](https://github.com/Kaupet-no/kaupet/issues/new?template=bug_report.md) med stegene for å reprodusere.
- **Idé?** Åpne en [feature-issue](https://github.com/Kaupet-no/kaupet/issues/new?template=feature_request.md) eller start en [Discussion](https://github.com/Kaupet-no/kaupet/discussions).
- **Sårbarhet?** Se [SECURITY.md](SECURITY.md) — ikke i offentlige issues.

## Kodestil

- **Formatering:** Prettier (`bun run format` hvis tilgjengelig, ellers kjøres det automatisk i editor).
- **Linting:** ESLint — `bun run lint`.
- **TypeScript:** strict mode er på. Ingen `any` uten god grunn.
- **Komponenter:** funksjonelle, små, og bruk semantiske design-tokens fra `src/styles.css` (ikke hardkodede farger).
- **Språk i UI:** norsk bokmål.
- **Språk i kode/kommentarer:** engelsk er greit, norsk er også greit — vær konsistent innenfor en fil.

## Commit-meldinger

Vi følger en lett variant av [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: legg til sortering på favoritter
fix: rett feil i kartvisning på mobil
docs: oppdater README med Bun-versjon
chore: oppgrader Tailwind til 4.1
```

## Overordnet arkitektur

- `src/routes/` — sider (file-based routing via TanStack Start)
- `src/components/` — gjenbrukbare UI-komponenter
- `src/lib/` — hjelpere, server-funksjoner (`*.functions.ts`)
- `src/integrations/supabase/` — auto-generert, ikke rør
- `supabase/migrations/` — database-skjema som SQL-migrasjoner

Server-side logikk skrives som TanStack `createServerFn`, ikke som Supabase Edge Functions.

## Lisensiering og rettigheter for bidrag

Alle bidragsytere må signere vår **Contributor License Agreement (CLA)** før en pull request kan merges. CLA-en gir Happy Pixel AS rettigheter til å bruke og distribuere bidraget ditt.

Når du åpner en PR for første gang, vil en GitHub-bot be deg om å signere ved å skrive en kommentar i PR-en. Det tar bare noen sekunder.

Les CLA-en her: [CLA.md](CLA.md)

Takk! Sammen bygger vi Norges beste markedsplass for brukte ting! ❤️
