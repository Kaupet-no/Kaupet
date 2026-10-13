import { describe, expect, it } from "vitest";

import {
  toListingCardData,
  toPopularListingCardData,
  type PopularListingRow,
} from "./listing-card-data";

describe("toPopularListingCardData", () => {
  it("konverterer RPC-tall og bevarer null kilometerstand", () => {
    const row = {
      listing_id: "listing-1",
      kaupet_code: "ABC123",
      title: "Volvo",
      subtitle: null,
      price_nok: 100,
      is_free: false,
      city: "Oslo",
      created_at: "2026-01-01T00:00:00Z",
      cover_path: null,
      total_views: null,
      views_last_week: "7",
      mileage_km: "12500",
      category_slug: "car",
      attributes: { fuel: "diesel" },
    } as unknown as PopularListingRow;

    expect(toPopularListingCardData(row)).toMatchObject({
      total_views: 0,
      views_last_week: 7,
      mileage_km: 12500,
      attributes: { fuel: "diesel" },
    });
    expect(
      toPopularListingCardData({ ...row, mileage_km: null } as unknown as PopularListingRow),
    ).toMatchObject({
      total_views: 0,
      mileage_km: null,
    });
  });
});

it.each([123, 0, null, "123", NaN, Infinity])(
  "KG-30-F04: kortadapter beholder gyldige driftstimer (%s)",
  (hours) => {
    const raw = {
      id: "listing",
      kaupet_code: "ABC",
      title: "Båt",
      subtitle: null,
      price_nok: 10,
      is_free: false,
      city: null,
      created_at: "",
      listing_images: [],
      attributes: { engine_hours: hours, mileage_km: hours },
      categories: null,
    };
    const expected = typeof hours === "number" && Number.isFinite(hours) ? hours : null;
    expect(toListingCardData(raw)).toMatchObject({ engine_hours: expected, mileage_km: expected });
    expect(
      toPopularListingCardData({
        ...raw,
        listing_id: "listing",
        mileage_km: null,
        category_slug: null,
        total_views: 0,
        views_last_week: 0,
        cover_path: null,
      } as unknown as PopularListingRow),
    ).toMatchObject({ engine_hours: expected });
  },
);
