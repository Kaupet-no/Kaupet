import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./auth-return";

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
