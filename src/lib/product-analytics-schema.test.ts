import { describe, expect, it } from "vitest";

import { productEventSchema } from "./product-analytics-schema";

const baseEvent = {
  sessionId: "00000000-0000-4000-8000-000000000001",
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
