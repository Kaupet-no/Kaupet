import { expect, expectTypeOf, it } from "vitest";

import { mapListingFactSource, type FactSource } from "./fact-source";

it("avgrenser faktakilder til detaljvisningens fire presentasjonskilder", () => {
  expectTypeOf<FactSource>().toEqualTypeOf<"registry" | "seller" | "kaupet" | "unknown">();
});

it("mapper eksisterende detaljfakta til dokumenterbare kilder", () => {
  const profileCreatedAt = "2024-03-12T10:30:00.000Z";

  expect(mapListingFactSource("vehicleLookup")).toEqual({
    source: "registry",
    timestamp: null,
  });
  expect(mapListingFactSource("profileAge", profileCreatedAt)).toEqual({
    source: "kaupet",
    timestamp: profileCreatedAt,
  });
  expect(mapListingFactSource("reviews")).toEqual({ source: "kaupet", timestamp: null });
  expect(mapListingFactSource("sellerFields")).toEqual({ source: "seller", timestamp: null });
  expect(mapListingFactSource("missing", profileCreatedAt)).toEqual({
    source: "unknown",
    timestamp: null,
  });
});
