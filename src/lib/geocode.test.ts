import { describe, expect, it, vi } from "vitest";
vi.mock("./geocode.functions", () => ({
  geocodeNorwayAddressFn: vi.fn().mockRejectedValue(new Error("offline")),
  geocodeStreetAddressFn: vi.fn().mockRejectedValue(new Error("offline")),
  lookupPostalCodeFn: vi.fn().mockRejectedValue(new Error("offline")),
  reverseGeocodeAddressFn: vi.fn().mockRejectedValue(new Error("offline")),
  searchPlacesFn: vi.fn().mockRejectedValue(new Error("offline")),
}));
import {
  geocodeNorwayAddress,
  geocodeStreetAddress,
  lookupPostalCode,
  reverseGeocode,
  reverseGeocodeAddress,
  searchPlaces,
} from "./geocode";

describe("best-effort geocoding helpers", () => {
  it("bevarer publisering ved tjenestefeil", async () => {
    expect(await geocodeNorwayAddress({ postal_code: "0152", city: "Oslo" })).toBeNull();
    expect(
      await geocodeStreetAddress({ address_line: "Prinsens gate 1A", postal_code: "0152" }),
    ).toBeNull();
    expect(await lookupPostalCode("0152")).toBeNull();
  });
  it("beholder kartpunkt uten stedsopplysninger ved tjenestefeil", async () => {
    expect(await reverseGeocodeAddress({ lat: 59.91, lng: 10.75 })).toEqual({
      city: null,
      postal_code: null,
    });
    expect(await reverseGeocode({ lat: 59.91, lng: 10.75 })).toBeNull();
  });
  it("eksplisitt søk rapporterer tjenestefeil", async () => {
    await expect(searchPlaces("Oslo")).rejects.toThrow("offline");
  });
});
