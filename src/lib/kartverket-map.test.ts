import { describe, expect, it } from "vitest";

import { isValidMapCoordinate, KARTVERKET_TILE_LAYER } from "./kartverket-map";

describe("Kartverket-kartlag", () => {
  it("bruker Kartverkets rene gråtonekart uten tilgangsnøkkel", () => {
    expect(KARTVERKET_TILE_LAYER.url).toBe(
      "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
    );
    expect(KARTVERKET_TILE_LAYER.attribution).toContain("kartverket.no");
    expect(KARTVERKET_TILE_LAYER.url).not.toMatch(/token|key|access/i);
  });

  it("avviser koordinater som ikke kan vises på kartet", () => {
    expect(isValidMapCoordinate({ lat: 59.91, lng: 10.75 })).toBe(true);
    expect(isValidMapCoordinate({ lat: Number.NaN, lng: 10.75 })).toBe(false);
    expect(isValidMapCoordinate({ lat: 59.91, lng: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isValidMapCoordinate({ lat: 91, lng: 10.75 })).toBe(false);
    expect(isValidMapCoordinate(null)).toBe(false);
  });
});
