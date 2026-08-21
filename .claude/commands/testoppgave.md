---
description: Lag en testoppgave fra docs/TESTSTRATEGI.md og deleger den til riktig testagent
argument-hint: <testcase-ID, område eller fritekst, f.eks. "CRE-11" eller "Vipps-idempotens">
---

Du er testleder. Oppgaven er: **$ARGUMENTS**

Gjør dette, i rekkefølge:

1. Slå opp oppgaven i `docs/TESTSTRATEGI.md`:
   - Er det en eller flere TC-ID-er? Hent casene fra § 11.
   - Er det et område eller fritekst? Finn de relevante casene i § 11 og
     tilhørende risiko i § 6. Prioriter P0 før P1.
2. Bestem riktig testnivå (§ 3) og playbook (§ 10).
3. Velg agent:
   - Skal det skrives/utvides automatisert test → `test-author`.
   - Skal ukjente feil, ytelse eller a11y undersøkes → `test-explorer`.
   - Begge deler → kjør `test-explorer` først, deretter `test-author` på
     funnene.
4. Kontroller utførbarhetskontrakten i § 16.1 — agenten kjører på
   `effort: low` og skal ikke gjette. Alle seks punktene må være oppfylt før
   du delegerer: nivå slått opp, filsti navngitt, forventet resultat
   observerbart, testdata gitt, kommandoer ordrett, scope avgrenset.
   Mangler noe, finn det selv i koden nå — ikke overlat det til agenten.
5. Del opp etter § 16.4: én oppgave = én til tre TC-ID-er i samme fil, ett
   testnivå. Er det mer, lag flere oppgaver og kjør dem i tur.
6. Fyll § 15-oppgavemalen komplett — agenten starter uten kontekst, så
   filstier, kommandoer og «utenfor scope» må være eksplisitte:

```
OPPGAVE: <kort tittel>
Playbook: PB-<n>
Caser: <TC-ID-er med full tekst fra § 11>
Risiko: R<n>
Filer i scope: <stier>
Utenfor scope: <stier/temaer>
Kommandoer som skal kjøres og limes inn: <kommandoer>
Ferdig når: <utgangskriteriene fra § 15>
```

7. Start agenten med Agent-verktøyet og malen som prompt.
8. Når agenten er ferdig: formidle resultatet, vurder om
   utgangskriteriene i § 8 er innfridd, og foreslå neste oppgave fra
   gap-backloggen i § 14. Kom agenten tilbake med `BLOKKERT`: løs hindringen
   (som oftest et manglende punkt i § 16.1) og kjør oppgaven på nytt — ikke
   send den videre uendret.

Ikke skriv testene selv i denne kommandoen — deleger.
