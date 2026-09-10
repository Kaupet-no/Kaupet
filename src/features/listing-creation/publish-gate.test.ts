import { describe, expect, it } from "vitest";

import { publishGate } from "./publish-gate";

const base = {
  hasMissingAttributes: false,
  authenticated: true,
  hasPreviewed: true,
  native: false,
};

describe("publishGate", () => {
  it("ber om manglende egenskaper først", () => {
    expect(publishGate({ ...base, hasMissingAttributes: true, authenticated: false })).toBe(
      "fill-required-attributes",
    );
  });

  // Regresjonsvakt: forhåndsvisningsdialogen publiserer direkte, så en utlogget
  // bruker må sendes til innlogging FØR den dialogen kan vises.
  it("sender en utlogget bruker til innlogging, også uten forhåndsvisning", () => {
    expect(publishGate({ ...base, authenticated: false, hasPreviewed: false })).toBe("sign-in");
  });

  it("sender en utlogget bruker til innlogging på native", () => {
    expect(publishGate({ ...base, authenticated: false, native: true })).toBe("sign-in");
  });

  it("nudger innloggede web-brukere som ikke har forhåndsvist", () => {
    expect(publishGate({ ...base, hasPreviewed: false })).toBe("confirm-without-preview");
  });

  it("hopper over nudgen på native", () => {
    expect(publishGate({ ...base, hasPreviewed: false, native: true })).toBe("publish");
  });

  it("publiserer når alt er på plass", () => {
    expect(publishGate(base)).toBe("publish");
  });
});
