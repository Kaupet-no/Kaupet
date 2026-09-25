import { describe, expect, it } from "vitest";

import { productEventSchema } from "./product-analytics-schema";

const baseEvent = {
  platform: "web" as const,
  path: "/annonser",
};

describe("productEventSchema", () => {
  it("godtar feilhendelsen for publisering", () => {
    expect(
      productEventSchema.parse({
        ...baseEvent,
        eventName: "listing_publish_failed",
        properties: { kind: "sell", step: "review" },
      }),
    ).toMatchObject({ eventName: "listing_publish_failed" });
  });

  it("avviser atferdshendelser", () => {
    for (const eventName of ["search_submitted", "listing_opened", "favorite_toggled"]) {
      expect(() => productEventSchema.parse({ ...baseEvent, eventName })).toThrow();
    }
  });

  it("avviser rå søketekst og lokasjon i properties", () => {
    expect(() =>
      productEventSchema.parse({
        ...baseEvent,
        eventName: "listing_publish_failed",
        properties: { query: "hemmelig tekst" },
      }),
    ).toThrow();

    expect(() =>
      productEventSchema.parse({
        ...baseEvent,
        eventName: "listing_publish_failed",
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
