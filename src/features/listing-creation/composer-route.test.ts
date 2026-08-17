import { describe, expect, it } from "vitest";

import { isComposerRoute } from "./composer-route";

describe("isComposerRoute", () => {
  it.each(["/ny-annonse", "/ny-ok-annonse"])("gjenkjenner composer-ruten %s", (pathname) => {
    expect(isComposerRoute(pathname)).toBe(true);
  });

  it("skjuler ikke global navigasjon på andre ruter", () => {
    expect(isComposerRoute("/annonser")).toBe(false);
  });
});
