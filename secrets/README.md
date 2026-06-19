# Secrets (SOPS + age)

Hemmelighetene i denne mappen er kryptert med [SOPS](https://github.com/mozilla/sops)
mot [age](https://github.com/FiloSottile/age)-nøkler, og kan trygt committes til Git.

- `dev.env` — lokale utviklingshemmeligheter
- `staging.env` — hemmeligheter for staging-miljøet

## Førstegangsoppsett (ny maskin / ny utvikler)

1. Installer verktøyene:
   - Windows: `winget install Mozilla.SOPS FiloSottile.age`
   - macOS: `brew install sops age`
   - Linux: se nedlastingssider for [sops](https://github.com/mozilla/sops/releases) og [age](https://github.com/FiloSottile/age/releases)

2. Generer din egen age-nøkkel (kun én gang per maskin):
   - Windows: `age-keygen -o "$env:APPDATA\sops\age\keys.txt"`
   - macOS/Linux: `age-keygen -o ~/.config/sops/age/keys.txt`

3. Send den offentlige nøkkelen (linjen `Public key: age1...`) til noen
   som allerede har tilgang. De legger den til i [`.sops.yaml`](../.sops.yaml)
   og kjører `bun run secrets:rekey`, committer og pusher.

4. Hent hemmelighetene til lokale, gitignorede filer:
   ```
   bun run secrets:decrypt          # -> .env
   bun run secrets:decrypt:staging  # -> .env.staging.local
   ```

## Vanlig bruk

- Redigere dev-hemmeligheter: `bun run secrets:edit` (åpner dekryptert i
  `$EDITOR`, krypterer automatisk ved lagring)
- Redigere staging-hemmeligheter: `bun run secrets:edit:staging`
- Etter at noen er lagt til/fjernet i `.sops.yaml`: `bun run secrets:rekey`

## Viktig

- Den private nøkkelen (`keys.txt`) skal **aldri** committes eller deles
  utenfor en sikker kanal (f.eks. ende-til-ende-kryptert melding).
- Mist du nøkkelen, må noen med tilgang re-kryptere filene mot en ny nøkkel
  du genererer.
- Skal noens tilgang fjernes (f.eks. ved avslutning): fjern personens
  offentlige nøkkel fra `.sops.yaml` og kjør `secrets:rekey` — vedkommende
  kan da ikke lenger dekryptere fremtidige endringer (historiske commits i
  Git vil fortsatt inneholde data kryptert mot deres gamle nøkkel, så bytt
  også ut de faktiske hemmelighetene ved behov).
