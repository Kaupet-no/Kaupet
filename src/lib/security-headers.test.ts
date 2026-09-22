import { describe, expect, it } from "vitest";

import { buildSecurityHeaders } from "./security-headers";

describe("buildSecurityHeaders", () => {
  it("tillater SSR-script med nonce uten unsafe-inline", () => {
    const csp = buildSecurityHeaders({ scriptNonce: "abc123" })["content-security-policy"];
    const scriptSrcDirective = csp.split("; ").find((d) => d.startsWith("script-src "));

    expect(scriptSrcDirective).toContain("'nonce-abc123'");
    expect(scriptSrcDirective).not.toContain("unsafe-inline");
  });

  it("har ingen script unsafe-inline uten request-nonce heller", () => {
    const csp = buildSecurityHeaders({})["content-security-policy"];
    const scriptSrcDirective = csp.split("; ").find((d) => d.startsWith("script-src "));

    expect(scriptSrcDirective).not.toContain("unsafe-inline");
  });

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

  it("tillater den konfigurerte Supabase-URL-en i connect-src (lokal E2E)", () => {
    const csp = buildSecurityHeaders({ supabaseUrl: "http://127.0.0.1:54321/" })[
      "content-security-policy"
    ];
    const connectSrcDirective = csp.split("; ").find((d) => d.startsWith("connect-src "));

    expect(connectSrcDirective).toContain(" http://127.0.0.1:54321 ");
    expect(connectSrcDirective).toContain(" ws://127.0.0.1:54321 ");
    expect(buildSecurityHeaders({})["content-security-policy"]).not.toContain("undefined");
  });
});
