// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResultList } from "@/components/result-list";
import type { AppliedSearchState } from "./search-schema";
import { bestZeroResultExpansions, buildZeroResultCandidates } from "./zero-result-expansion";

afterEach(cleanup);

vi.mock("@/components/featured-listings-section", () => ({
  FeaturedListingsSection: () => null,
}));
vi.mock("@/hooks/use-listing-card-images", () => ({ useListingCardImages: () => ({}) }));
vi.mock("@/hooks/use-listing-favorites", () => ({
  useListingFavorites: () => ({ favoriteIds: new Set(), isReady: true }),
}));
vi.mock("@/lib/product-analytics", () => ({ trackProductEvent: vi.fn() }));

const applied: AppliedSearchState = {
  value: {
    terms: ["volvo"],
    qMode: "all",
    extraGroups: [],
    categories: ["bil"],
    catMode: "any",
    conditions: ["good"],
    min: null,
    max: 300_000,
    includeFree: true,
    sort: "new",
    location: { lat: null, lng: null, radius: 10, label: "" },
  },
  attributes: { fuel_type: { kind: "select", value: "diesel" } },
};

describe("nulltreffutvidelse", () => {
  it("viser opptil tre dokumenterte måter å utvide nulltreffet på", () => {
    const candidates = buildZeroResultCandidates(applied, []);
    const options = bestZeroResultExpansions(
      candidates,
      candidates.map((_, index) => (index < 3 ? index + 1 : 0)),
    );
    const onApply = vi.fn();
    const { getAllByRole } = render(
      <ResultList
        isNative={false}
        isDesktop={false}
        q="volvo"
        effectiveCategories={["bil"]}
        cards={[]}
        totalCount={0}
        isLoading={false}
        hasNextPage={false}
        isFetchingNextPage={false}
        fetchNextPage={vi.fn()}
        resetFilters={vi.fn()}
        mapListings={[]}
        mapCenter={null}
        radiusKm={10}
        onMapApplyViewport={vi.fn()}
        sort="new"
        onSortChange={vi.fn()}
        zeroResultExpansions={options}
        onApplyZeroResultExpansion={onApply}
      />,
    );

    const buttons = getAllByRole("button", { name: /Vis \d+ treff uten/ });
    expect(buttons).toHaveLength(3);
    fireEvent.click(buttons[1]);
    expect(onApply).toHaveBeenCalledWith(options[1]);
  });
});
