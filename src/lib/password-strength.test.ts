import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password-strength";

// Dekker AUTH-01 (docs/TESTSTRATEGI.md § 11.1)
describe("passwordStrength", () => {
  it("gir Middels for typisk gyldig passord (stor+liten bokstav, siffer, <10 tegn)", () => {
    expect(passwordStrength("Passord1")).toEqual({ label: "Middels", score: 2 });
  });

  it("gir Svakt på nedre grense (6 tegn, kun små bokstaver)", () => {
    expect(passwordStrength("abcdef")).toEqual({ label: "Svakt", score: 1 });
  });

  it("gir For kort på nedre grense minus én (5 tegn)", () => {
    expect(passwordStrength("abcde")).toEqual({ label: "For kort", score: 0 });
  });

  it("gir Svakt på øvre grense for lengdebonus (10 tegn, kun små bokstaver)", () => {
    expect(passwordStrength("abcdefghij")).toEqual({ label: "Svakt", score: 1 });
  });

  it("gir Svakt på øvre grense pluss én (11 tegn, kun små bokstaver)", () => {
    expect(passwordStrength("abcdefghijk")).toEqual({ label: "Svakt", score: 1 });
  });

  it("kaster ikke og gir For kort for tom streng", () => {
    expect(() => passwordStrength("")).not.toThrow();
    expect(passwordStrength("")).toEqual({ label: "For kort", score: 0 });
  });

  it.skip("null/undefined/feil type — umulig for typen (password: string), TypeScript hindrer kall ved kompilering", () => {
    // Rad 7 og 8 i PB-1-datamatrisen er ikke gjennomførbare: funksjonens
    // signatur er typet `password: string`, så et kall med null, undefined
    // eller tall stoppes av TypeScript før kjøretid.
  });

  it("teller ikke æøåÆØÅ som bokstavpar (ASCII-only regex) — kun sifferkriteriet slår til", () => {
    expect(passwordStrength("æøåÆØÅ12")).toEqual({ label: "Svakt", score: 1 });
  });

  it("teller emoji som 2 UTF-16-enheter og gir Middels ved lengde- og sifferkriteriet", () => {
    expect(passwordStrength("æøå😀123456")).toEqual({ label: "Middels", score: 2 });
  });

  it("gir Sterkt for svært lang streng som oppfyller alle tre kriterier (ekstremverdi)", () => {
    expect(passwordStrength("a".repeat(1000) + "B1!")).toEqual({ label: "Sterkt", score: 3 });
  });

  it("gir Sterkt når alle tre kriterier er oppfylt samtidig (lengde, bokstavpar, siffer)", () => {
    expect(passwordStrength("Abcdefghi1")).toEqual({ label: "Sterkt", score: 3 });
  });
});
