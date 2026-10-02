import { describe, expect, it } from "vitest";

import { toPopularListingCardData, type PopularListingRow } from "./listing-card-data";

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
