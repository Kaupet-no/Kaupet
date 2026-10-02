import { describe, expect, it } from "vitest";

import { FIELD_ERRORS_MESSAGE, visibleErrorSummary } from "./error-summary";

describe("visibleErrorSummary", () => {
  it("skjuler feltfeil-banneret når feltene er rettet", () => {
    expect(visibleErrorSummary(FIELD_ERRORS_MESSAGE, { hasFieldErrors: true })).toBe(
      FIELD_ERRORS_MESSAGE,
    );
    expect(visibleErrorSummary(FIELD_ERRORS_MESSAGE, { hasFieldErrors: false })).toBeNull();
  });

  it("følger stegvalidatoren når den blokkerte", () => {
    const msg = "Oppgi en pris før annonsen publiseres.";
    expect(visibleErrorSummary(msg, { hasFieldErrors: false, stillInvalid: true })).toBe(msg);
    expect(visibleErrorSummary(msg, { hasFieldErrors: false, stillInvalid: false })).toBeNull();
    expect(visibleErrorSummary(msg, { hasFieldErrors: false })).toBe(msg);
  });
});
