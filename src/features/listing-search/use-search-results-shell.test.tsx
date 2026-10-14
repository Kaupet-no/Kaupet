// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { searchSchema } from "./search-schema";
import { useSearchResultsShell } from "./use-search-results-shell";

const rows = [
  {
    id: "sold",
    title: "Solgt sykkel æøå 🚲",
    price_nok: 1000,
    is_free: false,
    lat: 59,
    lng: 10,
    mileage_km: 85000,
    engine_hours: 123,
    sold_at: "2026-10-02T12:00:00Z",
  },
  { id: "active", price_nok: 0, is_free: true, lat: 59, lng: 10, sold_at: null },
];
vi.mock("./use-listings-query", () => ({
  useListingsQuery: () => ({ data: { pages: [{ rows, totalCount: 2 }] }, isLoading: false }),
  useListingsPriceMax: () => ({ data: 1000 }),
}));
vi.mock("./use-annonser-search-state", () => ({
  useAnnonserSearchState: () => ({
    location: {},
    effectiveCategories: [],
    categoryTree: {},
    attrFilters: [],
    attrValues: {},
    terms: [],
  }),
}));
vi.mock("./use-filter-facet-counts", () => ({ useFilterFacetCounts: () => ({}) }));
vi.mock("./use-text-to-filter-pipeline", () => ({ useTextToFilterPipeline: () => {} }));
vi.mock("./zero-result-expansion", () => ({ useZeroResultExpansion: () => ({}) }));
vi.mock("./search-panel/search-panel-context", () => ({ useRegisterSearchPanelResults: () => {} }));
afterEach(cleanup);

it("beholder solgt-status og pris fra søkeresultatene til både kortene og kartet", () => {
  const { result } = renderHook(() =>
    useSearchResultsShell({
      search: searchSchema.parse({}),
      navigate: vi.fn(),
      categories: [],
      allFilters: [],
      qDraft: "",
      setQDraft: vi.fn(),
      resolveCategoryId: () => null,
      canRemoveCategoryInZeroResultExpansion: true,
    }),
  );
  for (const listings of [result.current.cards, result.current.mapListings]) {
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({ id: "sold", sold_at: rows[0].sold_at, price_nok: 1000 });
    expect(listings[1]).toMatchObject({ id: "active", sold_at: null, price_nok: 0 });
  }
});

it.each([
  [{ omregistreringsavgift_override_kr: 3000 }, 253000],
  [{ omregistreringsavgift_override_kr: 3000, omregistreringsavgift_fritatt: true }, 250000],
  [{ omregistreringsavgift_override_kr: 3000, omregistreringsavgift_inkludert: true }, 250000],
])("KG-33-F03: kartet og kortene har samme kjøretøypris (%j)", (attributes, price) => {
  Object.assign(rows[0], { category_slug: "bil", attributes, price_nok: 250000 });
  const { result } = renderHook(() =>
    useSearchResultsShell({
      search: searchSchema.parse({}),
      navigate: vi.fn(),
      categories: [],
      allFilters: [],
      qDraft: "",
      setQDraft: vi.fn(),
      resolveCategoryId: () => null,
      canRemoveCategoryInZeroResultExpansion: true,
    }),
  );
  expect(result.current.mapListings[0].price_nok).toBe(price);
  expect(result.current.cards[0]).toMatchObject({ mileage_km: 85000, engine_hours: 123 });
});
