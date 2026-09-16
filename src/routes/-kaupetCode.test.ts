import { describe, expect, it } from "vitest";

import { kaupetCodeSearchSchema } from "./$kaupetCode";

describe("/$kaupetCode validateSearch", () => {
  it("does not fill in searchSchema's defaults for an unknown address with no query string", () => {
    // Reproduces F3: kaupet.no/finnes-ikke-xyz used to normalize to
    // ?q=&qMode=all&extraGroups=[]&category=&categories=[]&catMode=any&
    // conditions=[]&includeFree=true&sort=new&attrs= and 307-redirect there,
    // on every address this catch-all route sees — not just categories.
    const parsed = kaupetCodeSearchSchema.parse({});
    expect(parsed).toEqual({});
  });

  it("still parses/coerces fields that are actually present in the URL", () => {
    const parsed = kaupetCodeSearchSchema.parse({ q: "iphone", includeFree: "true", sub: "sofa" });
    expect(parsed.q).toBe("iphone");
    expect(parsed.includeFree).toBe(true);
    expect(parsed.sub).toBe("sofa");
  });

  it("still parses the route-specific fields not present in the shared search schema", () => {
    const parsed = kaupetCodeSearchSchema.parse({ edit: "true", promotion: "success" });
    expect(parsed.edit).toBe(true);
    expect(parsed.promotion).toBe("success");
  });
});
