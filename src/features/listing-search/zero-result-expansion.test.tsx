// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResultList } from "@/components/result-list";
import type { AppliedSearchState } from "./search-schema";
import {
  bestZeroResultExpansion,
  bestZeroResultExpansions,
  buildZeroResultCandidates,
  type ZeroResultExpansion,
} from "./zero-result-expansion";

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
  it("velger høyeste dokumenterte ett-kriteriums effekt og utfører handlingen", () => {
    const candidates = buildZeroResultCandidates(applied, []);
    const counts = candidates.map((candidate) =>
      candidate.key === "price" ? 12 : candidate.key === "attribute:fuel_type" ? 4 : 0,
    );
    const best = bestZeroResultExpansion(candidates, counts) as ZeroResultExpansion;
    const onApply = vi.fn();
    const { getByRole } = render(
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
        onMapCenterChange={vi.fn()}
        sort="new"
        onSortChange={vi.fn()}
        zeroResultExpansion={best}
        onApplyZeroResultExpansion={onApply}
      />,
    );

    expect(best.key).toBe("price");
    expect(best.applied.value.max).toBeNull();
    expect(best.applied.attributes.fuel_type).toEqual(applied.attributes.fuel_type);

    fireEvent.click(getByRole("button", { name: "Vis 12 treff uten «prisfilteret»" }));
    expect(onApply).toHaveBeenCalledWith(best);
  });

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
        onMapCenterChange={vi.fn()}
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
