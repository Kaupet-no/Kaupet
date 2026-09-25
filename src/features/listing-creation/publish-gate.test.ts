import { describe, expect, it } from "vitest";

import { publishGate } from "./publish-gate";

const base = { hasMissingAttributes: false, authenticated: true };

describe("publishGate", () => {
  it("ber om manglende egenskaper først", () => {
    expect(publishGate({ hasMissingAttributes: true, authenticated: false })).toBe(
      "fill-required-attributes",
    );
  });

  it("sender en utlogget bruker til innlogging før publisering", () => {
    expect(publishGate({ ...base, authenticated: false })).toBe("sign-in");
  });

  it("publiserer når alt er på plass", () => {
    expect(publishGate(base)).toBe("publish");
  });
});
