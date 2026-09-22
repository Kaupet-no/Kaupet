import { describe, expect, it } from "vitest";

import { buildSecurityHeaders } from "./security-headers";

describe("buildSecurityHeaders", () => {
  it("inkluderer både r2PublicBaseUrl og r2AccountId i img-src direktivet", () => {
    const headers = buildSecurityHeaders({
      r2PublicBaseUrl: "https://bilder.kaupet.no",
      r2AccountId: "abc123",
    });

    const csp = headers["content-security-policy"];
    const imgSrcDirective = csp.split("; ").find((d) => d.startsWith("img-src "));

    expect(imgSrcDirective).toContain("https://bilder.kaupet.no");
    expect(imgSrcDirective).toContain("https://abc123.r2.cloudflarestorage.com");
  });

  it("attribuerer Kaupet.no i x-powered-by med bare latin-1-tegn", () => {
    const value = buildSecurityHeaders({})["x-powered-by"];

    expect(value).toContain("Kaupet.no");
    // Headerverdier er latin-1: ingen em-dash eller andre tegn over 0x7e.
    expect(value).toMatch(/^[\x20-\x7e]+$/);
  });

  it("inneholder aldri wildcard for alle r2.cloudflarestorage.com kontoer", () => {
    const headers = buildSecurityHeaders({
      r2PublicBaseUrl: "https://bilder.kaupet.no",
      r2AccountId: "abc123",
    });

    const csp = headers["content-security-policy"];

    expect(csp).not.toContain("*.r2.cloudflarestorage.com");
  });

  it("utelater undefined-strengen når r2PublicBaseUrl mangler", () => {
    const headers = buildSecurityHeaders({
      r2AccountId: "abc123",
    });

    const csp = headers["content-security-policy"];
    const imgSrcDirective = csp.split("; ").find((d) => d.startsWith("img-src "));

    expect(imgSrcDirective).not.toContain("undefined");
    // Sjekk også at det ikke er doble mellomrom
    expect(imgSrcDirective).not.toMatch(/ {2}/);
  });

  it("utelater r2.cloudflarestorage.com når r2AccountId mangler", () => {
    const headers = buildSecurityHeaders({
      r2PublicBaseUrl: "https://bilder.kaupet.no",
    });

    const csp = headers["content-security-policy"];
    const imgSrcDirective = csp.split("; ").find((d) => d.startsWith("img-src "));

    expect(imgSrcDirective).not.toContain("r2.cloudflarestorage.com");
  });
});
