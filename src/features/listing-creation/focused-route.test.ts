import { describe, expect, it } from "vitest";

import { isFocusedRoute } from "./focused-route";

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
