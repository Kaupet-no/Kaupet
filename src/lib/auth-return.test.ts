import { describe, expect, it } from "vitest";
import { postAuthDestination, safeReturnTo } from "./auth-return";

// Dekker AUTH-03 (docs/TESTSTRATEGI.md § 11.1)
describe("safeReturnTo", () => {
  it("keeps internal paths with search and hash", () => {
    expect(safeReturnTo("/annonser?q=sykkel#treff")).toBe("/annonser?q=sykkel#treff");
  });

  it.each(["https://evil.example", "//evil.example/path", "annonser", null, 12])(
    "rejects unsafe destination %s",
    (destination) => expect(safeReturnTo(destination)).toBeUndefined(),
  );
});

describe("postAuthDestination", () => {
  it.each([
    { returnTo: "/annonser/123", hasBusinessAccount: true, expected: "/bedrift" },
    { returnTo: undefined, hasBusinessAccount: true, expected: "/bedrift" },
    { returnTo: "/annonser/123", hasBusinessAccount: false, expected: "/annonser/123" },
    { returnTo: undefined, hasBusinessAccount: false, expected: "/" },
  ])(
    "prioriterer riktig mål for bedrift=$hasBusinessAccount og returnTo=$returnTo",
    ({ returnTo, hasBusinessAccount, expected }) => {
      expect(postAuthDestination(returnTo, hasBusinessAccount)).toBe(expected);
    },
  );
});
