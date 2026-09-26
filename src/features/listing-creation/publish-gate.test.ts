// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { blockImplicitSubmit, publishGate } from "./publish-gate";

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

describe("blockImplicitSubmit", () => {
  function press(key: string, target: HTMLElement) {
    const event = { key, target, preventDefault: vi.fn() };
    blockImplicitSubmit(event);
    return event.preventDefault.mock.calls.length > 0;
  }

  it("stopper Enter i tekstfelt, så Se over-feltene ikke publiserer", () => {
    expect(press("Enter", document.createElement("input"))).toBe(true);
    const price = document.createElement("input");
    price.type = "number";
    expect(press("Enter", price)).toBe(true);
  });

  it("lar Publiser-knappen, tekstområder og andre taster være", () => {
    const submit = document.createElement("input");
    submit.type = "submit";
    expect(press("Enter", submit)).toBe(false);
    expect(press("Enter", document.createElement("button"))).toBe(false);
    expect(press("Enter", document.createElement("textarea"))).toBe(false);
    expect(press("a", document.createElement("input"))).toBe(false);
  });
});
