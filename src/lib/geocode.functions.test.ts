import { beforeEach, describe, expect, it, vi } from "vitest";

const { limit, search } = vi.hoisted(() => ({ limit: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/rate-limit.server", () => ({ assertNotRateLimited: limit }));
vi.mock("@/lib/geocode.server", () => ({ searchPlaces: search }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (validate: (input: unknown) => unknown) => ({
      handler: (handler: (ctx: { data: unknown }) => unknown) => (opts: { data: unknown }) =>
        handler({ data: validate(opts.data) }),
    }),
  }),
}));
import { searchPlacesFn, reverseGeocodeAddressFn, lookupPostalCodeFn } from "./geocode.functions";
beforeEach(() => {
  limit.mockReset().mockResolvedValue(undefined);
  search.mockReset().mockResolvedValue([]);
});

describe("public geocoding boundary", () => {
  it.each(["Oslo", "Ås", "Æøå 😀", "a".repeat(100)])("godtar gyldig tekst %s", async (query) => {
    await searchPlacesFn({ data: { query, limit: 6 } });
    expect(limit).toHaveBeenCalledWith("geocoding", 60, 60);
    expect(search).toHaveBeenCalledWith(query, 6);
  });
  it.each(["", "a", "a".repeat(101), "a".repeat(10000), null, undefined, 123])(
    "avviser tekst utenfor grensene %j",
    (query) => {
      expect(() => searchPlacesFn({ data: { query, limit: 6 } } as never)).toThrow();
      expect(limit).not.toHaveBeenCalled();
      expect(search).not.toHaveBeenCalled();
    },
  );
  it.each([1, 10])("godtar treffgrense %s", async (max) => {
    await searchPlacesFn({ data: { query: "Oslo", limit: max } });
  });
  it.each([0, 11, 1.5, "6", Infinity])("avviser treffgrense %j", (max) => {
    expect(() => searchPlacesFn({ data: { query: "Oslo", limit: max } } as never)).toThrow();
  });
  it.each([
    { lat: -91, lng: 0 },
    { lat: 91, lng: 0 },
    { lat: 0, lng: -181 },
    { lat: 0, lng: 181 },
    { lat: Infinity, lng: 0 },
    { lat: "59", lng: 10 },
    {},
    null,
  ])("avviser ugyldige koordinater %j", (coords) => {
    expect(() => reverseGeocodeAddressFn({ data: coords } as never)).toThrow();
    expect(limit).not.toHaveBeenCalled();
  });
  it.each(["152", "00152", "abcd", "", null])("avviser ugyldig postnummer %j", (postal) => {
    expect(() => lookupPostalCodeFn({ data: { postal } } as never)).toThrow();
  });
  it("stopper før leverandøren hvis IP-grensen er nådd", async () => {
    limit.mockRejectedValue(new Error("rate limit"));
    await expect(searchPlacesFn({ data: { query: "Oslo", limit: 6 } })).rejects.toThrow(
      "rate limit",
    );
    expect(search).not.toHaveBeenCalled();
  });
});
