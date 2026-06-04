## Mål

Få filene som ble opprettet i Lovable før GitHub-koblingen ble aktiv, over på `Kaupet-no/kaupet` ved å gjøre en bevisst, ufarlig endring i hver fil. Da plukker Lovables auto-push dem opp som nye commits.

## Forutsetning (sjekkes først)

GitHub-koblingen må faktisk være aktiv akkurat nå:
- Lovable: **+ → GitHub** viser `Kaupet-no/kaupet` som **Connected**.
- GitHub: `github.com/organizations/Kaupet-no/settings/installations` → **Lovable** har tilgang til `kaupet`.

Hvis ikke → fiks koblingen først, ellers er resten bortkastet.

## Steg

1. **Verifiseringscommit (1 fil)**
   - Endre én linje i `README.md` (f.eks. legg til en tom linje nederst).
   - Vent ~30 sek og sjekk `github.com/Kaupet-no/kaupet/commits/main` for en ny Lovable-commit.
   - Hvis ja → fortsett. Hvis nei → stopp, vi feilsøker koblingen i stedet.

2. **Tving sync av alle ventende filer**
   Gjør en minimal whitespace-/kommentarendring i hver fil slik at Lovable registrerer dem som modifisert og pusher:
   - `README.md`
   - `CONTRIBUTING.md`
   - `CODE_OF_CONDUCT.md`
   - `SECURITY.md`
   - `.github/PULL_REQUEST_TEMPLATE.md`
   - `.github/ISSUE_TEMPLATE/bug_report.md`
   - `.github/ISSUE_TEMPLATE/feature_request.md`
   - `.github/ISSUE_TEMPLATE/config.yml`
   - `.github/dependabot.yml`
   - `.github/workflows/ci.yml`

3. **Verifisering**
   - Åpne `github.com/Kaupet-no/kaupet` og bekreft at alle filene over finnes på `main` med riktig innhold.
   - Bekreft at `README.md` på GitHub viser den fulle versjonen (ikke den nesten tomme).

## Teknisk merknad

Lovable pusher kun filer som faktisk endres i en gitt redigering. Filer som ble opprettet før GitHub-koblingen ble etablert blir ikke automatisk "etterpushet" — derfor trenger hver fil en ny endring for å komme med.

## Ikke i scope

- Ingen endringer i appens kode (`src/`), avhengigheter eller backend.
- Ingen omskriving av README-innhold — kun re-push av det som allerede er skrevet.
