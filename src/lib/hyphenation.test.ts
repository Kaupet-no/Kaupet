// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { norwegianHyphenationSupported, shortenTileLabel } from "./hyphenation";

describe("norwegianHyphenationSupported", () => {
  it("returnerer false når layout ikke kan måles (jsdom) — korting er trygg standard", () => {
    // jsdom har ingen layout, så sonden får lik høyde med og uten
    // orddeling: uten bevis for ordbok skal den aldri påstå støtte.
    expect(norwegianHyphenationSupported()).toBe(false);
  });
});

describe("shortenTileLabel", () => {
  // I jsdom kan ikke bredde måles, så kortingen bruker det konservative
  // fallback-budsjettet (åtte bokstaver).
  it("korter bare ord som er for lange for én linje i flisen, med ... til slutt", () => {
    expect(shortenTileLabel("Underholdning")).toBe("Underhol...");
    expect(shortenTileLabel("Samleobjekter")).toBe("Samleobj...");
  });

  it("later korte ord og etiketter med flere ord være i fred", () => {
    expect(shortenTileLabel("Hele Norge")).toBe("Hele Norge");
    expect(shortenTileLabel("Sport og fritid")).toBe("Sport og fritid");
    expect(shortenTileLabel("Hobby og håndverk")).toBe("Hobby og håndverk");
  });

  it("korter bare det lange ordet i en flerveis etikett", () => {
    expect(shortenTileLabel("Elektronikk og fritidsutstyr")).toBe("Elektron... og fritidsu...");
  });
});
