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
});
