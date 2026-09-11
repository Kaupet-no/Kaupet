import { describe, expect, it } from "vitest";

import {
  DEFAULT_LISTING_VIEW_THRESHOLD,
  MAX_LISTING_VIEW_THRESHOLD,
  summarizeListingInsights,
} from "./listing-insights";

describe("summarizeListingInsights", () => {
  it("teller aktive, inaktive og annonser under terskelen", () => {
    const result = summarizeListingInsights(
      [
        { status: "active", viewCount: 9 },
        { status: "active", viewCount: 10 },
        { status: "draft", viewCount: 2 },
        { status: "sold", viewCount: 25 },
      ],
      10,
    );

    expect(result).toEqual({ active: 2, inactive: 2, lowViews: 2, threshold: 10 });
  });

  it("inkluderer nullgrensen, men ikke annonser med nøyaktig terskel", () => {
    const result = summarizeListingInsights(
      [
        { status: "active", viewCount: 0 },
        { status: "active", viewCount: 1 },
      ],
      1,
    );

    expect(result.lowViews).toBe(1);
  });

  it("bruker standardterskelen for ugyldige eller ekstreme verdier", () => {
    const rows = [{ status: "active", viewCount: DEFAULT_LISTING_VIEW_THRESHOLD - 1 }];

    expect(summarizeListingInsights(rows, -1).threshold).toBe(DEFAULT_LISTING_VIEW_THRESHOLD);
    expect(summarizeListingInsights(rows, MAX_LISTING_VIEW_THRESHOLD + 1).threshold).toBe(
      DEFAULT_LISTING_VIEW_THRESHOLD,
    );
    expect(summarizeListingInsights(rows, 1.5).threshold).toBe(DEFAULT_LISTING_VIEW_THRESHOLD);
  });
});
