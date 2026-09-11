import { describe, expect, it } from "vitest";

import { isComposerRoute, isFocusedRoute } from "./chrome-routes";

describe("isComposerRoute", () => {
  it.each(["/ny-annonse", "/ny-ok-annonse"])("gjenkjenner composer-ruten %s", (pathname) => {
    expect(isComposerRoute(pathname)).toBe(true);
  });

  it("skjuler ikke global navigasjon på andre ruter", () => {
    expect(isComposerRoute("/annonser")).toBe(false);
  });
});

describe("isFocusedRoute", () => {
  it.each(["/auth", "/tilbakestill-passord", "/bekrefter/promo-1", "/kvittering/promo-1"])(
    "gjenkjenner den fokuserte ruten %s",
    (pathname) => {
      expect(isFocusedRoute(pathname)).toBe(true);
    },
  );

  it.each(["/", "/annonser", "/bekrefter", "/kvittering", "/bekrefter-feil/promo-1"])(
    "beholder global navigasjon på ruten %s",
    (pathname) => {
      expect(isFocusedRoute(pathname)).toBe(false);
    },
  );
});
