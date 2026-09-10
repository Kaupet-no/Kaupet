import { describe, expect, it } from "vitest";

import { productEventSchema } from "./product-analytics-schema";

const baseEvent = {
  platform: "web" as const,
  path: "/annonser",
};

describe("productEventSchema", () => {
  it("godtar nye personverntrygge søkehendelser", () => {
    expect(
      productEventSchema.parse({
        ...baseEvent,
        eventName: "search_filter_applied",
        properties: { filterKey: "price", resultCount: 12 },
      }),
    ).toMatchObject({ eventName: "search_filter_applied" });
  });
  it("beholder kompatibilitet for eksisterende annonsehendelser", () => {
    expect(
      productEventSchema.parse({
        ...baseEvent,
        eventName: "listing_creation_step_completed",
        properties: { kind: "sell", step: "photos", stepNumber: 2 },
      }),
    ).toMatchObject({ properties: { stepNumber: 2 } });

    expect(
      productEventSchema.parse({
        ...baseEvent,
        eventName: "listing_creation_started",
      }),
    ).toMatchObject({ properties: {} });
  });

  it("avviser rå søketekst og lokasjon i properties", () => {
    expect(() =>
      productEventSchema.parse({
        ...baseEvent,
        eventName: "search_submitted",
        properties: { query: "hemmelig tekst" },
      }),
    ).toThrow();

    expect(() =>
      productEventSchema.parse({
        ...baseEvent,
        eventName: "search_map_opened",
        properties: { latitude: 59.9 },
      }),
    ).toThrow();
  });

  it("avviser ukjente hendelser", () => {
    expect(() =>
      productEventSchema.parse({
        ...baseEvent,
        eventName: "search_unknown",
      }),
    ).toThrow();
  });
});
