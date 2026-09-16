// @vitest-environment jsdom
//
// F8: nullresultat i søk skal ikke love en "Nullstill alle filtre"-handling
// den ikke kan levere (kun fritekst, ingen faktiske filtre), og skal foreslå
// kategorien når søkeordet matcher et kategorinavn.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResultList } from "./result-list";

afterEach(cleanup);

vi.mock("@/components/featured-listings-section", () => ({
  FeaturedListingsSection: () => null,
}));
vi.mock("@/hooks/use-listing-card-images", () => ({ useListingCardImages: () => ({}) }));
vi.mock("@/hooks/use-listing-favorites", () => ({
  useListingFavorites: () => ({ favoriteIds: new Set(), isReady: true }),
}));
vi.mock("@/lib/product-analytics", () => ({ trackProductEvent: vi.fn() }));

const baseProps = {
  isNative: false,
  isDesktop: false,
  cards: [],
  totalCount: 0,
  isLoading: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  mapListings: [],
  mapCenter: null,
  radiusKm: 10,
  onMapApplyViewport: vi.fn(),
  sort: "new" as const,
  onSortChange: vi.fn(),
};

describe("ResultList – nullresultat uten filtre (F8)", () => {
  it("skjuler «Nullstill alle filtre» når søket bare er fritekst uten aktive filtre", () => {
    const { queryByRole } = render(
      <ResultList
        {...baseProps}
        q="sofa"
        effectiveCategories={[]}
        resetFilters={vi.fn()}
        hasActiveCriteria={false}
      />,
    );

    expect(queryByRole("button", { name: "Nullstill alle filtre" })).toBeNull();
  });

  it("viser «Nullstill alle filtre» når et faktisk filter (f.eks. kategori) er aktivt", () => {
    const { getByRole } = render(
      <ResultList
        {...baseProps}
        q=""
        effectiveCategories={["bil"]}
        resetFilters={vi.fn()}
        hasActiveCriteria={true}
      />,
    );

    expect(getByRole("button", { name: "Nullstill alle filtre" })).toBeTruthy();
  });

  it("nevner ikke filtre i nullresultat-teksten når ingen filtre er aktive (F8-rest)", () => {
    const { getByText, queryByText } = render(
      <ResultList
        {...baseProps}
        q="zzzqqqwww"
        effectiveCategories={[]}
        resetFilters={vi.fn()}
        hasActiveCriteria={false}
      />,
    );

    expect(getByText("Ingen treff for «zzzqqqwww». Prøv andre søkeord.")).toBeTruthy();
    expect(
      queryByText("Ingen treff for «zzzqqqwww». Prøv andre søkeord eller fjern filtre."),
    ).toBeNull();
  });

  it("nevner filtre i nullresultat-teksten når et faktisk filter er aktivt", () => {
    const { getByText } = render(
      <ResultList
        {...baseProps}
        q="zzzqqqwww"
        effectiveCategories={[]}
        resetFilters={vi.fn()}
        hasActiveCriteria={true}
      />,
    );

    expect(
      getByText("Ingen treff for «zzzqqqwww». Prøv andre søkeord eller fjern filtre."),
    ).toBeTruthy();
  });

  it("foreslår kategorien når søkeordet matcher et kategorinavn", () => {
    const onApply = vi.fn();
    const { getByRole } = render(
      <ResultList
        {...baseProps}
        q="sofa"
        effectiveCategories={[]}
        resetFilters={vi.fn()}
        hasActiveCriteria={false}
        categorySuggestion={{ categoryName: "Sofa", onApply }}
      />,
    );

    const button = getByRole("button", { name: "Gå til Sofa" });
    fireEvent.click(button);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
