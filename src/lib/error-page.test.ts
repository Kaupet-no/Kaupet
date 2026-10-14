import { describe, expect, it } from "vitest";

import { renderErrorPage } from "./error-page";

describe("renderErrorPage", () => {
  // Siden serveres med script-src uten unsafe-inline (security-headers.ts).
  it("har ingen inline skript eller eventhandlere som CSP blokkerer", () => {
    const html = renderErrorPage();
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
  });

  it("Prøv igjen laster samme adresse på nytt", () => {
    expect(renderErrorPage()).toMatch(/<a class="primary" href="">Prøv igjen<\/a>/);
  });
});
