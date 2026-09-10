import { describe, expect, it } from "vitest";
import {
  authConfirmationRedirect,
  authResumeReturnTo,
  postAuthDestination,
  safeReturnTo,
} from "./auth-return";

// Dekker AUTH-03 (docs/TESTSTRATEGI.md § 11.1)
describe("safeReturnTo", () => {
  it("keeps internal paths with search and hash", () => {
    expect(safeReturnTo("/annonser?q=sykkel#treff")).toBe("/annonser?q=sykkel#treff");
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "/annonser/\u000Aevil.example",
    "annonser",
    null,
    12,
  ])("rejects unsafe destination %s", (destination) => {
    expect(safeReturnTo(destination)).toBeUndefined();
  });
});

describe("postAuthDestination", () => {
  it.each([
    { returnTo: "/annonser/123", hasBusinessAccount: true, expected: "/annonser/123" },
    { returnTo: undefined, hasBusinessAccount: true, expected: "/bedrift" },
    { returnTo: "/annonser/123", hasBusinessAccount: false, expected: "/annonser/123" },
    { returnTo: undefined, hasBusinessAccount: false, expected: "/" },
  ])(
    "prioriterer riktig mål for bedrift=$hasBusinessAccount og returnTo=$returnTo",
    ({ returnTo, hasBusinessAccount, expected }) => {
      expect(postAuthDestination(returnTo, hasBusinessAccount)).toBe(expected);
    },
  );

  it("en eksplisitt returnTo vinner alltid over bedriftskontoens standardrute", () => {
    expect(postAuthDestination("/ny-annonse?intent=sell&resume=auth-publish", true)).toBe(
      "/ny-annonse?intent=sell&resume=auth-publish",
    );
  });
});

describe("authConfirmationRedirect", () => {
  it("uses the safe internal return target for signup and resend callbacks", () => {
    expect(
      authConfirmationRedirect("/ny-annonse?intent=sell&resume=auth-publish", "https://kaupet.no"),
    ).toBe(
      "https://kaupet.no/auth?mode=signin&returnTo=%2Fny-annonse%3Fintent%3Dsell%26resume%3Dauth-publish",
    );
  });

  it("falls back to the home route for an unsafe return target", () => {
    expect(authConfirmationRedirect("https://evil.example", "https://kaupet.no")).toBe(
      "https://kaupet.no/auth?mode=signin&returnTo=%2F",
    );
  });
});

describe("authResumeReturnTo", () => {
  it("bevarer query og hash og erstatter eksisterende resume", () => {
    expect(authResumeReturnTo("/ny-annonse?type=sell&resume=old#review")).toBe(
      "/ny-annonse?type=sell&resume=auth-publish#review",
    );
  });

  it("faller tilbake til roten for utrygg retur", () => {
    expect(authResumeReturnTo("https://evil.example")).toBe("/?resume=auth-publish");
  });
});
