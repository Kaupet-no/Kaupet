import { describe, expect, it } from "vitest";

import { searchSchema } from "@/features/listing-search/search-schema";
import { buildListingsSearchRpcArgs } from "@/features/listing-search/listing-search-query";

describe("buildListingsSearchRpcArgs", () => {
  it("builds the same complete RPC filter set for list and count requests", () => {
    const search = searchSchema.parse({
      q: "elektrisk suv",
      qMode: "any",
      extraGroups: [
        { id: "include", mode: "all", exclude: false, terms: ["firehjulstrekk"] },
        { id: "exclude", mode: "any", exclude: true, terms: ["skadet"] },
      ],
      categories: ["bil"],
      conditions: ["good"],
      includeFree: false,
      min: 100,
      max: 500,
      attrs: "body_type:m:suv",
      lat: 59.9,
      lng: 10.7,
      radius: 25,
      sort: "price_asc",
    });

    const args = buildListingsSearchRpcArgs({
      search,
      categories: [
        { id: "root", slug: "bil-og-mc", parent_id: null },
        { id: "car", slug: "bil", parent_id: "root" },
      ],
      effectiveCategories: ["bil"],
      terms: ["elektrisk", "suv"],
      limit: 1,
      offset: 0,
    });

    expect(args).toMatchObject({
      _include_groups: [
        { mode: "any", terms: ["elektrisk", "suv"] },
        { mode: "all", terms: ["firehjulstrekk"] },
      ],
      _exclude_any_terms: ["skadet"],
      _category_ids: ["car"],
      _conditions: ["good"],
      _include_free: false,
      _min_price: 100,
      _max_price: 500,
      _center_lat: 59.9,
      _center_lng: 10.7,
      _radius_km: 25,
      _sort: "price_asc",
      _limit: 1,
      _offset: 0,
    });
    expect(args?._attribute_filters).toEqual({
      body_type: { kind: "multiselect", values: ["suv", "kombi"] },
    });
  });

  it("short-circuits unknown selected categories", () => {
    const search = searchSchema.parse({ categories: ["missing"] });
    expect(
      buildListingsSearchRpcArgs({
        search,
        categories: [],
        effectiveCategories: ["missing"],
        terms: [],
        limit: 1,
        offset: 0,
      }),
    ).toBeNull();
  });
});
