import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { sanitizeFeedbackPageUrl } from "./feedback-page-url";

describe("sanitizeFeedbackPageUrl", () => {
  it("drops origin, query and fragment", () => {
    expect(sanitizeFeedbackPageUrl("https://kaupet.no/sok?q=privat+tekst#top")).toBe("/sok");
    expect(sanitizeFeedbackPageUrl("https://kaupet.no/bedriftsinvitasjon?token=abc")).toBe(
      "/bedriftsinvitasjon",
    );
  });

  it("replaces the 360 capture token", () => {
    expect(sanitizeFeedbackPageUrl("https://kaupet.no/360-opptak/hemmelig-token")).toBe(
      "/360-opptak/:token",
    );
  });

  it("handles missing and relative input", () => {
    expect(sanitizeFeedbackPageUrl(undefined)).toBeUndefined();
    expect(sanitizeFeedbackPageUrl("/annonse/123?x=1")).toBe("/annonse/123");
  });

  it("masks every route with a token-like path parameter", () => {
    // Fails when a new capability route (e.g. `invitasjon.$token.tsx`) is
    // added without teaching the sanitizer about it.
    const files = readdirSync("src/routes", { recursive: true, encoding: "utf8" }).filter(
      (file) => /\.tsx?$/.test(file) && !/\.test\./.test(file) && /\$\w*(token|secret)/i.test(file),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const path = file
        .replace(/\.tsx?$/, "")
        .split(/[./]/)
        .filter((segment) => !segment.startsWith("_") && segment !== "index" && segment !== "route")
        .map((segment) => (segment.startsWith("$") ? "hemmelig-verdi" : segment))
        .join("/");
      expect(sanitizeFeedbackPageUrl(`https://kaupet.no/${path}`), file).not.toContain(
        "hemmelig-verdi",
      );
    }
  });
});
